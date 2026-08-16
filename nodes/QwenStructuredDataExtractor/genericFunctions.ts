import type { IExecuteFunctions, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const CREDENTIAL_TYPE = 'qwenStructuredExtractorApi';

export const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/**
 * Alibaba documents strict json_schema output for the Qwen3.7-Plus, Qwen3.7-Max and
 * Qwen3.8-Max series only. Everything else answers a json_schema request with a 400.
 * https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output
 */
const JSON_SCHEMA_MODELS = /^qwen3\.(7-plus|7-max|8-max)\b/i;

/** Ids served by this endpoint that a chat/completions call can never use. */
const NON_CHAT_MODELS = [
	/embedding/i,
	/^gte-/i,
	/^bge-/i,
	/rerank/i,
	/^wanx/i,
	/^wan\d/i,
	/^flux/i,
	/^stable-diffusion/i,
	/^cosyvoice/i,
	/^sambert/i,
	/^paraformer/i,
	/^sensevoice/i,
	/(^|-)tts(-|$)/i,
	/^ocr/i,
	/^image-/i,
	/^video-/i,
	/^background-generation/i,
];

export const SUPPORTS_JSON_SCHEMA = 'Supports strict JSON Schema output';

export const MAY_REJECT_JSON_SCHEMA =
	'Not documented for JSON Schema mode — may reject this node with a 400';

export function supportsJsonSchema(modelId: string): boolean {
	return JSON_SCHEMA_MODELS.test(modelId);
}

export function isChatModel(modelId: string): boolean {
	return !NON_CHAT_MODELS.some((pattern) => pattern.test(modelId));
}

export const FALLBACK_MODELS: INodePropertyOptions[] = [
	{
		name: 'Qwen3.7 Plus (Recommended)',
		value: 'qwen3.7-plus',
		description: `Balanced speed and extraction accuracy. ${SUPPORTS_JSON_SCHEMA}.`,
	},
	{
		name: 'Qwen3.7 Max',
		value: 'qwen3.7-max',
		description: `Stronger reasoning for messy conversations. ${SUPPORTS_JSON_SCHEMA}.`,
	},
	{
		name: 'Qwen3.8 Max',
		value: 'qwen3.8-max',
		description: `Latest flagship, best extraction quality. ${SUPPORTS_JSON_SCHEMA}.`,
	},
];

export function validateExtractionInput(
	ctx: IExecuteFunctions,
	itemIndex: number,
	input: { model: string; userInput: unknown; schema: unknown },
): string[] {
	const fail = (message: string) => new NodeOperationError(ctx.getNode(), message, { itemIndex });

	if (!input.model || input.model.trim() === '') {
		throw fail('No model selected. Open the "Model Name or ID" dropdown and pick one.');
	}

	const text = input.userInput === undefined || input.userInput === null ? '' : String(input.userInput);
	if (text.trim() === '') {
		throw fail(
			'"User Input / Conversation History" is empty, so there is nothing to extract. Check that the expression points at the field holding the conversation (the default looks for conversationHistory, chat_log, message).',
		);
	}

	if (input.schema === null || typeof input.schema !== 'object' || Array.isArray(input.schema)) {
		throw fail('"JSON Schema Output" must be a JSON object.');
	}

	const schema = input.schema as Record<string, unknown>;
	const properties = schema.properties as Record<string, unknown> | undefined;

	if (properties === null || typeof properties !== 'object' || Object.keys(properties).length === 0) {
		throw fail('"JSON Schema Output" must declare "properties" with at least one field.');
	}

	const warnings: string[] = [];

	if (schema.additionalProperties !== false) {
		warnings.push(
			'JSON Schema is missing "additionalProperties": false — Qwen strict mode usually returns a 400 without it.',
		);
	}

	const required: string[] = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	const missing = Object.keys(properties).filter((key) => !required.includes(key));

	if (missing.length > 0) {
		warnings.push(
			`Strict mode requires EVERY field to be listed in "required". Missing: ${missing.join(', ')}.`,
		);
	}

	return warnings;
}

export async function getBaseUrl(ctx: IExecuteFunctions | ILoadOptionsFunctions): Promise<string> {
	const credentials = await ctx.getCredentials(CREDENTIAL_TYPE);
	return ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getStatusCode(error: unknown): number | undefined {
	const e = error as {
		statusCode?: number;
		httpCode?: number | string;
		response?: { status?: number; statusCode?: number };
	};
	const raw = e?.statusCode ?? e?.response?.status ?? e?.response?.statusCode ?? e?.httpCode;
	const code = typeof raw === 'string' ? Number(raw) : raw;
	return typeof code === 'number' && Number.isFinite(code) ? code : undefined;
}

export async function loadModels(ctx: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const baseUrl = await getBaseUrl(ctx);

	let response: unknown;
	try {
		response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_TYPE, {
			method: 'GET',
			url: `${baseUrl}/models`,
			json: true,
		});
	} catch (error) {
		const status = getStatusCode(error);

		if (status === 401 || status === 403) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Qwen rejected the credential while loading the model list (HTTP ${status}).`,
				{
					description:
						'Check the API Key and Base URL on the credential, then use its Test button to confirm they work.',
				},
			);
		}

		return FALLBACK_MODELS;
	}

	const parsed = typeof response === 'string' ? safeParse(response) : response;
	const entries = (parsed as { data?: Array<{ id?: unknown }> })?.data ?? [];
	const ids = entries
		.map((entry) => entry?.id)
		.filter((id): id is string => typeof id === 'string' && id.length > 0)
		.filter(isChatModel);

	if (ids.length === 0) {
		return FALLBACK_MODELS;
	}

	// Capable models first, so the ones that actually work with this node are the obvious pick.
	return ids
		.sort((a, b) => {
			const byCapability = Number(supportsJsonSchema(b)) - Number(supportsJsonSchema(a));
			return byCapability !== 0 ? byCapability : a.localeCompare(b, 'en');
		})
		.map((id) => ({
			name: id,
			value: id,
			description: supportsJsonSchema(id) ? SUPPORTS_JSON_SCHEMA : MAY_REJECT_JSON_SCHEMA,
		}));
}

function safeParse(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}
