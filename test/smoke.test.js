/* Smoke test for the compiled n8n-nodes-cobra-cxm package. */
const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = (p) => path.join(ROOT, 'dist', p);

const { CobraCxmApi } = require(D('credentials/CobraCxmApi.credentials.js'));
const { Cobra } = require(D('nodes/Cobra/Cobra.node.js'));
const { CobraTrigger } = require(D('nodes/CobraTrigger/CobraTrigger.node.js'));
const G = require(D('nodes/Cobra/GenericFunctions.js'));

let passed = 0;
const results = [];
function test(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(() => {
			passed++;
			results.push(`  PASS  ${name}`);
		})
		.catch((e) => {
			results.push(`  FAIL  ${name}\n          ${e.message}`);
		});
}

const NODE = { name: 'cobra', type: 'cobra', typeVersion: 1, position: [0, 0], parameters: {} };

// ---------------------------------------------------------------- helpers
function makeExecuteContext({ params, httpResponses, items }) {
	const calls = [];
	return {
		calls,
		ctx: {
			getNode: () => NODE,
			getInputData: () => items ?? [{ json: {} }],
			continueOnFail: () => false,
			getMode: () => 'manual',
			getTimezone: () => 'Europe/Berlin',
			getCredentials: async () => ({
				baseUrl: 'https://cobra.example.com:8443/',
				userName: 'u',
				password: 'p',
				allowUnauthorizedCerts: false,
			}),
			getNodeParameter: (name, index, fallback) => {
				if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
				if (fallback !== undefined) return fallback;
				throw new Error(`missing test parameter: ${name}`);
			},
			helpers: {
				httpRequestWithAuthentication: async function (credName, options) {
					calls.push({ credName, options });
					const next = httpResponses.shift();
					if (typeof next === 'function') return next(options);
					return next;
				},
				returnJsonArray: (arr) => (Array.isArray(arr) ? arr : [arr]).map((json) => ({ json })),
			},
		},
	};
}

