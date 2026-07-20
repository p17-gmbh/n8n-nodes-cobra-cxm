import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	assertCobraResult,
	buildMultipartBody,
	cobraApiRequest,
	cobraApiRequestAllItems,
	cobraHealthRequest,
	getEndpointMetadata,
	loadEndpointFields,
	normalizeEndpoint,
	parseJsonFields,
	toDataProperties,
	type ICobraEndpointMetadata,
} from './GenericFunctions';
import {
	documentFields,
	documentOperations,
	groupFields,
	groupOperations,
	imageFields,
	imageOperations,
	keywordFields,
	keywordOperations,
	linkedRecordFields,
	linkedRecordOperations,
	metadataFields,
	metadataOperations,
	recordFields,
	recordOperations,
	scriptFields,
	scriptOperations,
	searchFields,
	searchOperations,
	sqlFields,
	sqlOperations,
	systemFields,
	systemOperations,
	userFields,
	userOperations,
} from './descriptions';

interface IFieldValue {
	fieldName?: string;
	fieldValue?: string;
}

/** Extracts the file name from a Content-Disposition header, if present. */
function fileNameFromHeaders(headers: IDataObject | undefined, fallback: string): string {
	const disposition = (headers?.['content-disposition'] ?? headers?.['Content-Disposition']) as
		| string
		| undefined;
	if (!disposition) return fallback;

	const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1].trim());
		} catch {
			// fall through to the plain filename
		}
	}

	const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
	return plainMatch?.[1]?.trim() ?? fallback;
}

export class Cobra implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'cobra CXM',
		name: 'cobra',
		icon: { light: 'file:cobra.svg', dark: 'file:cobra.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and write cobra CXM data through the cobra CXM WEB CONNECT API',
		defaults: {
			name: 'cobra CXM',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'cobraCxmApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Document',
						value: 'document',
					},
					{
						name: 'Group',
						value: 'group',
					},
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Keyword',
						value: 'keyword',
					},
					{
						name: 'Linked Record',
						value: 'linkedRecord',
					},
					{
						name: 'Metadata',
						value: 'metadata',
					},
					{
						name: 'Record',
						value: 'record',
					},
					{
						name: 'Script',
						value: 'script',
					},
					{
						name: 'Search',
						value: 'search',
					},
					{
						name: 'SQL',
						value: 'sql',
					},
					{
						name: 'System',
						value: 'system',
					},
					{
						name: 'User',
						value: 'user',
					},
				],
				default: 'record',
			},
			...recordOperations,
			...recordFields,
			...linkedRecordOperations,
			...linkedRecordFields,
			...searchOperations,
			...searchFields,
			...keywordOperations,
			...keywordFields,
			...documentOperations,
			...documentFields,
			...imageOperations,
			...imageFields,
			...metadataOperations,
			...metadataFields,
			...scriptOperations,
			...scriptFields,
			...sqlOperations,
			...sqlFields,
			...systemOperations,
			...systemFields,
			...userOperations,
			...userFields,
			...groupOperations,
			...groupFields,
		],
	};

	// Errors are deliberately NOT swallowed here. n8n renders a failing loadOptions call
	// as a message in the parameter, which tells the user that the endpoint name is wrong
	// or inaccessible — an empty dropdown would leave them with nothing to act on.
	methods = {
		loadOptions: {
			async getFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadEndpointFields(this, 'endpoint');
			},
			async getDocumentFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadEndpointFields(this, 'endpoint', { documentOnly: true });
			},
			async getWritableFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadEndpointFields(this, 'endpoint', { writableOnly: true });
			},
			async getLinkedWritableFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadEndpointFields(this, 'linkedEndpoint', { writableOnly: true });
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const results = await executeSingle.call(this, resource, operation, i, items);
				returnData.push(...results);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				// Errors raised by the shared helpers are already NodeApiError or
				// NodeOperationError and carry the cobra specific hints, so they are
				// passed through untouched. Anything else is wrapped for the UI.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

/**
 * Builds the field values for a create or update call, honouring the three
 * possible data modes and the optional ignore list.
 */
