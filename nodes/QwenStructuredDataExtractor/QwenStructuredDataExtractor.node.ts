import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { buildExecutionHints } from './executionHints';
import { addTokenUsage, EMPTY_TOKEN_USAGE, ExecutionTracer, type ITokenUsage } from './executionTracer';
import { extractItem, type INodeOptions } from './extractItem';
import { CREDENTIAL_TYPE, getBaseUrl, loadModels } from './genericFunctions';
import { qwenStructuredDataExtractorProperties } from './properties';

export class QwenStructuredDataExtractor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Qwen Structured Data Extractor',
		name: 'qwenStructuredDataExtractor',
		icon: {
			light: 'file:qwen.svg',
			dark: 'file:qwen.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["model"]}}',
		description: 'Extract structured data from conversations using Qwen and a JSON Schema',
		defaults: {
			name: 'Qwen Structured Data Extractor',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: CREDENTIAL_TYPE,
				required: true,
			},
		],
		properties: qwenStructuredDataExtractorProperties,
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadModels(this);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const baseUrl = await getBaseUrl(this);

		const runStartedAt = Date.now();
		let runUsage: ITokenUsage = EMPTY_TOKEN_USAGE;
		let failedItems = 0;
		let truncatedItems = 0;
		const schemaWarnings = new Set<string>();

		for (let i = 0; i < items.length; i++) {
			const tracer = new ExecutionTracer();
			let includeTrace = false;

			try {
				includeTrace =
					(this.getNodeParameter('options', i, {}) as INodeOptions).includeTrace === true;

				const result = await extractItem(this, i, baseUrl, tracer);

				for (const warning of result.warnings) {
					schemaWarnings.add(warning);
				}
				runUsage = addTokenUsage(runUsage, result.usage);
				if (result.finishReason === 'length') {
					truncatedItems++;
				}

				this.logger.debug('Qwen Structured Data Extractor processed an item', {
					node: this.getNode().name,
					itemIndex: i,
					finishReason: result.finishReason,
					totalTokens: result.usage.totalTokens,
					durationMs: tracer.elapsedMs,
				});

				returnData.push({ json: result.json, pairedItem: { item: i } });
			} catch (error) {
				failedItems++;

				this.logger.error('Qwen Structured Data Extractor failed on an item', {
					node: this.getNode().name,
					itemIndex: i,
					error: (error as Error).message,
					durationMs: tracer.elapsedMs,
				});

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							...(includeTrace
								? { meta: { itemIndex: i, durationMs: tracer.elapsedMs, steps: tracer.toJson() } }
								: {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}

				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		this.addExecutionHints(
			...buildExecutionHints({
				totalItems: items.length,
				failedItems,
				truncatedItems,
				schemaWarnings: [...schemaWarnings],
				usage: runUsage,
				durationMs: Date.now() - runStartedAt,
			}),
		);

		return [returnData];
	}
}
