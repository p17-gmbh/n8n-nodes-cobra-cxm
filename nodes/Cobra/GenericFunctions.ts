import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const CREDENTIALS_NAME = 'cobraCxmApi';

/** Every context the shared request helpers may run in. */
export type CobraContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/** cobra writes take a list of field name/value pairs instead of a plain object. */
export interface ICobraDataProperty {
	name: string;
	value: unknown;
}

/** Subset of EndpointMetadata that the field pickers rely on. */
export interface ICobraFieldMetadata {
	name?: string;
	caption?: string;
	fieldType?: number;
	databaseFieldType?: number;
	permission?: number;
	size?: number;
	selectionList?: string[];
}

export interface ICobraEndpointMetadata {
	endpointFields?: ICobraFieldMetadata[];
	permission?: number;
}

/** cobra database field types that hold a date or a date and time. */
const DATE_DATABASE_FIELD_TYPE = 4;

/** cobra semantic field types used to pre-select a polling timestamp field. */
export const FIELD_TYPE_DATE_CREATED = 42;
export const FIELD_TYPE_DATE_MODIFIED = 43;

/** cobra semantic field types that can hold a document of the document management. */
const DOCUMENT_FIELD_TYPES = new Set([
	78, // FileName
	79, // DocClass
	133, // DocumentLink
	136, // DocumentReference
]);

/** FieldPermission / EndpointPermission are bit flags: 1 = read, 2 = write. */
const PERMISSION_WRITE = 2;

/**
 * Turns whatever the user typed into a bare endpoint name.
 * Accepts "Adressen", "/Adressen", "api/Adressen" and "/api/Adressen/".
 */
export function normalizeEndpoint(endpoint: string): string {
	return (endpoint ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '')
		.replace(/^api\//i, '');
}

/** Escapes a value for use inside a DevExpress criteria language string literal. */
export function escapeCriteriaString(value: string): string {
	return value.replace(/'/g, "''");
}

/**
 * Formats a date as a DevExpress criteria language date-time literal.
 *
 * cobra evaluates these literals against SQL Server datetime columns, which hold
 * local server time rather than UTC. The value is therefore rendered in the
 * workflow timezone so that a correctly configured n8n instance and the cobra
 * server agree on what "now" means.
 */
export function toCriteriaDateTime(date: Date, timeZone?: string): string {
	if (!timeZone) {
		const pad = (n: number) => `${n}`.padStart(2, '0');
		return (
			`#${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
			`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}#`
		);
	}

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(date);

	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
	// Intl renders midnight as hour 24 in some environments.
	const hour = get('hour') === '24' ? '00' : get('hour');

	return `#${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}#`;
}

const HTTP_STATUS_HINTS: Record<number, string> = {
	401: 'Authentication failed. Check the user name, the password and the licence status of the cobra server.',
	403: 'The cobra user is not allowed to access this endpoint.',
	404: 'Endpoint or record not found. Check the endpoint name and the record ID.',
	405: 'The cobra endpoint does not grant this permission. Adjust the read/write/delete rights of the endpoint in the cobra CXM WEB CONNECT configuration.',
	500: 'The cobra server reported an internal error.',
	503: 'The cobra server is unhealthy. Run the "System > Health Check" operation to see which check failed.',
};

/**
 * cobra reports two different kinds of failure. Transport problems arrive as HTTP
 * status codes, but a create/update/delete can also answer 2xx and carry an
 * "errorMessage" plus a numeric "errorType" in the body. Both are mapped to
 * proper n8n errors so that a workflow never silently continues on a failed write.
 */
const COBRA_ERROR_TYPES: Record<string, Record<number, string>> = {
	create: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'The record violates a database constraint.',
		4: 'Unclassified error.',
	},
	update: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'The record violates a database constraint.',
		4: 'Record not found.',
		5: 'Unclassified error.',
	},
	delete: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'Record not found.',
		4: 'Unclassified error.',
	},
	documentUpload: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'No field permission.',
		4: 'A document already exists. Enable "Overwrite" to replace it.',
		5: 'Invalid file extension.',
		6: 'Invalid file signature.',
		7: 'Invalid file size, or no file was transmitted.',
		8: 'The cobra document management is not active.',
		9: 'Unclassified error.',
	},
	imageUpload: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'Invalid file extension.',
		4: 'Invalid file signature.',
		5: 'Invalid file size, or no file was transmitted.',
		6: 'Unclassified error.',
	},
	imageDelete: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'No field permission.',
		4: 'Image not found.',
		5: 'Unclassified error.',
	},
	keyword: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'No field permission.',
	},
	userCreate: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'The user already exists.',
		4: 'Unclassified error.',
	},
	userUpdate: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'User not found.',
		4: 'The user already exists.',
		5: 'Changing the password is not allowed.',
		6: 'Unclassified error.',
	},
	groupAssign: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'User or group not found.',
		4: 'Unclassified error.',
	},
	attributeUpdate: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'User not found.',
		4: 'Unclassified error.',
	},
	groupCreate: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'The group already exists.',
		4: 'Unclassified error.',
	},
	groupUpdate: {
		1: 'The cobra server has no valid licence.',
		2: 'Invalid user name and/or password.',
		3: 'Group not found.',
		4: 'The group already exists.',
		5: 'Unclassified error.',
	},
	// The cobra specification declares ApplicationResultError and SqlResultError without
	// documenting their members, so only the message from the server can be reported.
	script: {},
	sql: {},
};