function collectFields(
	this: IExecuteFunctions,
	itemIndex: number,
	items: INodeExecutionData[],
): IDataObject {
	const dataMode = this.getNodeParameter('dataMode', itemIndex) as string;
	let fields: IDataObject = {};

	if (dataMode === 'autoMapInputData') {
		fields = { ...items[itemIndex].json };
	} else if (dataMode === 'json') {
		fields = parseJsonFields(
			this,
			this.getNodeParameter('fieldsJson', itemIndex),
			itemIndex,
			'Fields (JSON)',
		);
	} else {
		const fieldsUi = this.getNodeParameter('fieldsUi', itemIndex, {}) as IDataObject;
		const fieldValues = (fieldsUi.fieldValues as IFieldValue[] | undefined) ?? [];

		for (const entry of fieldValues) {
			if (!entry.fieldName) continue;
			fields[entry.fieldName] = entry.fieldValue ?? '';
		}
	}

	const writeOptions = this.getNodeParameter('writeOptions', itemIndex, {}) as IDataObject;
	const ignoreFields = (writeOptions.ignoreFields as string | undefined) ?? '';

	if (ignoreFields.trim() !== '') {
		for (const name of ignoreFields.split(',')) {
			delete fields[name.trim()];
		}
	}

	if (Object.keys(fields).length === 0) {
		throw new NodeOperationError(this.getNode(), 'No field values were supplied', {
			itemIndex,
			description: 'cobra needs at least one field to create or update a record',
		});
	}

	return fields;
}

/**
 * Runs one of the two list operations.
 *
 * cobra does not document how "Top" interacts with "PageSize"/"PageId", so the two are
 * kept mutually exclusive: a limited read sends only "Top", while "Return All" either
 * reads everything in one request or walks the pages when a page size was given.
 */
async function fetchList(
	this: IExecuteFunctions,
	path: string,
	itemIndex: number,
): Promise<unknown> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const pagination = this.getNodeParameter('pagination', itemIndex, {}) as IDataObject;

	const qs: IDataObject = {};
	if (options.filterExpression) qs.FilterExpression = options.filterExpression;
	if (options.orderBy) qs.OrderBy = options.orderBy;

	if (!returnAll) {
		qs.Top = this.getNodeParameter('limit', itemIndex) as number;
		return await cobraApiRequest.call(this, 'GET', path, undefined, qs);
	}

	const pageSize = pagination.pageSize as number | undefined;
	if (pageSize !== undefined && pageSize > 0) {
		const firstPageId = (pagination.pageId as number | undefined) ?? 1;
		return await cobraApiRequestAllItems.call(this, path, qs, pageSize, firstPageId);
	}

	return await cobraApiRequest.call(this, 'GET', path, undefined, qs);
}

/** Wraps whatever an endpoint returned into n8n items. */
function toItems(response: unknown, itemIndex: number): INodeExecutionData[] {
	const pairedItem = { item: itemIndex };

	if (Array.isArray(response)) {
		return response.map((entry) => ({
			json: (entry ?? {}) as IDataObject,
			pairedItem,
		}));
	}

	if (response === null || response === undefined) {
		return [{ json: {}, pairedItem }];
	}

	if (typeof response !== 'object') {
		return [{ json: { result: response as string }, pairedItem }];
	}

	return [{ json: response as IDataObject, pairedItem }];
}

