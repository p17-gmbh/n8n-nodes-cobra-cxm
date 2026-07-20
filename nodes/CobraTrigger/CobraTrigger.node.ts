import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	cobraApiRequest,
	FIELD_TYPE_DATE_CREATED,
	FIELD_TYPE_DATE_MODIFIED,
	getEndpointMetadata,
	loadEndpointFields,
	normalizeEndpoint,
	toCriteriaDateTime,
} from '../Cobra/GenericFunctions';

export class CobraTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'cobra CXM Trigger',
		name: 'cobraTrigger',
		icon: { light: 'file:cobra.svg', dark: 'file:cobra.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when cobra CXM records are created or changed',
		defaults: {
			name: 'cobra CXM Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'cobraCxmApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Endpoint',
				name: 'endpoint',
				type: 'string',
				required: true,
				default: 'Adressen',
				placeholder: 'Adressen',
				description:
					'Name of the cobra endpoint to watch. Endpoints map to cobra tables and are configured per installation.',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: 'recordCreated',
				options: [
					{
						name: 'Record Created',
						value: 'recordCreated',
						description: 'Triggers when a record was added to the table',
					},
					{
						name: 'Record Updated',
						value: 'recordUpdated',
						description: 'Triggers when a record was created or changed',
					},
				],
				description: 'Which change to watch for',
			},
			{
				displayName: 'Timestamp Field Name or ID',
				name: 'timestampField',
				type: 'options',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getDateFields',
					loadOptionsDependsOn: ['endpoint', 'event'],
				},
				hint: 'Date field cobra updates when a record changes, e.g. DATECREATED or DATEMODIFIED. Leave empty to detect it from the endpoint metadata.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Filter Expression',
						name: 'filterExpression',
						type: 'string',
						default: '',
						placeholder: "Firma like 'A%'",
						description:
							'Additional filter combined with the timestamp condition using AND. Uses the DevExpress criteria language.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						default: 50,
						typeOptions: {
							minValue: 1,
						},
						description: 'Max number of results to return',
					},
					{
						displayName: 'Overlap (Seconds)',
						name: 'overlapSeconds',
						type: 'number',
						default: 0,
						typeOptions: {
							minValue: 0,
						},
						description:
							'How far back before the last poll to look again. Increase this if records written while a poll was running are missed, at the cost of possible duplicates.',
					},
				],
			},
		],
		usableAsTool: true,
	};

	methods = {
		loadOptions: {
			// Errors surface in the parameter instead of leaving an empty dropdown behind.
			async getDateFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadEndpointFields(this, 'endpoint', { dateOnly: true });
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const staticData = this.getWorkflowStaticData('node');
		const endpoint = normalizeEndpoint(this.getNodeParameter('endpoint') as string);
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const limit = (options.limit as number | undefined) ?? 50;
		const overlapSeconds = (options.overlapSeconds as number | undefined) ?? 0;
		const isManualMode = this.getMode() === 'manual';

		let timestampField = this.getNodeParameter('timestampField') as string;
		if (!timestampField) {
			timestampField = await resolveTimestampField.call(this, endpoint);
		}

		const now = new Date();
		const conditions: string[] = [];

		if (!isManualMode) {
			const lastTimeChecked = staticData.lastTimeChecked as string | undefined;

			// The very first poll of an activated workflow has no watermark yet. Emitting
			// the whole table at that point would flood the workflow, so the watermark is
			// simply set and this run reports nothing.
			if (!lastTimeChecked) {
				staticData.lastTimeChecked = now.toISOString();
				return null;
			}

			const since = new Date(new Date(lastTimeChecked).getTime() - overlapSeconds * 1000);
			conditions.push(`[${timestampField}] > ${toCriteriaDateTime(since, this.getTimezone())}`);
		}

		const additionalFilter = (options.filterExpression as string | undefined) ?? '';
		if (additionalFilter.trim() !== '') {
			conditions.push(`(${additionalFilter.trim()})`);
		}

		// Ascending, so that a burst larger than "Limit" keeps the OLDEST pending changes.
		// Combined with the watermark handling below, the remainder is picked up by the
		// next poll instead of being skipped for good.
		const qs: IDataObject = {
			OrderBy: `${timestampField} ASC`,
			Top: limit,
		};
		if (conditions.length > 0) {
			qs.FilterExpression = conditions.join(' AND ');
		}

		const response = await cobraApiRequest.call(this, 'GET', `/api/${endpoint}`, undefined, qs);
		const records = Array.isArray(response) ? (response as IDataObject[]) : [];

		if (!isManualMode) {
			// Prefer the timestamp of the newest record that was actually emitted. Because
			// the query is ascending, nothing newer than that was withheld, so this is a
			// safe watermark — and unlike the wall clock it cannot drift against the cobra
			// server or jump backwards when the local clock leaves daylight saving time.
			// A full page additionally means more changes are probably still queued, and
			// this is exactly what lets the next poll resume where this one stopped.
			const newest =
				records.length > 0
					? parseRecordTimestamp(records[records.length - 1], timestampField)
					: undefined;

			staticData.lastTimeChecked = (newest ?? now).toISOString();
		}

		if (records.length === 0) {
			if (isManualMode) {
				throw new NodeOperationError(
					this.getNode(),
					'No records were returned by the cobra endpoint',
					{
						description:
							'The endpoint answered without any record. Check the endpoint name and the filter expression.',
					},
				);
			}
			return null;
		}

		// Already oldest first because of the ascending OrderBy.
		return [this.helpers.returnJsonArray(records)];
	}
}

/**
 * Reads the polling timestamp out of an emitted record. cobra returns SQL Server
 * datetimes as ISO-like strings; anything unparsable falls back to the poll time so
 * that a malformed value can never stall the trigger.
 */
function parseRecordTimestamp(record: IDataObject | undefined, field: string): Date | undefined {
	const raw = record?.[field];
	if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;

	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Falls back to the cobra field that is semantically marked as "date created" or
 * "date modified" when the user left the timestamp field empty.
 */
async function resolveTimestampField(this: IPollFunctions, endpoint: string): Promise<string> {
	const metadata = await getEndpointMetadata.call(this, endpoint);
	const event = this.getNodeParameter('event') as string;
	const wanted = event === 'recordUpdated' ? FIELD_TYPE_DATE_MODIFIED : FIELD_TYPE_DATE_CREATED;

	// No silent downgrade: watching for updates but only finding a creation date would
	// quietly turn "Record Updated" into "Record Created" and miss every change.
	const field = metadata.endpointFields?.find((entry) => entry.fieldType === wanted);

	if (!field?.name) {
		const wantedName = event === 'recordUpdated' ? 'DateModified' : 'DateCreated';
		throw new NodeOperationError(
			this.getNode(),
			`The endpoint "${endpoint}" has no field of the cobra type ${wantedName}`,
			{
				description:
					'Select the date field that records the creation or change time in the "Timestamp Field" parameter.',
			},
		);
	}

	return field.name;
}
