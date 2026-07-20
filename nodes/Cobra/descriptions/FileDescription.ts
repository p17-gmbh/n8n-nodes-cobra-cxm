import type { INodeProperties } from 'n8n-workflow';

export const documentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['document'],
			},
		},
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a document from the cobra document management',
				action: 'Delete a document',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download a document as binary data',
				action: 'Download a document',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload binary data as a document',
				action: 'Upload a document',
			},
		],
		default: 'download',
	},
];

export const documentFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['document'],
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
				resource: ['document'],
			},
		},
		description: 'ID of the record the document belongs to',
	},
	{
		displayName: 'Document Field Name or ID',
		name: 'documentField',
		type: 'options',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		required: true,
		default: '',
		typeOptions: {
			loadOptionsMethod: 'getDocumentFields',
			loadOptionsDependsOn: ['endpoint'],
		},
		displayOptions: {
			show: {
				resource: ['document'],
			},
		},
		hint: 'The cobra field that holds the document, e.g. a field of type Document Link',
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['download'],
			},
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field containing the file to upload',
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['upload'],
			},
		},
	},
	{
		displayName: 'Overwrite',
		name: 'overwrite',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['upload'],
			},
		},
		description: 'Whether to replace an already existing document instead of failing',
	},
];

export const imageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['image'],
			},
		},
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete the image of a record',
				action: 'Delete an image',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download the image of a record as binary data',
				action: 'Download an image',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload binary data as the image of a record',
				action: 'Upload an image',
			},
		],
		default: 'download',
	},
];

export const imageFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: 'Adressen',
		placeholder: 'Adressen',
		displayOptions: {
			show: {
				resource: ['image'],
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
				resource: ['image'],
			},
		},
		description: 'ID of the record the image belongs to',
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: {
			show: {
				resource: ['image'],
				operation: ['download'],
			},
		},
	},
	{
		displayName: 'Preview',
		name: 'preview',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['image'],
				operation: ['download'],
			},
		},
		description: 'Whether to download the smaller preview image instead of the full image',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field containing the file to upload',
		displayOptions: {
			show: {
				resource: ['image'],
				operation: ['upload'],
			},
		},
	},
	{
		displayName: 'Description',
		name: 'imageDescription',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['image'],
				operation: ['upload'],
			},
		},
		description: 'Optional description stored with the image',
	},
];