async function executeSingle(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const pairedItem = { item: i };

	// ----------------------------------
	//              record
	// ----------------------------------
	if (resource === 'record') {
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint', i) as string);

		if (operation === 'getAll') {
			const response = await fetchList.call(this, `/api/${endpoint}`, i);
			return toItems(response, i);
		}

		if (operation === 'get') {
			const recordId = this.getNodeParameter('recordId', i) as number;
			const response = await cobraApiRequest.call(this, 'GET', `/api/${endpoint}/${recordId}`);
			return toItems(response, i);
		}

		if (operation === 'create') {
			const fields = collectFields.call(this, i, items);
			const response = (await cobraApiRequest.call(
				this,
				'POST',
				`/api/${endpoint}`,
				toDataProperties(fields) as unknown as IDataObject[],
			)) as IDataObject;

			assertCobraResult(this, response, 'create', i);
			return [{ json: response ?? {}, pairedItem }];
		}

		if (operation === 'update') {
			const recordId = this.getNodeParameter('recordId', i) as number;
			const fields = collectFields.call(this, i, items);
			const response = (await cobraApiRequest.call(
				this,
				'PUT',
				`/api/${endpoint}/${recordId}`,
				toDataProperties(fields) as unknown as IDataObject[],
			)) as IDataObject;

			assertCobraResult(this, response, 'update', i);
			return [{ json: { ...(response ?? {}), id: recordId }, pairedItem }];
		}

		if (operation === 'delete') {
			const recordId = this.getNodeParameter('recordId', i) as number;
			const response = (await cobraApiRequest.call(
				this,
				'DELETE',
				`/api/${endpoint}/${recordId}`,
			)) as IDataObject;

			assertCobraResult(this, response, 'delete', i);
			return [{ json: { ...(response ?? {}), id: recordId, deleted: true }, pairedItem }];
		}
	}

	// ----------------------------------
	//           linkedRecord
	// ----------------------------------
	if (resource === 'linkedRecord') {
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint', i) as string);
		const linkedEndpoint = normalizeEndpoint(this.getNodeParameter('linkedEndpoint', i) as string);
		const recordId = this.getNodeParameter('recordId', i) as number;
		const path = `/api/${endpoint}/${recordId}/${linkedEndpoint}`;

		if (operation === 'getAll') {
			const response = await fetchList.call(this, path, i);
			return toItems(response, i);
		}

		if (operation === 'create') {
			const fields = collectFields.call(this, i, items);
			const response = (await cobraApiRequest.call(
				this,
				'POST',
				path,
				toDataProperties(fields) as unknown as IDataObject[],
			)) as IDataObject;

			assertCobraResult(this, response, 'create', i);
			return [{ json: response ?? {}, pairedItem }];
		}
	}

	// ----------------------------------
	//              search
	// ----------------------------------
	if (resource === 'search') {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const qs: IDataObject = {};

		if (!returnAll) {
			qs.Top = this.getNodeParameter('limit', i) as number;
		}

		if (operation === 'mail') {
			qs.MailAddress = this.getNodeParameter('mailAddress', i) as string;
			qs.SearchMode = this.getNodeParameter('mailSearchMode', i) as string;
			const response = await cobraApiRequest.call(this, 'GET', '/api/MailSearch', undefined, qs);
			return toItems(response, i);
		}

		if (operation === 'phone') {
			qs.PhoneNumber = this.getNodeParameter('phoneNumber', i) as string;
			qs.SearchMode = this.getNodeParameter('phoneSearchMode', i) as string;
			const response = await cobraApiRequest.call(this, 'GET', '/api/PhoneSearch', undefined, qs);
			return toItems(response, i);
		}
	}

	// ----------------------------------
	//              keyword
	// ----------------------------------
	if (resource === 'keyword') {
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint', i) as string);
		const keywordEndpoint = normalizeEndpoint(this.getNodeParameter('keywordEndpoint', i) as string);
		const recordId = this.getNodeParameter('recordId', i) as number;
		const basePath = `/api/${endpoint}/${recordId}/${keywordEndpoint}`;

		if (operation === 'getAll') {
			const response = await cobraApiRequest.call(this, 'GET', basePath);
			return toItems(response, i);
		}

		const keywordId = this.getNodeParameter('keywordId', i) as number;

		if (operation === 'assign') {
			const response = (await cobraApiRequest.call(this, 'POST', basePath, {
				keywordId,
			})) as IDataObject;

			assertCobraResult(this, response, 'keyword', i);
			return [{ json: { ...(response ?? {}), keywordId, assigned: true }, pairedItem }];
		}

		if (operation === 'check') {
			// cobra answers 404 when the keyword is not assigned and returns the keyword
			// object when it is. Only the 404 is treated as an answer — an auth or
			// permission failure must still fail loudly rather than read as "not assigned".
			const response = (await cobraApiRequest.call(
				this,
				'GET',
				`${basePath}/${keywordId}`,
				undefined,
				undefined,
				{
					returnFullResponse: true,
					ignoreHttpStatusErrors: { ignore: true, except: [401, 403, 405, 500, 503] },
				},
			)) as { body: unknown; statusCode: number };

			const assigned = response.statusCode >= 200 && response.statusCode < 300;

			return [
				{
					json: {
						recordId,
						keywordId,
						assigned,
						keyword: assigned ? ((response.body ?? null) as IDataObject | null) : null,
					},
					pairedItem,
				},
			];
		}

		if (operation === 'remove') {
			const response = (await cobraApiRequest.call(
				this,
				'DELETE',
				`${basePath}/${keywordId}`,
			)) as IDataObject;

			assertCobraResult(this, response, 'keyword', i);
			return [{ json: { ...(response ?? {}), keywordId, removed: true }, pairedItem }];
		}
	}

	// ----------------------------------
	//             document
	// ----------------------------------
	if (resource === 'document') {
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint', i) as string);
		const recordId = this.getNodeParameter('recordId', i) as number;
		const documentField = this.getNodeParameter('documentField', i) as string;
		const path = `/api/${endpoint}/${recordId}/Documents/${encodeURIComponent(documentField)}`;

		if (operation === 'download') {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const response = (await cobraApiRequest.call(this, 'GET', path, undefined, undefined, {
				json: false,
				encoding: 'arraybuffer',
				returnFullResponse: true,
			})) as { body: Buffer; headers: IDataObject };

			const fileName = fileNameFromHeaders(response.headers, `${documentField}-${recordId}`);
			const mimeType = (response.headers?.['content-type'] as string | undefined)?.split(';')[0];

			return [
				{
					json: items[i].json,
					binary: {
						[binaryPropertyName]: await this.helpers.prepareBinaryData(
							Buffer.from(response.body),
							fileName,
							mimeType,
						),
					},
					pairedItem,
				},
			];
		}

		if (operation === 'upload') {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const overwrite = this.getNodeParameter('overwrite', i) as boolean;
			const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

			const { body, contentType } = buildMultipartBody(
				'file',
				binaryData.fileName ?? 'upload',
				binaryData.mimeType || 'application/octet-stream',
				buffer,
			);

			const response = (await cobraApiRequest.call(
				this,
				'POST',
				path,
				body,
				{ overwrite },
				{ headers: { 'content-type': contentType } },
			)) as IDataObject;

			assertCobraResult(this, response, 'documentUpload', i);
			return [{ json: response ?? {}, pairedItem }];
		}

		if (operation === 'delete') {
			const response = (await cobraApiRequest.call(this, 'DELETE', path)) as IDataObject;
			assertCobraResult(this, response, 'delete', i);
			return [{ json: { ...(response ?? {}), deleted: true }, pairedItem }];
		}
	}

	// ----------------------------------
	//               image
	// ----------------------------------
	if (resource === 'image') {
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint', i) as string);
		const recordId = this.getNodeParameter('recordId', i) as number;
		const path = `/api/${endpoint}/${recordId}/Image`;

		if (operation === 'download') {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const preview = this.getNodeParameter('preview', i) as boolean;
			const response = (await cobraApiRequest.call(
				this,
				'GET',
				path,
				undefined,
				preview ? { preview: true } : undefined,
				{
					json: false,
					encoding: 'arraybuffer',
					returnFullResponse: true,
				},
			)) as { body: Buffer; headers: IDataObject };

			const fileName = fileNameFromHeaders(response.headers, `image-${recordId}.jpg`);
			const mimeType = (response.headers?.['content-type'] as string | undefined)?.split(';')[0];

			return [
				{
					json: items[i].json,
					binary: {
						[binaryPropertyName]: await this.helpers.prepareBinaryData(
							Buffer.from(response.body),
							fileName,
							mimeType,
						),
					},
					pairedItem,
				},
			];
		}

		if (operation === 'upload') {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const imageDescription = this.getNodeParameter('imageDescription', i, '') as string;
			const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

			const { body, contentType } = buildMultipartBody(
				'file',
				binaryData.fileName ?? 'image.jpg',
				binaryData.mimeType || 'application/octet-stream',
				buffer,
			);

			const qs: IDataObject = {};
			if (imageDescription !== '') qs.description = imageDescription;

			const response = (await cobraApiRequest.call(this, 'POST', path, body, qs, {
				headers: { 'content-type': contentType },
			})) as IDataObject;

			assertCobraResult(this, response, 'imageUpload', i);
			return [{ json: response ?? {}, pairedItem }];
		}

		if (operation === 'delete') {
			const response = (await cobraApiRequest.call(this, 'DELETE', path)) as IDataObject;
			assertCobraResult(this, response, 'imageDelete', i);
			return [{ json: { ...(response ?? {}), deleted: true }, pairedItem }];
		}
	}

	// ----------------------------------
	//             metadata
	// ----------------------------------
	if (resource === 'metadata' && operation === 'get') {
		const endpoint = this.getNodeParameter('endpoint', i) as string;
		const splitFields = this.getNodeParameter('splitFields', i) as boolean;
		const metadata = (await getEndpointMetadata.call(this, endpoint)) as ICobraEndpointMetadata;

		const fields = metadata.endpointFields ?? [];

		// Splitting an endpoint that reports no fields would drop the item entirely and
		// look like a silent success, so the raw document is returned instead.
		if (!splitFields || fields.length === 0) {
			return [{ json: metadata as unknown as IDataObject, pairedItem }];
		}

		return fields.map((field) => ({
			json: field as unknown as IDataObject,
			pairedItem,
		}));
	}

	// ----------------------------------
	//              script
	// ----------------------------------
	if (resource === 'script' && operation === 'execute') {
		const scriptName = normalizeEndpoint(this.getNodeParameter('scriptName', i) as string);
		const scriptArguments = this.getNodeParameter('scriptArguments', i, '') as string;
		const qs: IDataObject = {};
		if (scriptArguments !== '') qs.arguments = scriptArguments;

		const response = (await cobraApiRequest.call(
			this,
			'POST',
			`/api/Scripts/${scriptName}`,
			undefined,
			qs,
		)) as IDataObject;

		assertCobraResult(this, response, 'script', i);
		return [{ json: response ?? {}, pairedItem }];
	}

	// ----------------------------------
	//                sql
	// ----------------------------------
	if (resource === 'sql' && operation === 'execute') {
		const commandName = normalizeEndpoint(this.getNodeParameter('commandName', i) as string);
		const response = (await cobraApiRequest.call(
			this,
			'POST',
			`/api/Sql/${commandName}`,
		)) as IDataObject;

		assertCobraResult(this, response, 'sql', i);
		return [{ json: response ?? {}, pairedItem }];
	}

	// ----------------------------------
	//              system
	// ----------------------------------
	if (resource === 'system' && operation === 'healthCheck') {
		const failOnUnhealthy = this.getNodeParameter('failOnUnhealthy', i) as boolean;

		// A 503 is a meaningful answer here, not a transport failure, so it is read
		// instead of thrown and the user decides whether it should stop the workflow.
		const response = await cobraHealthRequest.call(this);
		const report = (response.body ?? {}) as IDataObject;
		const healthy = report.status === 'Healthy' && response.statusCode === 200;

		if (!healthy && failOnUnhealthy) {
			throw new NodeOperationError(
				this.getNode(),
				`The cobra server reported the status "${(report.status as string) ?? 'unknown'}"`,
				{
					itemIndex: i,
					description: 'Disable "Fail on Unhealthy" to receive the report as regular data instead',
				},
			);
		}

		return [{ json: { ...report, healthy, statusCode: response.statusCode }, pairedItem }];
	}

	// ----------------------------------
	//               user
	// ----------------------------------
	if (resource === 'user') {
		const basePath = '/api/Usermanagement/Users';

		if (operation === 'getAll') {
			const response = await cobraApiRequest.call(this, 'GET', basePath);
			return toItems(response, i);
		}

		const userId = this.getNodeParameter('userId', i, 0) as number;

		if (operation === 'get') {
			const response = await cobraApiRequest.call(this, 'GET', `${basePath}/${userId}`);
			return toItems(response, i);
		}

		if (operation === 'create') {
			const options = this.getNodeParameter('userCreateOptions', i, {}) as IDataObject;
			const body: IDataObject = {
				name: this.getNodeParameter('name', i) as string,
				shortName: this.getNodeParameter('shortName', i, '') as string,
				password: this.getNodeParameter('password', i, '') as string,
				...options,
			};

			const response = (await cobraApiRequest.call(this, 'POST', basePath, body)) as IDataObject;
			assertCobraResult(this, response, 'userCreate', i);
			return [{ json: response ?? {}, pairedItem }];
		}

		if (operation === 'update') {
			const body = this.getNodeParameter('userUpdateFields', i, {}) as IDataObject;

			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(this.getNode(), 'No update fields were supplied', {
					itemIndex: i,
					description: 'Add at least one entry under "Update Fields"',
				});
			}

			const response = (await cobraApiRequest.call(
				this,
				'PATCH',
				`${basePath}/${userId}`,
				body,
			)) as IDataObject;

			assertCobraResult(this, response, 'userUpdate', i);
			return [{ json: { ...(response ?? {}), id: userId }, pairedItem }];
		}

		if (operation === 'getGroups') {
			const response = await cobraApiRequest.call(this, 'GET', `${basePath}/${userId}/groups`);
			return toItems(response, i);
		}

		if (operation === 'addToGroup') {
			const groupId = this.getNodeParameter('groupId', i) as number;
			const response = (await cobraApiRequest.call(this, 'POST', `${basePath}/${userId}/groups`, {
				groupId,
			})) as IDataObject;

			assertCobraResult(this, response, 'groupAssign', i);
			return [{ json: { ...(response ?? {}), userId, groupId, assigned: true }, pairedItem }];
		}

		if (operation === 'removeFromGroup') {
			const groupId = this.getNodeParameter('groupId', i) as number;
			const response = (await cobraApiRequest.call(
				this,
				'DELETE',
				`${basePath}/${userId}/groups/${groupId}`,
			)) as IDataObject;

			assertCobraResult(this, response, 'groupAssign', i);
			return [{ json: { ...(response ?? {}), userId, groupId, removed: true }, pairedItem }];
		}

		if (operation === 'getAttributes') {
			const response = await cobraApiRequest.call(this, 'GET', `${basePath}/${userId}/attributes`);
			return toItems(response, i);
		}

		if (operation === 'updateAttribute') {
			const attributeId = this.getNodeParameter('attributeId', i) as number;
			const newValue = this.getNodeParameter('newValue', i, '') as string;
			const response = (await cobraApiRequest.call(
				this,
				'PATCH',
				`${basePath}/${userId}/attributes/${attributeId}`,
				{ newValue },
			)) as IDataObject;

			assertCobraResult(this, response, 'attributeUpdate', i);
			return [{ json: { ...(response ?? {}), userId, attributeId }, pairedItem }];
		}
	}

	// ----------------------------------
	//               group
	// ----------------------------------
	if (resource === 'group') {
		const basePath = '/api/Usermanagement/Groups';

		if (operation === 'getAll') {
			const response = await cobraApiRequest.call(this, 'GET', basePath);
			return toItems(response, i);
		}

		if (operation === 'get') {
			const groupId = this.getNodeParameter('groupId', i) as number;
			const response = await cobraApiRequest.call(this, 'GET', `${basePath}/${groupId}`);
			return toItems(response, i);
		}

		if (operation === 'create') {
			const body: IDataObject = {
				name: this.getNodeParameter('name', i) as string,
				shortName: this.getNodeParameter('shortName', i, '') as string,
			};
			const response = (await cobraApiRequest.call(this, 'POST', basePath, body)) as IDataObject;
			assertCobraResult(this, response, 'groupCreate', i);
			return [{ json: response ?? {}, pairedItem }];
		}

		if (operation === 'update') {
			const groupId = this.getNodeParameter('groupId', i) as number;
			const body: IDataObject = { name: this.getNodeParameter('name', i) as string };
			const response = (await cobraApiRequest.call(
				this,
				'PATCH',
				`${basePath}/${groupId}`,
				body,
			)) as IDataObject;

			assertCobraResult(this, response, 'groupUpdate', i);
			return [{ json: { ...(response ?? {}), id: groupId }, pairedItem }];
		}
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for the resource "${resource}"`,
		{ itemIndex: i },
	);
}
