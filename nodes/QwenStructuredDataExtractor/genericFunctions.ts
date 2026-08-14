import type { IExecuteFunctions, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const CREDENTIAL_TYPE = 'qwenStructuredExtractorApi';

export const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export const FALLBACK_MODELS: INodePropertyOptions[] = [
	{
		name: 'Qwen Plus (Recommended)',
		value: 'qwen-plus',
		description: 'Balanced speed and extraction accuracy',
	},
	{
		name: 'Qwen Turbo',
		value: 'qwen-turbo',
		description: 'Fastest and cheapest option',
	},
	{
		name: 'Qwen Max',
		value: 'qwen-max',
		description: 'Strongest reasoning for complex conversations',
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
		.filter((id): id is string => typeof id === 'string' && id.length > 0);

	if (ids.length === 0) {
		return FALLBACK_MODELS;
	}

	return ids.sort((a, b) => a.localeCompare(b, 'en')).map((id) => ({ name: id, value: id }));
}

function safeParse(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}