async function main() {
	// ------------------------------------------------ credential
	const okToken = (opts, capture) => {
		if (capture) capture(opts);
		return { body: { success: true, token: 'JWT123' }, statusCode: 200 };
	};

	await test('credential: preAuthentication returns the bearer token', async () => {
		const cred = new CobraCxmApi();
		let seen;
		const helper = { helpers: { httpRequest: async (opts) => okToken(opts, (o) => (seen = o)) } };
		const out = await cred.preAuthentication.call(helper, {
			baseUrl: 'https://cobra.example.com:8443/',
			userName: 'alice',
			password: 'secret',
			apiKey: 'KEY-1',
			allowUnauthorizedCerts: true,
		});
		assert.deepStrictEqual(out, { sessionToken: 'JWT123' });
		assert.strictEqual(seen.url, 'https://cobra.example.com:8443/api/Token', 'trailing slash must be stripped');
		assert.strictEqual(seen.method, 'POST');
		assert.deepStrictEqual(seen.body, { userName: 'alice', password: 'secret' });
		assert.strictEqual(seen.skipSslCertificateValidation, true);
		assert.strictEqual(seen.ignoreHttpStatusErrors, true, 'reads the status instead of throwing a bare 401');
	});

	await test('credential: preAuthentication demands an API key up front', async () => {
		const cred = new CobraCxmApi();
		let called = false;
		const helper = { helpers: { httpRequest: async () => ((called = true), okToken({})) } };
		await assert.rejects(
			() => cred.preAuthentication.call(helper, { baseUrl: 'https://x', userName: 'a', password: 'b', apiKey: '  ' }),
			/No API key is set/,
		);
		assert.strictEqual(called, false, 'must not even hit the network without a key');
	});

	await test('credential: a 401 token response gives an actionable message, not a bare code', async () => {
		const cred = new CobraCxmApi();
		const helper = {
			helpers: { httpRequest: async () => ({ body: { success: false }, statusCode: 401 }) },
		};
		await assert.rejects(
			() =>
				cred.preAuthentication.call(helper, {
					baseUrl: 'https://x',
					userName: 'a',
					password: 'b',
					apiKey: 'wrong',
				}),
			/token request was rejected with 401/,
		);
	});

	await test('credential: API key travels as the ApiKey header on the token request', async () => {
		const cred = new CobraCxmApi();
		let seen;
		const helper = { helpers: { httpRequest: async (opts) => okToken(opts, (o) => (seen = o)) } };
		await cred.preAuthentication.call(helper, {
			baseUrl: 'https://cobra.example.com:8443',
			userName: 'alice',
			password: 'secret',
			apiKey: '  KEY-123  ',
		});
		assert.strictEqual(seen.headers.ApiKey, 'KEY-123', 'must be trimmed and sent as a header');
		// The cobra TokenRequest schema is additionalProperties:false, so the key must not
		// end up in the body or the server rejects the whole request.
		assert.deepStrictEqual(seen.body, { userName: 'alice', password: 'secret' });
	});

	await test('credential: authenticate adds Bearer, and ApiKey only when set', async () => {
		const cred = new CobraCxmApi();

		const withKey = await cred.authenticate(
			{ sessionToken: 'JWT9', apiKey: 'KEY-123' },
			{ url: 'https://x/api/Adressen', headers: { Accept: 'application/json' } },
		);
		assert.strictEqual(withKey.headers.Authorization, 'Bearer JWT9');
		assert.strictEqual(withKey.headers.ApiKey, 'KEY-123');
		assert.strictEqual(withKey.headers.Accept, 'application/json', 'existing headers survive');

		const withoutKey = await cred.authenticate(
			{ sessionToken: 'JWT9' },
			{ url: 'https://x/api/Adressen' },
		);
		assert.strictEqual(withoutKey.headers.Authorization, 'Bearer JWT9');
		assert.strictEqual(withoutKey.headers.ApiKey, undefined, 'must stay absent, not empty');
	});

	await test('credential: preAuthentication throws when success is false', async () => {
		const cred = new CobraCxmApi();
		const helper = {
			helpers: { httpRequest: async () => ({ body: { success: false, token: null }, statusCode: 200 }) },
		};
		await assert.rejects(
			() =>
				cred.preAuthentication.call(helper, {
					baseUrl: 'https://x',
					userName: 'a',
					password: 'b',
					apiKey: 'KEY-1',
				}),
			/did not return a bearer token/,
		);
	});

	await test('credential: shape is declared as n8n expects', async () => {
		const cred = new CobraCxmApi();
		assert.strictEqual(cred.name, 'cobraCxmApi');
		assert.strictEqual(typeof cred.authenticate, 'function', 'function form, so ApiKey can be conditional');
		assert.strictEqual(cred.test.request.url, '/api/Health');
		const names = cred.properties.map((p) => p.name);
		for (const required of ['baseUrl', 'userName', 'password', 'apiKey', 'sessionToken']) {
			assert.ok(names.includes(required), `property "${required}" is missing`);
		}
		const apiKey = cred.properties.find((p) => p.name === 'apiKey');
		assert.strictEqual(apiKey.required, true, 'API key is mandatory from 0.3.0 on');
		assert.strictEqual(apiKey.typeOptions.password, true, 'API key must be masked');
	});

	// ------------------------------------------------ pure helpers
	await test('normalizeEndpoint strips slashes and a leading api/', () => {
		assert.strictEqual(G.normalizeEndpoint('Adressen'), 'Adressen');
		assert.strictEqual(G.normalizeEndpoint('/Adressen/'), 'Adressen');
		assert.strictEqual(G.normalizeEndpoint('api/Adressen'), 'Adressen');
		assert.strictEqual(G.normalizeEndpoint('/api/Adressen'), 'Adressen');
	});

	await test('toDataProperties builds the cobra name/value list', () => {
		assert.deepStrictEqual(G.toDataProperties({ COMPANY1: 'p17', CITY: 'Konstanz' }), [
			{ name: 'COMPANY1', value: 'p17' },
			{ name: 'CITY', value: 'Konstanz' },
		]);
		assert.deepStrictEqual(G.toDataProperties({ A: undefined, B: '' }), [{ name: 'B', value: '' }]);
	});

	await test('toCriteriaDateTime renders a DevExpress literal in a timezone', () => {
		const d = new Date(Date.UTC(2026, 6, 20, 8, 5, 9));
		assert.strictEqual(G.toCriteriaDateTime(d, 'UTC'), '#2026-07-20 08:05:09#');
		assert.strictEqual(G.toCriteriaDateTime(d, 'Europe/Berlin'), '#2026-07-20 10:05:09#');
	});

	await test('escapeCriteriaString doubles single quotes', () => {
		assert.strictEqual(G.escapeCriteriaString("O'Brien"), "O''Brien");
	});

	await test('assertCobraResult throws on a soft error in a 2xx body', () => {
		const ctx = { getNode: () => NODE };
		assert.doesNotThrow(() => G.assertCobraResult(ctx, { errorMessage: null, errorType: 0, newId: 5 }, 'create', 0));
		assert.throws(
			() => G.assertCobraResult(ctx, { errorMessage: 'Constraint verletzt', errorType: 3 }, 'create', 0),
			/Constraint verletzt/,
		);
		assert.throws(() => G.assertCobraResult(ctx, { errorType: 4 }, 'delete', 0), /cobra rejected the request/);
		assert.doesNotThrow(() => G.assertCobraResult(ctx, [{ a: 1 }], 'create', 0), 'arrays are read results');
	});

	// ------------------------------------------------ node description
	await test('node: description is well formed', () => {
		const n = new Cobra();
		const d = n.description;
		assert.strictEqual(d.name, 'cobra');
		assert.strictEqual(d.usableAsTool, true);
		assert.deepStrictEqual(d.credentials, [{ name: 'cobraCxmApi', required: true }]);
		assert.ok(Array.isArray(d.properties) && d.properties.length > 0);
		const resource = d.properties.find((p) => p.name === 'resource');
		assert.ok(resource, 'resource property missing');
		assert.ok(resource.options.some((o) => o.value === 'record'));
	});

	await test('node: every loadOptionsMethod referenced actually exists', () => {
		const n = new Cobra();
		const available = new Set(Object.keys(n.methods.loadOptions));
		const referenced = new Set();
		const walk = (props) => {
			for (const p of props ?? []) {
				const m = p.typeOptions && p.typeOptions.loadOptionsMethod;
				if (m) referenced.add(m);
				if (Array.isArray(p.options)) {
					for (const o of p.options) {
						if (o && Array.isArray(o.values)) walk(o.values);
						else if (o && o.displayName && o.name && o.type) walk([o]);
					}
				}
			}
		};
		walk(n.description.properties);
		for (const r of referenced) {
			assert.ok(available.has(r), `loadOptionsMethod "${r}" is referenced but not implemented`);
		}
		assert.ok(referenced.size >= 3, `expected several dynamic pickers, found ${referenced.size}`);
	});

	await test('trigger: description is well formed', () => {
		const t = new CobraTrigger();
		assert.strictEqual(t.description.polling, true);
		assert.deepStrictEqual(t.description.inputs, []);
		assert.strictEqual(t.description.outputs.length, 1);
		assert.ok(typeof t.poll === 'function');
		assert.ok(t.methods.loadOptions.getDateFields);
	});

	// ------------------------------------------------ execute paths
	await test('execute record:getAll builds the right URL and query', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'getAll',
				endpoint: '/api/Adressen/',
				returnAll: false,
				limit: 25,
				options: { filterExpression: "Firma like 'A%'", orderBy: 'Firma DESC' },
			},
			httpResponses: [[{ ID: 1, COMPANY1: 'p17' }, { ID: 2, COMPANY1: 'cobra' }]],
		});
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/Adressen');
		assert.deepStrictEqual(calls[0].options.qs, {
			Top: 25,
			FilterExpression: "Firma like 'A%'",
			OrderBy: 'Firma DESC',
		});
		assert.strictEqual(calls[0].options.method, 'GET');
		assert.strictEqual(out[0].length, 2);
		assert.strictEqual(out[0][0].json.COMPANY1, 'p17');
		assert.deepStrictEqual(out[0][0].pairedItem, { item: 0 });
	});

	await test('execute record:getAll with Return All omits Top', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: { resource: 'record', operation: 'getAll', endpoint: 'Adressen', returnAll: true, options: {} },
			httpResponses: [[]],
		});
		await new Cobra().execute.call(ctx);
		assert.ok(calls[0].options.qs === undefined || calls[0].options.qs.Top === undefined, 'Top must not be sent');
	});

	await test('execute record:create converts fields to the name/value array', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'create',
				endpoint: 'Adressen',
				dataMode: 'json',
				fieldsJson: '{"COMPANY1":"p17 GmbH","CITY":"Konstanz"}',
				writeOptions: {},
			},
			httpResponses: [{ errorMessage: null, errorType: 0, newId: 4711 }],
		});
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.method, 'POST');
		assert.deepStrictEqual(calls[0].options.body, [
			{ name: 'COMPANY1', value: 'p17 GmbH' },
			{ name: 'CITY', value: 'Konstanz' },
		]);
		assert.strictEqual(out[0][0].json.newId, 4711);
	});

	await test('execute record:create surfaces a soft error as a failure', async () => {
		const { ctx } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'create',
				endpoint: 'Adressen',
				dataMode: 'json',
				fieldsJson: '{"COMPANY1":"x"}',
				writeOptions: {},
			},
			httpResponses: [{ errorMessage: 'Datensatz kann nicht erstellt werden', errorType: 3 }],
		});
		await assert.rejects(() => new Cobra().execute.call(ctx), /Datensatz kann nicht erstellt werden/);
	});

	await test('execute record:create honours auto-map and Fields to Ignore', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'create',
				endpoint: 'Adressen',
				dataMode: 'autoMapInputData',
				writeOptions: { ignoreFields: 'ID, DATECREATED' },
			},
			items: [{ json: { ID: 9, DATECREATED: 'x', COMPANY1: 'p17' } }],
			httpResponses: [{ errorType: 0, newId: 1 }],
		});
		await new Cobra().execute.call(ctx);
		assert.deepStrictEqual(calls[0].options.body, [{ name: 'COMPANY1', value: 'p17' }]);
	});

	await test('execute record:update targets the ID and uses PUT', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'update',
				endpoint: 'Adressen',
				recordId: 42,
				dataMode: 'json',
				fieldsJson: { CITY: 'Berlin' },
				writeOptions: {},
			},
			httpResponses: [{ errorType: 0 }],
		});
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.method, 'PUT');
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/Adressen/42');
		assert.strictEqual(out[0][0].json.id, 42);
	});

	await test('execute linkedRecord:getAll hits the nested path', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'linkedRecord',
				operation: 'getAll',
				endpoint: 'Adressen',
				linkedEndpoint: 'Kontakte',
				recordId: 7,
				returnAll: true,
				options: {},
			},
			httpResponses: [[{ ID: 1 }]],
		});
		await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/Adressen/7/Kontakte');
	});

	await test('execute search:mail passes MailSearch parameters', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'search',
				operation: 'mail',
				mailAddress: 'info@cobra.de',
				mailSearchMode: 'contains',
				returnAll: false,
				limit: 10,
			},
			httpResponses: [[{ ID: 3 }]],
		});
		await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/MailSearch');
		assert.deepStrictEqual(calls[0].options.qs, {
			Top: 10,
			MailAddress: 'info@cobra.de',
			SearchMode: 'contains',
		});
	});

	await test('execute system:healthCheck tolerates a 503 and does NOT authenticate', async () => {
		const { ctx } = makeExecuteContext({
			params: { resource: 'system', operation: 'healthCheck', failOnUnhealthy: false },
			httpResponses: [],
		});
		let unauthCall;
		ctx.helpers.httpRequest = async (opts) => {
			unauthCall = opts;
			return { statusCode: 503, body: { status: 'Unhealthy', healthChecks: [] } };
		};
		ctx.helpers.httpRequestWithAuthentication = async () => {
			throw new Error('health check must not use the authenticated helper');
		};
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(unauthCall.url, 'https://cobra.example.com:8443/api/Health');
		assert.strictEqual(unauthCall.ignoreHttpStatusErrors, true);
		assert.strictEqual(out[0][0].json.healthy, false);
		assert.strictEqual(out[0][0].json.statusCode, 503);
	});

	await test('execute system:healthCheck reports an unreachable server instead of throwing', async () => {
		const { ctx } = makeExecuteContext({
			params: { resource: 'system', operation: 'healthCheck', failOnUnhealthy: false },
			httpResponses: [],
		});
		ctx.helpers.httpRequest = async () => {
			throw new Error('connect ECONNREFUSED');
		};
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(out[0][0].json.healthy, false);
		assert.strictEqual(out[0][0].json.status, 'Unreachable');
	});

	await test('execute system:healthCheck can fail the node when asked', async () => {
		const { ctx } = makeExecuteContext({
			params: { resource: 'system', operation: 'healthCheck', failOnUnhealthy: true },
			httpResponses: [],
		});
		ctx.helpers.httpRequest = async () => ({ statusCode: 503, body: { status: 'Unhealthy' } });
		await assert.rejects(() => new Cobra().execute.call(ctx), /Unhealthy/);
	});

	await test('keyword:check maps 200 to assigned and 404 to not assigned', async () => {
		// Regression: cobra returns the keyword OBJECT on 200 (never the literal true) and
		// 404 when it is not assigned, so the old `response === true` check was wrong in
		// both directions.
		for (const [statusCode, expected] of [
			[200, true],
			[404, false],
		]) {
			const { ctx, calls } = makeExecuteContext({
				params: {
					resource: 'keyword',
					operation: 'check',
					endpoint: 'Adressen',
					keywordEndpoint: 'Stichwoerter',
					recordId: 5,
					keywordId: 181,
				},
				httpResponses: [{ statusCode, body: { ID: 181, Caption: 'Veranstaltungen' } }],
			});
			const out = await new Cobra().execute.call(ctx);
			assert.strictEqual(out[0][0].json.assigned, expected, `status ${statusCode}`);
			if (expected) assert.strictEqual(out[0][0].json.keyword.Caption, 'Veranstaltungen');
			// Auth and permission failures must still surface as errors.
			assert.deepStrictEqual(calls[0].options.ignoreHttpStatusErrors, {
				ignore: true,
				except: [401, 403, 405, 500, 503],
			});
		}
	});

	await test('credential: sessionToken is expirable so n8n re-authenticates on 401', () => {
		const cred = new CobraCxmApi();
		const token = cred.properties.find((p) => p.name === 'sessionToken');
		assert.strictEqual(token.typeOptions.expirable, true);
	});

	await test('multipart body is encoded by hand with a boundary header', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'image',
				operation: 'upload',
				endpoint: 'Adressen',
				recordId: 4,
				binaryPropertyName: 'data',
				imageDescription: 'Portrait',
			},
			httpResponses: [{ errorType: 0 }],
		});
		ctx.helpers.assertBinaryData = () => ({ fileName: 'a"b\r\n.jpg', mimeType: 'image/jpeg' });
		ctx.helpers.getBinaryDataBuffer = async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
		await new Cobra().execute.call(ctx);
		const opts = calls[0].options;
		const ct = opts.headers['content-type'];
		assert.match(ct, /^multipart\/form-data; boundary=/);
		const boundary = ct.split('boundary=')[1];
		assert.ok(Buffer.isBuffer(opts.body), 'body must be a Buffer so n8n forwards it verbatim');
		const text = opts.body.toString('latin1');
		assert.ok(text.startsWith(`--${boundary}\r\n`));
		assert.ok(text.includes('name="file"; filename="a_b__.jpg"'), 'quotes and newlines must be neutralised');
		assert.ok(text.includes('Content-Type: image/jpeg'));
		assert.ok(text.endsWith(`\r\n--${boundary}--\r\n`));
		assert.ok(opts.body.includes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'binary bytes must survive');
		assert.strictEqual(opts.json, undefined, 'multipart must not be flagged as JSON');
		assert.deepStrictEqual(opts.qs, { description: 'Portrait' });
	});

	await test('record:getAll with Return All + Page Size follows every page', async () => {
		const page = (n) => Array.from({ length: n }, (_, k) => ({ ID: Math.random() * 1e9 + k }));
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'getAll',
				endpoint: 'Adressen',
				returnAll: true,
				options: {},
				pagination: { pageSize: 3, pageId: 1 },
			},
			httpResponses: [page(3), page(3), page(2)],
		});
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(calls.length, 3, 'must stop on the short page');
		assert.deepStrictEqual(
			calls.map((c) => c.options.qs.PageId),
			[1, 2, 3],
		);
		assert.strictEqual(calls[0].options.qs.PageSize, 3);
		assert.strictEqual(calls[0].options.qs.Top, undefined, 'Top must never accompany paging');
		assert.strictEqual(out[0].length, 8);
	});

	await test('pagination breaks out when the server ignores PageId', async () => {
		const same = () => [{ ID: 1 }, { ID: 2 }];
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'getAll',
				endpoint: 'Adressen',
				returnAll: true,
				options: {},
				pagination: { pageSize: 2, pageId: 1 },
			},
			httpResponses: [same(), same(), same(), same()],
		});
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(calls.length, 2, 'repeated first record must stop the loop');
		assert.strictEqual(out[0].length, 2);
	});

	await test('execute keyword:assign posts the keywordId', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'keyword',
				operation: 'assign',
				endpoint: 'Adressen',
				keywordEndpoint: 'Stichwoerter',
				recordId: 5,
				keywordId: 12,
			},
			httpResponses: [{ errorType: 0 }],
		});
		await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/Adressen/5/Stichwoerter');
		assert.deepStrictEqual(calls[0].options.body, { keywordId: 12 });
	});

	await test('execute continueOnFail emits an error item instead of throwing', async () => {
		const { ctx } = makeExecuteContext({
			params: {
				resource: 'record',
				operation: 'create',
				endpoint: 'Adressen',
				dataMode: 'json',
				fieldsJson: '{"A":"1"}',
				writeOptions: {},
			},
			httpResponses: [{ errorMessage: 'nope', errorType: 4 }],
		});
		ctx.continueOnFail = () => true;
		const out = await new Cobra().execute.call(ctx);
		assert.strictEqual(out[0].length, 1);
		assert.match(out[0][0].json.error, /nope/);
	});

	await test('trigger poll: first run only sets the watermark', async () => {
		const staticData = {};
		const { ctx } = makeExecuteContext({
			params: { endpoint: 'Adressen', event: 'recordCreated', timestampField: 'DATECREATED', options: {} },
			httpResponses: [],
		});
		ctx.getWorkflowStaticData = () => staticData;
		ctx.getMode = () => 'trigger';
		const out = await new CobraTrigger().poll.call(ctx);
		assert.strictEqual(out, null);
		assert.ok(staticData.lastTimeChecked, 'watermark must be stored');
	});

	await test('trigger poll: builds a criteria filter and asks oldest-first', async () => {
		const staticData = { lastTimeChecked: new Date(Date.UTC(2026, 6, 20, 8, 0, 0)).toISOString() };
		const { ctx, calls } = makeExecuteContext({
			params: {
				endpoint: 'Adressen',
				event: 'recordCreated',
				timestampField: 'DATECREATED',
				options: { limit: 5, filterExpression: "Firma like 'A%'" },
			},
			httpResponses: [[{ ID: 1 }, { ID: 2 }]],
		});
		ctx.getWorkflowStaticData = () => staticData;
		ctx.getMode = () => 'trigger';
		const out = await new CobraTrigger().poll.call(ctx);
		const qs = calls[0].options.qs;
		assert.strictEqual(qs.FilterExpression, "[DATECREATED] > #2026-07-20 10:00:00# AND (Firma like 'A%')");
		assert.strictEqual(qs.OrderBy, 'DATECREATED ASC', 'ascending, so a burst is not truncated at the wrong end');
		assert.strictEqual(qs.Top, 5);
		assert.strictEqual(out[0].length, 2);
		assert.strictEqual(out[0][0].json.ID, 1, 'oldest change emitted first');
	});

	await test('trigger poll: a full page carries the watermark to the last emitted record', async () => {
		// Regression: a burst larger than the limit used to be silently skipped, because
		// the newest rows were taken and the watermark still jumped to "now".
		const staticData = { lastTimeChecked: new Date(Date.UTC(2026, 6, 20, 8, 0, 0)).toISOString() };
		const { ctx } = makeExecuteContext({
			params: {
				endpoint: 'Adressen',
				event: 'recordCreated',
				timestampField: 'DATECREATED',
				options: { limit: 2 },
			},
			httpResponses: [
				[
					{ ID: 1, DATECREATED: '2026-07-20T08:30:00.000Z' },
					{ ID: 2, DATECREATED: '2026-07-20T08:45:00.000Z' },
				],
			],
		});
		ctx.getWorkflowStaticData = () => staticData;
		ctx.getMode = () => 'trigger';
		await new CobraTrigger().poll.call(ctx);
		assert.strictEqual(
			staticData.lastTimeChecked,
			'2026-07-20T08:45:00.000Z',
			'watermark must stop at the last emitted record so the rest is picked up next poll',
		);
	});

	await test('trigger poll: the watermark tracks record time, not the wall clock', async () => {
		// Deriving it from the data keeps the trigger immune to clock skew between n8n
		// and the cobra server, and to the local clock stepping back at a DST boundary.
		const staticData = { lastTimeChecked: new Date(Date.UTC(2026, 6, 20, 8, 0, 0)).toISOString() };
		const { ctx } = makeExecuteContext({
			params: {
				endpoint: 'Adressen',
				event: 'recordCreated',
				timestampField: 'DATECREATED',
				options: { limit: 5 },
			},
			httpResponses: [[{ ID: 1, DATECREATED: '2026-07-20T08:30:00.000Z' }]],
		});
		ctx.getWorkflowStaticData = () => staticData;
		ctx.getMode = () => 'trigger';
		await new CobraTrigger().poll.call(ctx);
		assert.strictEqual(staticData.lastTimeChecked, '2026-07-20T08:30:00.000Z');
	});

	await test('trigger poll: an empty result advances the watermark to the poll time', async () => {
		const staticData = { lastTimeChecked: new Date(Date.UTC(2026, 6, 20, 8, 0, 0)).toISOString() };
		const { ctx } = makeExecuteContext({
			params: {
				endpoint: 'Adressen',
				event: 'recordCreated',
				timestampField: 'DATECREATED',
				options: { limit: 5 },
			},
			httpResponses: [[]],
		});
		ctx.getWorkflowStaticData = () => staticData;
		ctx.getMode = () => 'trigger';
		const out = await new CobraTrigger().poll.call(ctx);
		assert.strictEqual(out, null);
		assert.ok(new Date(staticData.lastTimeChecked).getTime() > Date.UTC(2026, 6, 20, 8, 0, 0));
	});

	await test('trigger: Record Updated refuses to silently fall back to DateCreated', async () => {
		const { ctx } = makeExecuteContext({
			params: { endpoint: 'Adressen', event: 'recordUpdated', timestampField: '', options: {} },
			httpResponses: [{ endpointFields: [{ name: 'DATECREATED', fieldType: 42 }] }],
		});
		ctx.getWorkflowStaticData = () => ({ lastTimeChecked: new Date().toISOString() });
		ctx.getMode = () => 'trigger';
		await assert.rejects(() => new CobraTrigger().poll.call(ctx), /no field of the cobra type DateModified/);
	});

	await test('execute document:upload sends multipart and does not flag json', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'document',
				operation: 'upload',
				endpoint: 'Adressen',
				recordId: 8,
				documentField: 'Dokument 1',
				binaryPropertyName: 'data',
				overwrite: true,
			},
			httpResponses: ['{"errorMessage":null,"errorType":0,"fileName":"angebot.pdf"}'],
		});
		ctx.helpers.assertBinaryData = () => ({ fileName: 'angebot.pdf', mimeType: 'application/pdf' });
		ctx.helpers.getBinaryDataBuffer = async () => Buffer.from('%PDF-1.4 test');
		const out = await new Cobra().execute.call(ctx);
		const opts = calls[0].options;
		assert.strictEqual(opts.method, 'POST');
		assert.strictEqual(
			opts.url,
			'https://cobra.example.com:8443/api/Adressen/8/Documents/Dokument%201',
			'document field must be URL encoded',
		);
		assert.ok(Buffer.isBuffer(opts.body), 'body must be a pre-encoded multipart Buffer');
		assert.strictEqual(opts.json, undefined, 'json must not be set for multipart uploads');
		assert.deepStrictEqual(opts.qs, { overwrite: true });
		const text = opts.body.toString('latin1');
		assert.ok(text.includes('filename="angebot.pdf"'));
		assert.ok(text.includes('Content-Type: application/pdf'));
		assert.ok(text.includes('%PDF-1.4 test'), 'file bytes must survive');
		assert.strictEqual(out[0][0].json.fileName, 'angebot.pdf', 'string response must be parsed');
	});

	await test('execute document:upload surfaces a soft upload error', async () => {
		const { ctx } = makeExecuteContext({
			params: {
				resource: 'document',
				operation: 'upload',
				endpoint: 'Adressen',
				recordId: 8,
				documentField: 'Dok',
				binaryPropertyName: 'data',
				overwrite: false,
			},
			httpResponses: [{ errorMessage: 'Es existiert bereits ein Dokument', errorType: 4 }],
		});
		ctx.helpers.assertBinaryData = () => ({ fileName: 'a.pdf', mimeType: 'application/pdf' });
		ctx.helpers.getBinaryDataBuffer = async () => Buffer.from('x');
		await assert.rejects(() => new Cobra().execute.call(ctx), /Es existiert bereits ein Dokument/);
	});

	await test('execute image:download returns binary with the right request options', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'image',
				operation: 'download',
				endpoint: 'Adressen',
				recordId: 12,
				binaryPropertyName: 'photo',
				preview: true,
			},
			httpResponses: [
				{
					body: Buffer.from('JPEGDATA'),
					headers: { 'content-type': 'image/jpeg', 'content-disposition': 'attachment; filename="bild.jpg"' },
				},
			],
			items: [{ json: { keep: 'me' } }],
		});
		let prepared;
		ctx.helpers.prepareBinaryData = async (buf, fileName, mimeType) => {
			prepared = { text: buf.toString(), fileName, mimeType };
			return prepared;
		};
		const out = await new Cobra().execute.call(ctx);
		const opts = calls[0].options;
		assert.strictEqual(opts.encoding, 'arraybuffer');
		assert.strictEqual(opts.returnFullResponse, true);
		assert.strictEqual(opts.json, false);
		assert.deepStrictEqual(opts.qs, { preview: true });
		assert.strictEqual(prepared.text, 'JPEGDATA');
		assert.strictEqual(prepared.fileName, 'bild.jpg', 'filename from content-disposition');
		assert.strictEqual(prepared.mimeType, 'image/jpeg');
		assert.strictEqual(out[0][0].json.keep, 'me', 'input json must be preserved');
		assert.ok(out[0][0].binary.photo);
	});

	await test('execute user:update uses PATCH on the Usermanagement path', async () => {
		const { ctx, calls } = makeExecuteContext({
			params: {
				resource: 'user',
				operation: 'update',
				userId: 3,
				userUpdateFields: { name: 'Neuer Name' },
			},
			httpResponses: [{ errorType: 0 }],
		});
		await new Cobra().execute.call(ctx);
		assert.strictEqual(calls[0].options.method, 'PATCH');
		assert.strictEqual(calls[0].options.url, 'https://cobra.example.com:8443/api/Usermanagement/Users/3');
		assert.deepStrictEqual(calls[0].options.body, { name: 'Neuer Name' });
	});

	await test('metadata:get accepts both the wrapper and a bare array', async () => {
		for (const payload of [
			{ endpointFields: [{ name: 'COMPANY1', caption: 'Firma' }] },
			[{ name: 'COMPANY1', caption: 'Firma' }],
		]) {
			const { ctx } = makeExecuteContext({
				params: { resource: 'metadata', operation: 'get', endpoint: 'Adressen', splitFields: true },
				httpResponses: [payload],
			});
			const out = await new Cobra().execute.call(ctx);
			assert.strictEqual(out[0].length, 1);
			assert.strictEqual(out[0][0].json.name, 'COMPANY1');
		}
	});

	console.log(results.join('\n'));
	console.log(`\n${passed}/${results.length} assertions passed`);
	process.exit(passed === results.length ? 0 : 1);
}

main();

