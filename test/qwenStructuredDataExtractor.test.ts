import { QwenStructuredDataExtractor } from '../nodes/QwenStructuredDataExtractor/QwenStructuredDataExtractor.node';
import { CREDENTIAL_TYPE } from '../nodes/QwenStructuredDataExtractor/genericFunctions';
import {
	createMockContext,
	DEFAULT_SCHEMA,
	LOOSE_SCHEMA,
	okResponse,
	TEST_BASE_URL,
	type IMockContextConfig,
} from './helpers';

const node = new QwenStructuredDataExtractor();

async function run(config: IMockContextConfig) {
	const mock = createMockContext(config);
	const output = await node.execute.call(mock.ctx);
	return { ...mock, items: output[0] };
}

describe('node description', () => {
	it('requires exactly one credential, the one this package owns', () => {
		expect(node.description.credentials).toEqual([{ name: CREDENTIAL_TYPE, required: true }]);
	});

	it('does not pin a default model', () => {
		const model = node.description.properties.find((p) => p.name === 'model');
		expect(model?.default).toBe('');
	});
});

describe('execute - happy path', () => {
	it('emits the extracted fields flat at the root', async () => {
		const { items } = await run({ responses: [okResponse('{"amount":2,"size":"L"}')] });
		expect(items[0].json).toEqual({ amount: 2, size: 'L' });
	});

	it('calls chat/completions on the credential base URL with the owned credential type', async () => {
		const { requests } = await run({ responses: [okResponse('{"amount":1}')] });

		expect(requests).toHaveLength(1);
		expect(requests[0].credentialType).toBe(CREDENTIAL_TYPE);
		expect(requests[0].options.url).toBe(`${TEST_BASE_URL}/chat/completions`);
		expect(requests[0].options.method).toBe('POST');
	});

	it('never sets an Authorization header itself - the credential injects it', async () => {
		const { requests } = await run({ responses: [okResponse('{"amount":1}')] });
		const headers = (requests[0].options.headers ?? {}) as Record<string, string>;
		expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
	});

	it('sends enable_thinking:false by default and no max_tokens', async () => {
		const { requests } = await run({ responses: [okResponse('{"amount":1}')] });
		const body = requests[0].options.body as Record<string, unknown>;

		expect(body.enable_thinking).toBe(false);
		expect(body).not.toHaveProperty('max_tokens');
	});

	it('omits enable_thinking when the option is turned off', async () => {
		const { requests } = await run({
			responses: [okResponse('{"amount":1}')],
			options: { disableThinking: false },
		});
		expect(requests[0].options.body as Record<string, unknown>).not.toHaveProperty(
			'enable_thinking',
		);
	});

	it('strips a markdown fence from the model output', async () => {
		const { items } = await run({ responses: [okResponse('```json\n{"amount":3}\n```')] });
		expect(items[0].json).toEqual({ amount: 3 });
	});

	it('processes every input item and pairs each output back', async () => {
		const { items } = await run({
			responses: [okResponse('{"amount":1}'), okResponse('{"amount":2}')],
		});

		expect(items.map((i) => i.json)).toEqual([{ amount: 1 }, { amount: 2 }]);
		expect(items.map((i) => i.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});
});

describe('execute - output shaping', () => {
	it('wraps the data when Output Key Name is set', async () => {
		const { items } = await run({
			responses: [okResponse('{"amount":2}')],
			options: { outputKeyName: 'order_info' },
		});
		expect(items[0].json).toEqual({ order_info: { amount: 2 } });
	});

	it('keeps tokens out of the output so strict schemas keep their shape', async () => {
		const { items } = await run({ responses: [okResponse('{"amount":2}')] });
		expect(items[0].json).not.toHaveProperty('meta');
		expect(items[0].json).not.toHaveProperty('tokens');
	});

	it('attaches trace meta when Include Execution Trace is on', async () => {
		const { items } = await run({
			responses: [
				okResponse('{"amount":2}', {
					prompt_tokens: 812,
					completion_tokens: 155,
					total_tokens: 967,
					prompt_tokens_details: { cached_tokens: 640 },
				}),
			],
			options: { includeTrace: true },
		});

		const meta = (items[0].json as Record<string, any>).meta;
		expect(meta.tokens).toEqual({
			promptTokens: 812,
			completionTokens: 155,
			totalTokens: 967,
			cachedTokens: 640,
		});
		expect(meta.steps.map((s: { name: string }) => s.name)).toEqual([
			'parse_schema',
			'validate',
			'llm_call',
			'parse_output',
		]);
	});

	it('adds raw request/response only when both trace and raw are on', async () => {
		const withRawOnly = await run({
			responses: [okResponse('{"amount":2}')],
			options: { includeRaw: true },
		});
		expect(withRawOnly.items[0].json).not.toHaveProperty('meta');

		const withBoth = await run({
			responses: [okResponse('{"amount":2}')],
			options: { includeTrace: true, includeRaw: true },
		});
		const meta = (withBoth.items[0].json as Record<string, any>).meta;
		expect(meta.rawRequest).toBeDefined();
		expect(meta.rawResponse).toBeDefined();
	});
});

describe('execute - guards before spending tokens', () => {
	it('rejects empty user input without calling the API', async () => {
		await expect(
			run({ responses: [], items: 1, params: { userInput: '   ' } }),
		).rejects.toThrow(/is empty/);
	});

	it('rejects a missing model without calling the API', async () => {
		const mock = createMockContext({ responses: [], items: 1, params: { model: '' } });
		await expect(node.execute.call(mock.ctx)).rejects.toThrow(/No model selected/);
		expect(mock.requests).toHaveLength(0);
	});

	it('surfaces strict-mode schema warnings once, not per item', async () => {
		const { hints } = await run({
			responses: [okResponse('{"amount":1}'), okResponse('{"amount":2}')],
			params: { jsonSchema: LOOSE_SCHEMA },
		});

		const warnings = hints.filter((h) => h.message.includes('additionalProperties'));
		expect(warnings).toHaveLength(1);
	});

	it('accepts a schema supplied as an already-parsed object', async () => {
		const { items } = await run({
			responses: [okResponse('{"amount":1}')],
			params: { jsonSchema: JSON.parse(DEFAULT_SCHEMA) },
		});
		expect(items[0].json).toEqual({ amount: 1 });
	});
});

describe('execute - failures', () => {
	it('adds the thinking hint to a DashScope enable_thinking rejection', async () => {
		await expect(
			run({
				responses: [new Error('parameter.enable_thinking must be set to false for non-streaming calls')],
			}),
		).rejects.toThrow(/Disable Thinking Mode/);
	});

	it('reports unparseable output and mentions truncation when finish_reason is length', async () => {
		await expect(
			run({ responses: [okResponse('{"amount": ', undefined, 'length')] }),
		).rejects.toThrow(/finish_reason=length/);
	});

	it('warns about truncated items in the output pane', async () => {
		const { hints } = await run({
			responses: [okResponse('{"amount":1}', undefined, 'length')],
		});
		expect(hints.some((h) => h.message.includes('cut off'))).toBe(true);
	});

	it('collects errors per item when continueOnFail is on', async () => {
		const { items } = await run({
			responses: [new Error('upstream exploded'), okResponse('{"amount":2}')],
			continueOnFail: true,
		});

		expect(items[0].json.error).toContain('upstream exploded');
		expect(items[1].json).toEqual({ amount: 2 });
		expect(items[0].pairedItem).toEqual({ item: 0 });
	});

	it('logs an ai-llm-errored event when the call fails', async () => {
		const mock = createMockContext({ responses: [new Error('nope')], continueOnFail: true });
		await node.execute.call(mock.ctx);
		expect(mock.aiEvents.map((e) => e.event)).toContain('ai-llm-errored');
	});
});

describe('execute - run summary', () => {
	it('reports succeeded/total and aggregated tokens across items', async () => {
		const { hints } = await run({
			responses: [
				okResponse('{"amount":1}', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
				okResponse('{"amount":2}', { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }),
			],
		});

		expect(hints[0].message).toContain('2/2 items');
		expect(hints[0].message).toContain('~40 tokens (prompt 30 / completion 10)');
	});
});
