import type { INodeProperties } from 'n8n-workflow';

export const linkedRecordOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a linked record, for example a contact for an address',
				action: 'Create a linked record',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the linked records of a record, for example the contacts of an address',
				action: 'Get many linked records',
			},
		],
		default: 'getAll',
	},
];

export const linkedRecordFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
			},
		},
		description: 'Name of the parent cobra endpoint',
	},
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
			},
		},
		description: 'ID of the parent record whose linked records are addressed',
	},
	{
		displayName: 'Linked Endpoint',
		name: 'linkedEndpoint',
		type: 'string',
		required: true,
		default: 'Kontakte',
		placeholder: 'Kontakte',
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
			},
		},
		description:
			'Name of the linked sub-endpoint, resulting in a request to /api/{endpoint}/{ID}/{linked endpoint}',
	},

	// ----------------------------------
	//        linkedRecord:getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['getAll'],
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
				resource: ['linkedRecord'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Filter Expression',
				name: 'filterExpression',
				type: 'string',
				default: '',
				placeholder: "Nachname like 'M%'",
				description:
					'Server-side filter written in the DevExpress criteria language. See <a href="https://docs.devexpress.com/CoreLibraries/4928/devexpress-data-library/criteria-language-syntax">the criteria language reference</a>.',
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: '',
				placeholder: 'Nachname ASC',
				description: 'Sort order, given as a comma-separated list of field names with ASC or DESC',
			},
		],
	},
	{
		displayName: 'Pagination',
		name: 'pagination',
		type: 'collection',
		placeholder: 'Add Pagination Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['getAll'],
				returnAll: [true],
			},
		},
		options: [
			{
				displayName: 'First Page ID',
				name: 'pageId',
				type: 'number',
				default: 1,
				description:
					'Page to start from. cobra does not document whether the first page is 0 or 1, so verify this against your server.',
			},
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'number',
				default: 100,
				typeOptions: {
					minValue: 1,
				},
				description:
					'Fetch the records in pages of this size, following pages until a short page arrives. Leave empty to read everything in a single request.',
			},
		],
	},

	// ----------------------------------
	//        linkedRecord:create
	// ----------------------------------
	{
		displayName: 'Data Mode',
		name: 'dataMode',
		type: 'options',
		default: 'defineBelow',
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['create'],
			},
		},
		options: [
			{
				name: 'Auto-Map Input Data',
				value: 'autoMapInputData',
				description: 'Use every property of the incoming item as a cobra field',
			},
			{
				name: 'Define Below',
				value: 'defineBelow',
				description: 'Pick cobra fields from the endpoint metadata and set their values',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'Provide a JSON object whose keys are cobra field names',
			},
		],
		description: 'How the cobra field values are supplied',
	},
	{
		displayName: 'Fields',
		name: 'fieldsUi',
		type: 'fixedCollection',
		placeholder: 'Add Field',
		default: {},
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['create'],
				dataMode: ['defineBelow'],
			},
		},
		options: [
			{
				displayName: 'Field',
				name: 'fieldValues',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'fieldName',
						type: 'options',
						description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getLinkedWritableFields',
							loadOptionsDependsOn: ['linkedEndpoint'],
						},
					},
					{
						displayName: 'Field Value',
						name: 'fieldValue',
						type: 'string',
						default: '',
						description: 'Value to write into the cobra field',
					},
				],
			},
		],
		description: 'Field values to write',
	},
	{
		displayName: 'Fields (JSON)',
		name: 'fieldsJson',
		type: 'json',
		default: '{}',
		placeholder: '{ "LASTNAME0": "Meier", "DEPARTMENT": "Einkauf" }',
		displayOptions: {
			show: {
				resource: ['linkedRecord'],
				operation: ['create'],
				dataMode: ['json'],
			},
		},
		description: 'JSON object whose keys are cobra field names and whose values are the field values',
	},
];
