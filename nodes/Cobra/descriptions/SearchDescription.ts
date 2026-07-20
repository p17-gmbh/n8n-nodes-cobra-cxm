import type { INodeProperties } from 'n8n-workflow';

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['search'],
			},
		},
		options: [
			{
				name: 'Search by Email',
				value: 'mail',
				description: 'Search all email fields of the address table (MailSearch)',
				action: 'Search by email',
			},
			{
				name: 'Search by Phone Number',
				value: 'phone',
				description: 'Search the phone index for a number (PhoneSearch)',
				action: 'Search by phone number',
			},
		],
		default: 'mail',
	},
];

export const searchFields: INodeProperties[] = [
	{
		displayName: 'Email',
		name: 'mailAddress',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'info@cobra.de',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: ['mail'],
			},
		},
		description: 'Email address to look for',
	},
	{
		displayName: 'Search Mode',
		name: 'mailSearchMode',
		type: 'options',
		default: 'equals',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: ['mail'],
			},
		},
		options: [
			{
				name: 'Contains',
				value: 'contains',
			},
			{
				name: 'Ends With',
				value: 'endswith',
			},
			{
				name: 'Equals',
				value: 'equals',
			},
			{
				name: 'Starts With',
				value: 'startsWith',
			},
		],
		description: 'How the email address is matched',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+49 7531 8101 0',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: ['phone'],
			},
		},
		description: 'Phone number to look for',
	},
	{
		displayName: 'Search Mode',
		name: 'phoneSearchMode',
		type: 'options',
		default: 'equals',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: ['phone'],
			},
		},
		options: [
			{
				name: 'Contains',
				value: 'contains',
			},
			{
				name: 'Equals',
				value: 'equals',
			},
			{
				name: 'Starts With',
				value: 'startsWith',
			},
		],
		description: 'How the phone number is matched',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['search'],
			},
		},
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				resource: ['search'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
];
