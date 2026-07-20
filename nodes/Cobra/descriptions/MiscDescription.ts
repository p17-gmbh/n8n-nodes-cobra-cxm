import type { INodeProperties } from 'n8n-workflow';

export const metadataOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['metadata'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the field metadata of an endpoint',
				action: 'Get endpoint metadata',
			},
		],
		default: 'get',
	},
];

export const metadataFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['metadata'],
			},
		},
		description: 'Name of the cobra endpoint whose metadata is read',
	},
	{
		displayName: 'Split Fields Into Items',
		name: 'splitFields',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['metadata'],
			},
		},
		description:
			'Whether to return one item per endpoint field instead of a single item holding the whole metadata document',
	},
];

export const systemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['system'],
			},
		},
		options: [
			{
				name: 'Health Check',
				value: 'healthCheck',
				description: 'Check whether the cobra server, its databases and its licence are available',
				action: 'Run a health check',
			},
		],
		default: 'healthCheck',
	},
];

export const systemFields: INodeProperties[] = [
	{
		displayName: 'Fail on Unhealthy',
		name: 'failOnUnhealthy',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['system'],
				operation: ['healthCheck'],
			},
		},
		description:
			'Whether to fail the node when the server reports an unhealthy state. When disabled, the report is returned as regular data so a workflow can branch on it.',
	},
];

export const scriptOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['script'],
			},
		},
		options: [
			{
				name: 'Execute',
				value: 'execute',
				description: 'Run a script or application configured on the cobra server',
				action: 'Execute a script',
			},
		],
		default: 'execute',
	},
];

export const scriptFields: INodeProperties[] = [
	{
		displayName: 'Script Name',
		name: 'scriptName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'SampleApplication',
		displayOptions: {
			show: {
				resource: ['script'],
			},
		},
		description:
			'Name of the script endpoint as configured on the server, resulting in a request to /api/Scripts/{script name}',
	},
	{
		displayName: 'Arguments',
		name: 'scriptArguments',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['script'],
			},
		},
		description: 'Optional argument string passed to the script',
	},
];

export const sqlOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['sql'],
			},
		},
		options: [
			{
				name: 'Execute',
				value: 'execute',
				description: 'Run an SQL command configured on the cobra server',
				action: 'Execute an SQL command',
			},
		],
		default: 'execute',
	},
];

export const sqlFields: INodeProperties[] = [
	{
		displayName: 'Command Name',
		name: 'commandName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'SampleSqlCommand',
		displayOptions: {
			show: {
				resource: ['sql'],
			},
		},
		description:
			'Name of the SQL command as configured on the server, resulting in a request to /api/Sql/{command name}. Only commands predefined by an administrator can be run.',
	},
];
