import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IDataObject,
	IHttpRequestHelper,
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
	 * cobra CXM WEB CONNECT does not accept static API keys. A bearer token is requested
	 * from POST /api/Token with user name and password. The token is short-lived (the
	 * cobra documentation shows a lifetime of roughly two minutes), so n8n calls this
	 * method again whenever a request comes back as 401.
	 */
	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/api/Token`,
			body: {
				userName: credentials.userName,
				password: credentials.password,
			},
			json: true,
			skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
		})) as ITokenResponse;

		if (response?.success !== true || !response?.token) {
			throw new Error(
				'cobra CXM WEB CONNECT did not return a bearer token. Check the user name, the password and the licence status of the server.',
			);
		}

		return { sessionToken: response.token };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.sessionToken}}',
			},
		},
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
