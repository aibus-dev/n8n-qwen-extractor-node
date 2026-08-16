import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { describeApiError } from './executionHints';
import { readTokenUsage, type ExecutionTracer, type ITokenUsage } from './executionTracer';
import { CREDENTIAL_TYPE, validateExtractionInput } from './genericFunctions';
import { buildRequestBody, ensureJsonKeyword, extractJsonPayload } from './requestBody';

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

	const message = (
		response as {
			choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>;
		}
	)?.choices?.[0]?.message;

	const rawContent = typeof message?.content === 'string' ? message.content : '';

	const extracted = tracer.stepSync('parse_output', () => {
		if (rawContent.trim() === '') {
			throw new NodeOperationError(
				ctx.getNode(),
				describeEmptyContent(finishReason, message?.reasoning_content),
				{ itemIndex },
			);
		}

		try {
			return JSON.parse(extractJsonPayload(rawContent)) as unknown;
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

	const isPlainObject =
		typeof extracted === 'object' && extracted !== null && !Array.isArray(extracted);

	if (!outputKeyName && !isPlainObject) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Qwen returned ${describeShape(extracted)} at the top level, but an n8n item must be an object. Set the "Output Key Name" option to wrap it, or give the schema an object root.`,
			{ itemIndex },
		);
	}

	const json: IDataObject = outputKeyName
		? { [outputKeyName]: extracted as IDataObject[string] }
		: { ...(extracted as IDataObject) };

	if (includeTrace) {
		// Never clobber an extracted field that happens to be called "meta".
		json[firstFreeKey(json, 'meta')] = {
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

function describeEmptyContent(finishReason: string, reasoningContent: unknown): string {
	const reasons: string[] = [];

	if (finishReason === 'content_filter') {
		reasons.push('finish_reason=content_filter — Qwen blocked the generation');
	}
	if (finishReason === 'length') {
		reasons.push('finish_reason=length — the output was cut off at the token limit');
	}
	if (typeof reasoningContent === 'string' && reasoningContent.trim() !== '') {
		reasons.push(
			'the model answered in "reasoning_content" instead of "content" — turn on the "Disable Thinking Mode" option',
		);
	}

	return reasons.length > 0
		? `Qwen returned no content for this item: ${reasons.join('; ')}.`
		: 'Qwen returned no content for this item — the response carried no choices[0].message.content.';
}

function describeShape(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	return `a ${typeof value}`;
}

function firstFreeKey(json: IDataObject, preferred: string): string {
	if (!(preferred in json)) {
		return preferred;
	}

	let suffix = 2;
	let candidate = `_${preferred}`;
	while (candidate in json) {
		candidate = `_${preferred}${suffix++}`;
	}
	return candidate;
}
