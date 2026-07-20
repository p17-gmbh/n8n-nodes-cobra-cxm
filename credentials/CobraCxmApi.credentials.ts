import type {
	IAuthenticate,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IDataObject,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

interface ITokenResponse {
	success?: boolean;
	token?: string;
}

export class CobraCxmApi implements ICredentialType {
	name = 'cobraCxmApi';

	displayName = 'Cobra CXM WEB CONNECT API';

	icon: Icon = {
		light: 'file:../icons/p17-crm-logo.svg',
		dark: 'file:../icons/p17-crm-logo.dark.svg',
	};

	documentationUrl = 'https://webconnect.cobra-hilfe.de/docs/webconnect/Authentifizierung';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://cobra.example.com:8443',
			description:
				'Base URL of the cobra CXM WEB CONNECT server, including protocol and port. Do not append "/api" — the nodes add it themselves.',
		},
		{
			displayName: 'User Name',
			name: 'userName',
			type: 'string',
			default: '',
			required: true,
			description: 'cobra user name used to request the bearer token',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Password of the cobra user',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'API key of the cobra CXM WEB CONNECT server, sent as the "ApiKey" header on the token request and on every subsequent call',
		},
		// eslint-disable-next-line @n8n/community-nodes/credential-password-field -- a boolean switch, not a secret; masking it would hide its own state from the user
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if SSL certificate validation fails. Enable this only for servers using a self-signed certificate.',
		},
		{
			displayName: 'Session Token',
			name: 'sessionToken',
			type: 'hidden',
			default: '',
			description:
				'Filled automatically by requesting POST /api/Token. cobra bearer tokens are short-lived; n8n refreshes them on demand.',
			// "expirable" is what makes n8n re-run preAuthentication once a request comes
			// back as 401. Without it the ~2 minute cobra token would be cached until the
			// credential is edited by hand, and every later request would fail.
			typeOptions: { password: true, expirable: true },
		},
	];

	/**
	 * A bearer token is requested from POST /api/Token with user name and password. The
	 * token is short-lived (the cobra documentation shows a lifetime of roughly two
	 * minutes), so n8n calls this method again whenever a request comes back as 401.
	 *
	 * Servers configured for API key authorisation additionally expect the key in an
	 * "ApiKey" header. It cannot travel in the body: the cobra TokenRequest schema
	 * declares "additionalProperties: false", so an extra body field is rejected.
	 */
	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');
		const apiKey = ((credentials.apiKey as string | undefined) ?? '').trim();

		if (apiKey === '') {
			throw new Error(
				'No API key is set on the cobra credential. Open the credential, fill in the API Key field and save it. ' +
					'(Credentials created before version 0.2.2 have no API key yet.)',
			);
		}

		// The status is read explicitly instead of letting a 401 throw a bare
		// "Request failed with status code 401", so a rejected token request produces a
		// message that points at the real cause and is clearly distinct from a later
		// failure on a data endpoint.
		const { body, statusCode } = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/api/Token`,
			body: {
				userName: credentials.userName,
				password: credentials.password,
			},
			headers: { ApiKey: apiKey },
			json: true,
			skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as { body: ITokenResponse; statusCode: number };

		if (statusCode === 401) {
			throw new Error(
				'The cobra token request was rejected with 401. The API key, the user name or the password is wrong, ' +
					'or the server licence is invalid.',
			);
		}

		if (statusCode < 200 || statusCode >= 300 || body?.success !== true || !body?.token) {
			throw new Error(
				`cobra CXM WEB CONNECT did not return a bearer token (HTTP ${statusCode}). ` +
					'Check the user name, the password, the API key and the licence status of the server.',
			);
		}

		return { sessionToken: body.token };
	}

	/**
	 * The function form is used instead of the declarative one so the "ApiKey" header can
	 * be omitted entirely when no key is configured. A declarative header would always be
	 * sent and would resolve to an empty string for the many installations that do not
	 * use API key authorisation.
	 */
	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const apiKey = ((credentials.apiKey as string | undefined) ?? '').trim();

		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${credentials.sessionToken as string}`,
			...(apiKey !== '' ? { ApiKey: apiKey } : {}),
		};

		return requestOptions;
	};

	/**
	 * /api/Health is unauthenticated, but the token request in preAuthentication runs
	 * before it. So a wrong user name or password fails the test with a clear message,
	 * while a healthy 200 also proves the databases and the licence are reachable.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/Health',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.allowUnauthorizedCerts}}',
		},
	};
}
