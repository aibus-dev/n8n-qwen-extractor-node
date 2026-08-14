import type { IExecuteFunctions } from 'n8n-workflow';
import {
	CREDENTIAL_TYPE,
	FALLBACK_MODELS,
	getBaseUrl,
	loadModels,
	validateExtractionInput,
} from '../nodes/QwenStructuredDataExtractor/genericFunctions';
import { createLoadOptionsContext, TEST_BASE_URL } from './helpers';

const ctx = { getNode: () => ({ name: 'Qwen Structured Data Extractor' }) } as unknown as IExecuteFunctions;

const validSchema = {
	type: 'object',
	properties: { amount: { type: 'integer' } },
	required: ['amount'],
	additionalProperties: false,
};

const validInput = { model: 'qwen-plus', userInput: '- user: hi', schema: validSchema };

describe('validateExtractionInput', () => {
	it('accepts a strict-clean schema without warnings', () => {
		expect(validateExtractionInput(ctx, 0, validInput)).toEqual([]);
	});

	it('throws when no model is selected', () => {
		expect(() => validateExtractionInput(ctx, 0, { ...validInput, model: '  ' })).toThrow(
			/No model selected/,
		);
	});

	it('throws on empty user input instead of silently extracting nothing', () => {
		expect(() => validateExtractionInput(ctx, 0, { ...validInput, userInput: '   ' })).toThrow(
			/is empty/,
		);
	});

	it.each([
		['null', null],
		['an array', []],
		['a string', 'not an object'],
	])('throws when the schema is %s', (_label, schema) => {
		expect(() => validateExtractionInput(ctx, 0, { ...validInput, schema })).toThrow(
			/must be a JSON object/,
		);
	});

	it('throws when the schema declares no properties', () => {
		expect(() =>
			validateExtractionInput(ctx, 0, { ...validInput, schema: { type: 'object', properties: {} } }),
		).toThrow(/at least one field/);
	});

	it('warns when additionalProperties is not false', () => {
		const warnings = validateExtractionInput(ctx, 0, {
			...validInput,
			schema: { ...validSchema, additionalProperties: true },
		});
		expect(warnings.join(' ')).toContain('additionalProperties');
	});

	it('warns listing the fields missing from required', () => {
		const warnings = validateExtractionInput(ctx, 0, {
			...validInput,
			schema: {
				type: 'object',
				properties: { amount: {}, size: {}, phone: {} },
				required: ['amount'],
				additionalProperties: false,
			},
		});
		expect(warnings.join(' ')).toContain('size, phone');
	});
});

describe('getBaseUrl', () => {
	it('strips trailing slashes so path joins stay well formed', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({
			response: { data: [] },
			credentials: { apiKey: 'k', baseUrl: 'https://example.test/v1///' },
		});
		expect(await getBaseUrl(loadCtx)).toBe('https://example.test/v1');
	});

	it('falls back to the DashScope default when the credential has no base URL', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({
			response: { data: [] },
			credentials: { apiKey: 'k' },
		});
		expect(await getBaseUrl(loadCtx)).toContain('dashscope');
	});
});

describe('loadModels', () => {
	it('returns model ids from /models sorted alphabetically', async () => {
		const { ctx: loadCtx, requests } = createLoadOptionsContext({
			response: { data: [{ id: 'qwen-turbo' }, { id: 'qwen-max' }, { id: 'qwen-plus' }] },
		});

		const models = await loadModels(loadCtx);

		expect(models.map((m) => m.value)).toEqual(['qwen-max', 'qwen-plus', 'qwen-turbo']);
		expect(requests[0].credentialType).toBe(CREDENTIAL_TYPE);
		expect(requests[0].options.url).toBe(`${TEST_BASE_URL}/models`);
		expect(requests[0].options.method).toBe('GET');
	});

	const httpError = (
		status: number,
		shape: 'statusCode' | 'httpCode' | 'response' = 'statusCode',
	) => {
		const error = new Error(`HTTP ${status}`) as Error & Record<string, unknown>;
		if (shape === 'statusCode') error.statusCode = status;
		if (shape === 'httpCode') error.httpCode = String(status);
		if (shape === 'response') error.response = { status };
		return error;
	};

	it('falls back to the built-in list when the endpoint has no /models route', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({ response: httpError(404) });
		expect(await loadModels(loadCtx)).toEqual(FALLBACK_MODELS);
	});

	it.each([401, 403])('throws instead of falling back on HTTP %i', async (status) => {
		const { ctx: loadCtx } = createLoadOptionsContext({ response: httpError(status) });
		await expect(loadModels(loadCtx)).rejects.toThrow(/rejected the credential/);
	});

	it.each(['statusCode', 'httpCode', 'response'] as const)(
		'detects a 401 carried on the "%s" property',
		async (shape) => {
			const { ctx: loadCtx } = createLoadOptionsContext({ response: httpError(401, shape) });
			await expect(loadModels(loadCtx)).rejects.toThrow(/rejected the credential/);
		},
	);

	it('falls back when the error carries no status at all (timeout, DNS failure)', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({ response: new Error('ETIMEDOUT') });
		expect(await loadModels(loadCtx)).toEqual(FALLBACK_MODELS);
	});

	it('falls back when /models returns an empty list', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({ response: { data: [] } });
		expect(await loadModels(loadCtx)).toEqual(FALLBACK_MODELS);
	});

	it('ignores entries without a usable id', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({
			response: { data: [{ id: 'qwen-plus' }, { id: '' }, { id: 42 }, {}] },
		});
		expect(await loadModels(loadCtx)).toEqual([{ name: 'qwen-plus', value: 'qwen-plus' }]);
	});

	it('parses a stringified response body', async () => {
		const { ctx: loadCtx } = createLoadOptionsContext({
			response: JSON.stringify({ data: [{ id: 'qwen-plus' }] }),
		});
		expect(await loadModels(loadCtx)).toEqual([{ name: 'qwen-plus', value: 'qwen-plus' }]);
	});
});
