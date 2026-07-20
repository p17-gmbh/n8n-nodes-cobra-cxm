import type { INodeProperties } from 'n8n-workflow';

export const keywordOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['keyword'],
			},
		},
		options: [
			{
				name: 'Assign',
				value: 'assign',
				description: 'Assign a keyword to a record',
				action: 'Assign a keyword',
			},
			{
				name: 'Check',
				value: 'check',
				description: 'Check whether a keyword is assigned to a record',
				action: 'Check a keyword',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many keywords assigned to a record',
				action: 'Get many keywords',
			},
			{
				name: 'Remove',
				value: 'remove',
				description: 'Remove a keyword from a record',
				action: 'Remove a keyword',
			},
		],
		default: 'getAll',
	},
];

export const keywordFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['keyword'],
			},
		},
		description: 'Name of the cobra endpoint the record belongs to',
	},
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['keyword'],
			},
		},
		description: 'ID of the record whose keywords are addressed',
	},
	{
		displayName: 'Keyword Endpoint',
		name: 'keywordEndpoint',
		type: 'string',
		required: true,
		default: 'Stichwoerter',
		placeholder: 'Stichwoerter',
		displayOptions: {
			show: {
				resource: ['keyword'],
			},
		},
		description:
			'Name of the linked keyword sub-endpoint, resulting in a request to /api/{endpoint}/{ID}/{keyword endpoint}',
	},
	{
		displayName: 'Keyword ID',
		name: 'keywordId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['keyword'],
				operation: ['assign', 'check', 'remove'],
			},
		},
		description: 'ID of the keyword in the cobra keyword table',
	},
];