export type CobraResultKind = keyof typeof COBRA_ERROR_TYPES;

/**
 * Raises a node error when a 2xx cobra result object carries a soft failure.
 * cobra answers e.g. POST with HTTP 201 even when the record was rejected.
 */
export function assertCobraResult(
	context: CobraContext,
	response: unknown,
	kind: CobraResultKind,
	itemIndex: number,
): void {
	if (response === null || typeof response !== 'object' || Array.isArray(response)) return;

	const result = response as IDataObject;
	const errorMessage = result.errorMessage as string | null | undefined;
	const errorType = result.errorType as number | undefined;

	const hasMessage = typeof errorMessage === 'string' && errorMessage.trim() !== '';
	const hasType = typeof errorType === 'number' && errorType !== 0;

	if (!hasMessage && !hasType) return;

	const description = hasType ? COBRA_ERROR_TYPES[kind]?.[errorType] : undefined;

	throw new NodeOperationError(
		context.getNode(),
		hasMessage ? (errorMessage as string) : 'cobra rejected the request.',
		{
			itemIndex,
			description: description ?? (hasType ? `cobra error type ${errorType}.` : undefined),
		},
	);
}

/**
 * Performs an authenticated request against the cobra Web API.
 * The bearer token is handled by the credential's preAuthentication hook, which n8n
 * re-runs automatically when a request is rejected with 401 because the token expired.
 */
export async function cobraApiRequest(
	this: CobraContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject | IDataObject[] | ICobraDataProperty[] | Buffer | FormData,
	qs?: IDataObject,
	overrides: Partial<IHttpRequestOptions> = {},
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIALS_NAME);
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

	// Uploads carry a pre-encoded multipart body plus their own content type. Flagging
	// such a request as JSON would make n8n negotiate the wrong representation, so it
	// opts out of "json" and parses the answer afterwards.
	const contentType = (overrides.headers?.['content-type'] ?? overrides.headers?.['Content-Type']) as
		| string
		| undefined;
	const isMultipart = contentType?.startsWith('multipart/') === true;

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
		...(isMultipart ? {} : { json: true }),
		...overrides,
	};

	if (qs !== undefined && Object.keys(qs).length > 0) {
		options.qs = qs;
	}
	if (body !== undefined) {
		options.body = body as IHttpRequestOptions['body'];
	}

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIALS_NAME,
			options,
		);

		if (isMultipart && typeof response === 'string') {
			try {
				return JSON.parse(response) as unknown;
			} catch {
				return response;
			}
		}

		return response;
	} catch (error) {
		const statusCode = Number(
			(error as IDataObject)?.httpCode ??
				((error as IDataObject)?.response as IDataObject)?.status ??
				(error as IDataObject)?.statusCode,
		);
		const description = HTTP_STATUS_HINTS[statusCode];

		throw new NodeApiError(this.getNode(), error as JsonObject, {
			...(description !== undefined ? { description } : {}),
		});
	}
}

