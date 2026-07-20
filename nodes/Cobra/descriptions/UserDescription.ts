import type { INodeProperties } from 'n8n-workflow';

export const userOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['user'],
			},
		},
		options: [
			{
				name: 'Add to Group',
				value: 'addToGroup',
				description: 'Assign a user to a group',
				action: 'Add a user to a group',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a cobra user',
				action: 'Create a user',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single user by ID',
				action: 'Get a user',
			},
			{
				name: 'Get Attributes',
				value: 'getAttributes',
				description: 'Get the attributes of a user',
				action: 'Get user attributes',
			},
			{
				name: 'Get Groups',
				value: 'getGroups',
				description: 'Get the groups a user belongs to',
				action: 'Get user groups',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many users',
				action: 'Get many users',
			},
			{
				name: 'Remove From Group',
				value: 'removeFromGroup',
				description: 'Remove a user from a group',
				action: 'Remove a user from a group',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a cobra user',
				action: 'Update a user',
			},
			{
				name: 'Update Attribute',
				value: 'updateAttribute',
				description: 'Change the value of a user attribute',
				action: 'Update a user attribute',
			},
		],
		default: 'getAll',
	},
];

export const userFields: INodeProperties[] = [
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: [
					'addToGroup',
					'get',
					'getAttributes',
					'getGroups',
					'removeFromGroup',
					'update',
					'updateAttribute',
				],
			},
		},
		description: 'ID of the cobra user',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		description: 'Name of the new user',
	},
	{
		displayName: 'Short Name',
		name: 'shortName',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		description: 'Short name of the new user',
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		description: 'Password of the new user',
	},
	{
		displayName: 'Options',
		name: 'userCreateOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		options: [
			{
				displayName: 'Mobile User',
				name: 'mobileUser',
				type: 'boolean',
				default: false,
				description: 'Whether the user is created as a mobile user',
			},
			{
				displayName: 'Reactivate',
				name: 'reactivate',
				type: 'boolean',
				default: false,
				description: 'Whether an already existing, deactivated user is reactivated',
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'userUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Mobile User',
				name: 'mobileUser',
				type: 'boolean',
				default: false,
				description: 'Whether the user is a mobile user',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New name of the user',
			},
		],
	},
	{
		displayName: 'Group ID',
		name: 'groupId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['addToGroup', 'removeFromGroup'],
			},
		},
		description: 'ID of the cobra user group',
	},
	{
		displayName: 'Attribute ID',
		name: 'attributeId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['updateAttribute'],
			},
		},
		description: 'ID of the user attribute to change',
	},
	{
		displayName: 'New Value',
		name: 'newValue',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['updateAttribute'],
			},
		},
		description: 'New value of the user attribute',
	},
];

export const groupOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['group'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a user group',
				action: 'Create a group',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single group by ID',
				action: 'Get a group',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many user groups',
				action: 'Get many groups',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a user group',
				action: 'Update a group',
			},
		],
		default: 'getAll',
	},
];

export const groupFields: INodeProperties[] = [
	{
		displayName: 'Group ID',
		name: 'groupId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: {
			show: {
				resource: ['group'],
				operation: ['get', 'update'],
			},
		},
		description: 'ID of the cobra user group',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['group'],
				operation: ['create', 'update'],
			},
		},
		description: 'Name of the user group',
	},
	{
		displayName: 'Short Name',
		name: 'shortName',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['group'],
				operation: ['create'],
			},
		},
		description: 'Short name of the user group',
	},
];
