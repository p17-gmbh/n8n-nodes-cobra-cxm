import type { INodeProperties } from 'n8n-workflow';

export const recordOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['record'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a record',
				action: 'Create a record',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a record',
				action: 'Delete a record',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single record by ID',
				action: 'Get a record',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many records from a table',
				action: 'Get many records',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing record',
				action: 'Update a record',
			},
		],
		default: 'getAll',
	},
];

export const recordFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['record'],
			},
		},
		description:
			'Name of the cobra endpoint to address. Endpoints map to cobra tables and are configured per installation, so "Adressen" is only the default sample endpoint.',
	},
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['record'],
				operation: ['delete', 'get', 'update'],
			},
		},
		description: 'ID of the cobra record',
	},

	// ----------------------------------
	//            record:getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['record'],
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
				resource: ['record'],
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
				resource: ['record'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Filter Expression',
				name: 'filterExpression',
				type: 'string',
				default: '',
				placeholder: "Firma like 'A%'",
				description:
					'Server-side filter written in the DevExpress criteria language, for example "Firma like \'A%\'" or "[LASTNAME0] = \'Meier\' AND [ZIP] = \'78462\'". See <a href="https://docs.devexpress.com/CoreLibraries/4928/devexpress-data-library/criteria-language-syntax">the criteria language reference</a>.',
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: '',
				placeholder: 'Firma DESC, Nachname ASC',
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
				resource: ['record'],
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
	//       record:create / update
	// ----------------------------------
	{
		displayName: 'Data Mode',
		name: 'dataMode',
		type: 'options',
		default: 'defineBelow',
		displayOptions: {
			show: {
				resource: ['record'],
				operation: ['create', 'update'],
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
				resource: ['record'],
				operation: ['create', 'update'],
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
							loadOptionsMethod: 'getWritableFields',
							loadOptionsDependsOn: ['endpoint'],
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
		placeholder: '{ "COMPANY1": "cobra GmbH", "CITY": "Konstanz" }',
		displayOptions: {
			show: {
				resource: ['record'],
				operation: ['create', 'update'],
				dataMode: ['json'],
			},
		},
		description: 'JSON object whose keys are cobra field names and whose values are the field values',
	},
	{
		displayName:
			'The keys of the incoming item are used as cobra field names. Fields that do not exist on the endpoint are rejected by cobra.',
		name: 'autoMapNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: ['record'],
				operation: ['create', 'update'],
				dataMode: ['autoMapInputData'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'writeOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['record', 'linkedRecord'],
				operation: ['create', 'update'],
			},
		},
		options: [
			{
				displayName: 'Fields to Ignore',
				name: 'ignoreFields',
				type: 'string',
				default: '',
				placeholder: 'ID, DATECREATED',
				description: 'Comma-separated list of field names that are removed before sending. Useful together with "Auto-Map Input Data" to strip read-only fields.',
			},
		],
	},
];