/**
 * Encodes a single file as a multipart/form-data body.
 *
 * n8n only recognises `form-data` package instances (it calls `body.getHeaders()`),
 * so a native FormData would travel without a boundary header and leave the encoding
 * to whatever axios version is installed. Building the body here keeps the request
 * byte-for-byte predictable and adds no runtime dependency.
 */
export function buildMultipartBody(
	fieldName: string,
	fileName: string,
	mimeType: string,
	content: Buffer,
): { body: Buffer; contentType: string } {
	const boundary = `----n8nCobraFormBoundary${Date.now().toString(16)}${Math.random()
		.toString(16)
		.slice(2)}`;

	// A quote or newline in the file name would otherwise break out of the header.
	const safeName = fileName.replace(/["\r\n]/g, '_');

	const header = Buffer.from(
		`--${boundary}\r\n` +
			`Content-Disposition: form-data; name="${fieldName}"; filename="${safeName}"\r\n` +
			`Content-Type: ${mimeType}\r\n\r\n`,
		'utf8',
	);
	const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

	return {
		body: Buffer.concat([header, content, footer]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/** Upper bound on automatic paging, so a server that ignores PageId cannot loop forever. */
const MAX_PAGES = 1000;

/**
 * Fetches a collection, following pages when a page size was configured.
 *
 * cobra documents neither a total count nor a last-page marker, so the only usable
 * stop condition is a page that comes back shorter than the requested size. A page
 * counter and a repeated-first-record check guard against a server that silently
 * ignores PageId, which would otherwise re-fetch page one forever.
 */
export async function cobraApiRequestAllItems(
	this: CobraContext,
	path: string,
	qs: IDataObject,
	pageSize: number,
	firstPageId: number,
): Promise<IDataObject[]> {
	const collected: IDataObject[] = [];
	let pageId = firstPageId;
	let previousFingerprint: string | undefined;

	for (let page = 0; page < MAX_PAGES; page++) {
		const response = await cobraApiRequest.call(this, 'GET', path, undefined, {
			...qs,
			PageSize: pageSize,
			PageId: pageId,
		});

		const records = Array.isArray(response) ? (response as IDataObject[]) : [];
		if (records.length === 0) break;

		const fingerprint = JSON.stringify(records[0]);
		if (fingerprint === previousFingerprint) {
			// The server returned the same first record again, so PageId is being ignored.
			break;
		}
		previousFingerprint = fingerprint;

		collected.push(...records);

		if (records.length < pageSize) break;
		pageId++;
	}

	return collected;
}

/**
 * Calls GET /api/Health WITHOUT authentication.
 *
 * The health endpoint is deliberately unauthenticated, and that matters here: an
 * expired licence or an unreachable database makes POST /api/Token fail, so going
 * through the authenticated helper would abort in preAuthentication and report a
 * login problem instead of the health report the user asked for.
 */
export async function cobraHealthRequest(
	this: CobraContext,
): Promise<{ body: IDataObject; statusCode: number }> {
	const credentials = await this.getCredentials(CREDENTIALS_NAME);
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

	try {
		// eslint-disable-next-line @n8n/community-nodes/no-http-request-with-manual-auth -- /api/Health takes no auth; the credential is read only for the base URL and the TLS setting. Going through httpRequestWithAuthentication would run preAuthentication first, so an unlicensed or database-less server would fail the token request and report a login error instead of the health report this operation exists to produce.
		const response = (await this.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/api/Health`,
			json: true,
			skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as { body: IDataObject; statusCode: number };

		return { body: response?.body ?? {}, statusCode: response?.statusCode ?? 0 };
	} catch (error) {
		// A connection refused or a DNS failure is itself a health answer.
		return {
			body: { status: 'Unreachable', error: (error as Error).message },
			statusCode: 0,
		};
	}
}

/**
 * Converts a flat object into the name/value list that cobra expects for writes.
 * Keys with an undefined value are skipped so that partial updates stay partial.
 */
export function toDataProperties(fields: IDataObject): ICobraDataProperty[] {
	return Object.keys(fields)
		.filter((name) => fields[name] !== undefined)
		.map((name) => ({ name, value: fields[name] as unknown }));
}

/** Parses the "Fields (JSON)" input, accepting both an object and a JSON string. */
export function parseJsonFields(
	context: CobraContext,
	value: unknown,
	itemIndex: number,
	parameterName: string,
): IDataObject {
	let parsed: unknown = value;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return {};
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new NodeOperationError(
				context.getNode(),
				`The value of "${parameterName}" is not valid JSON`,
				{ itemIndex },
			);
		}
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(
			context.getNode(),
			`"${parameterName}" must be a JSON object with field names as keys`,
			{ itemIndex },
		);
	}

	return parsed as IDataObject;
}

/**
 * Reads the field metadata of an endpoint. Used by the dynamic field pickers.
 *
 * The cobra documentation and the OpenAPI specification disagree on the shape of
 * this response: the spec declares an EndpointMetadata object with an
 * "endpointFields" array, while the docs show a bare array of fields. Both are
 * accepted here so the field pickers keep working on either server version.
 */
export async function getEndpointMetadata(
	this: CobraContext,
	endpoint: string,
): Promise<ICobraEndpointMetadata> {
	const normalized = normalizeEndpoint(endpoint);
	if (normalized === '') return {};

	const metadata = await cobraApiRequest.call(this, 'GET', `/api/${normalized}/Metadata`);

	if (Array.isArray(metadata)) {
		return { endpointFields: metadata as ICobraFieldMetadata[] };
	}

	return (metadata as ICobraEndpointMetadata) ?? {};
}

function toFieldOption(field: ICobraFieldMetadata): INodePropertyOptions {
	const name = field.name ?? '';
	const caption = field.caption?.trim();

	return {
		name: caption && caption !== name ? `${caption} (${name})` : name,
		value: name,
		description: describeField(field),
	};
}

function describeField(field: ICobraFieldMetadata): string {
	const parts: string[] = [];
	if (field.size) parts.push(`max. ${field.size} characters`);
	if (field.selectionList?.length) {
		parts.push(`selection list: ${field.selectionList.slice(0, 8).join(', ')}`);
	}
	return parts.join(' — ');
}

/**
 * Loads the fields of the endpoint currently selected in the node.
 * `writableOnly` filters on the write bit of the cobra field permission.
 */
export async function loadEndpointFields(
	context: ILoadOptionsFunctions,
	endpointParameter: string,
	options: { writableOnly?: boolean; dateOnly?: boolean; documentOnly?: boolean } = {},
): Promise<INodePropertyOptions[]> {
	const endpoint = context.getCurrentNodeParameter(endpointParameter) as string | undefined;
	if (!endpoint) return [];

	const metadata = await getEndpointMetadata.call(context, endpoint);
	const fields = metadata.endpointFields ?? [];

	// Narrow to document fields when possible, but fall back to the full list rather
	// than showing nothing if this cobra version reports no recognisable document type.
	const documentFields =
		options.documentOnly === true
			? fields.filter((field) => DOCUMENT_FIELD_TYPES.has(field.fieldType ?? -1))
			: [];
	const candidates =
		options.documentOnly === true && documentFields.length > 0 ? documentFields : fields;

	return candidates
		.filter((field) => (field.name ?? '') !== '')
		.filter((field) => {
			// A server that does not report permissions must not end up with an empty
			// picker, so an unknown permission is treated as "allowed".
			if (options.writableOnly !== true || field.permission === undefined) return true;
			return (field.permission & PERMISSION_WRITE) === PERMISSION_WRITE;
		})
		.filter((field) => {
			if (options.dateOnly !== true) return true;
			// Same reasoning as above: never hand back an empty picker just because the
			// server did not report a database field type.
			if (field.databaseFieldType === undefined) return true;
			return field.databaseFieldType === DATE_DATABASE_FIELD_TYPE;
		})
		.map(toFieldOption)
		.sort((a, b) => a.name.localeCompare(b.name));
}
