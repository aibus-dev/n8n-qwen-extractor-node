import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { describeApiError } from './executionHints';
import { readTokenUsage, type ExecutionTracer, type ITokenUsage } from './executionTracer';
import { CREDENTIAL_TYPE, validateExtractionInput } from './genericFunctions';
import { buildRequestBody, ensureJsonKeyword, stripCodeFence } from './requestBody';

export interface INodeOptions {
	autoJsonKeyword?: boolean;
	disableThinking?: boolean;
	includeRaw?: boolean;
	includeTrace?: boolean;
	outputKeyName?: string;
	schemaName?: string;
	temperature?: number;
}

export interface IItemResult {
	json: IDataObject;
	usage: ITokenUsage;
	finishReason: string;
	warnings: string[];
}

export async function extractItem(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	tracer: ExecutionTracer,
): Promise<IItemResult> {
	const model = ctx.getNodeParameter('model', itemIndex) as string;
	const rawSystemPrompt = ctx.getNodeParameter('systemPrompt', itemIndex) as string;
	const userInput = ctx.getNodeParameter('userInput', itemIndex) as string;
	const rawSchema = ctx.getNodeParameter('jsonSchema', itemIndex);
	const options = ctx.getNodeParameter('options', itemIndex, {}) as INodeOptions;

	const outputKeyName = options.outputKeyName?.trim() ?? '';
	const includeTrace = options.includeTrace === true;
	const includeRaw = options.includeRaw === true;

	const schema = tracer.stepSync('parse_schema', () => {
		return (typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema) as object;
	});

	const warnings = tracer.stepSync('validate', () =>
		validateExtractionInput(ctx, itemIndex, { model, userInput, schema }),
	);

	const body = buildRequestBody({
		model,
		systemPrompt:
			(options.autoJsonKeyword ?? true) ? ensureJsonKeyword(rawSystemPrompt) : rawSystemPrompt,
		userInput,
		schema,
		schemaName: options.schemaName ?? 'extracted_data',
		temperature: options.temperature ?? 0,
		disableThinking: options.disableThinking ?? true,
	});

	const response = await tracer.step(
		'llm_call',
		async () => {
			try {
				return await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_TYPE, {
					method: 'POST',
					url: `${baseUrl}/chat/completions`,
					body,
					json: true,
				});
			} catch (error) {
				ctx.logAiEvent('ai-llm-errored', (error as Error).message);
				throw new NodeApiError(ctx.getNode(), error as JsonObject, {
					message: describeApiError(error as Error),
					itemIndex,
				});
			}
		},
		{ model, temperature: body.temperature },
	);

	const usage = readTokenUsage(response);
	const finishReason: string =
		(response as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0]?.finish_reason ??
		'unknown';

	tracer.annotate('llm_call', { finishReason, ...usage });
	ctx.logAiEvent('ai-llm-generated-output');

	const rawContent: string =
		(response as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
			?.content ?? '{}';

	const extracted = tracer.stepSync('parse_output', () => {
		try {
			return JSON.parse(stripCodeFence(rawContent)) as IDataObject;
		} catch {
			const hint =
				finishReason === 'length'
					? ' (finish_reason=length — the output was cut off at the token limit)'
					: '';
			throw new NodeOperationError(
				ctx.getNode(),
				`Could not parse JSON from the Qwen response${hint}: ${rawContent}`,
				{ itemIndex },
			);
		}
	});

	const json: IDataObject = outputKeyName ? { [outputKeyName]: extracted } : { ...extracted };

	if (includeTrace) {
		json.meta = {
			model,
			itemIndex,
			finishReason,
			durationMs: tracer.elapsedMs,
			llmDurationMs: tracer.durationOf('llm_call'),
			tokens: { ...usage },
			steps: tracer.toJson(),
			...(includeRaw ? { rawRequest: body, rawResponse: response } : {}),
		};
	}

	return { json, usage, finishReason, warnings };
}
