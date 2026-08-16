import {
	buildRequestBody,
	ensureJsonKeyword,
	extractJsonPayload,
	stripCodeFence,
	type IExtractionRequest,
} from '../nodes/QwenStructuredDataExtractor/requestBody';

const base: IExtractionRequest = {
	model: 'qwen-plus',
	systemPrompt: 'Extract json fields.',
	userInput: '- user: two shirts',
	schema: { type: 'object', properties: { amount: { type: 'integer' } } },
	schemaName: 'extracted_data',
	temperature: 0,
	disableThinking: true,
};

describe('buildRequestBody', () => {
	it('sends enable_thinking:false when thinking is disabled', () => {
		expect(buildRequestBody(base).enable_thinking).toBe(false);
	});

	it('omits enable_thinking entirely when the option is off', () => {
		const body = buildRequestBody({ ...base, disableThinking: false });
		expect('enable_thinking' in body).toBe(false);
	});

	it('never sets max_tokens', () => {
		expect(buildRequestBody(base)).not.toHaveProperty('max_tokens');
		expect(buildRequestBody({ ...base, disableThinking: false })).not.toHaveProperty('max_tokens');
	});

	it('puts the static system prompt before the per-item conversation', () => {
		const { messages } = buildRequestBody(base);
		expect(messages[0].role).toBe('system');
		expect(messages[0].content).toBe('Extract json fields.');
		expect(messages[1].role).toBe('user');
		expect(messages[1].content).toContain('- user: two shirts');
	});

	it('requests strict json_schema with the configured schema name', () => {
		const { response_format } = buildRequestBody({ ...base, schemaName: 'order_info' });
		expect(response_format.type).toBe('json_schema');
		expect(response_format.json_schema.strict).toBe(true);
		expect(response_format.json_schema.name).toBe('order_info');
		expect(response_format.json_schema.schema).toBe(base.schema);
	});

	it('passes temperature through unchanged', () => {
		expect(buildRequestBody({ ...base, temperature: 0.7 }).temperature).toBe(0.7);
	});
});

describe('ensureJsonKeyword', () => {
	it('appends a reminder when the prompt lacks the word json', () => {
		const result = ensureJsonKeyword('Extract the order details.');
		expect(result.toLowerCase()).toContain('json');
		expect(result.startsWith('Extract the order details.')).toBe(true);
	});

	it('leaves a prompt that already mentions json byte-identical', () => {
		const prompt = 'Return JSON only.';
		expect(ensureJsonKeyword(prompt)).toBe(prompt);
	});

	it('matches the keyword case-insensitively', () => {
		const prompt = 'reply as json';
		expect(ensureJsonKeyword(prompt)).toBe(prompt);
	});
});

describe('stripCodeFence', () => {
	it('unwraps a ```json fence', () => {
		expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
	});

	it('unwraps a bare ``` fence', () => {
		expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
	});

	it('leaves unfenced JSON untouched apart from trimming', () => {
		expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
	});
});

describe('extractJsonPayload', () => {
	it('returns clean JSON unchanged', () => {
		expect(extractJsonPayload('{"a":1}')).toBe('{"a":1}');
	});

	it('unwraps a code fence like stripCodeFence does', () => {
		expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
	});

	it('drops reasoning text a thinking model leaked before the object', () => {
		const raw = 'Let me think about the order.\nThe user wants two.\n{"amount":2}';
		expect(extractJsonPayload(raw)).toBe('{"amount":2}');
	});

	it('drops trailing commentary after the object', () => {
		expect(extractJsonPayload('Here you go: {"amount":2} — hope that helps!')).toBe(
			'{"amount":2}',
		);
	});

	it('is not fooled by braces inside string values', () => {
		const raw = 'note: {"address":"12 } Main St","city":"Hanoi"}';
		expect(extractJsonPayload(raw)).toBe('{"address":"12 } Main St","city":"Hanoi"}');
	});

	it('is not fooled by an escaped quote before a brace', () => {
		const raw = 'x {"note":"he said \\"} done\\"","ok":true}';
		expect(extractJsonPayload(raw)).toBe('{"note":"he said \\"} done\\"","ok":true}');
	});

	it('keeps nested objects and arrays whole', () => {
		const raw = 'result: {"items":[{"id":1},{"id":2}],"n":2}';
		expect(extractJsonPayload(raw)).toBe('{"items":[{"id":1},{"id":2}],"n":2}');
	});

	it('extracts a top-level array', () => {
		expect(extractJsonPayload('here: [{"id":1}]')).toBe('[{"id":1}]');
	});

	it('returns the text untouched when it holds no JSON at all', () => {
		expect(extractJsonPayload('I cannot help with that.')).toBe('I cannot help with that.');
	});

	it('returns the text untouched when the JSON never closes', () => {
		expect(extractJsonPayload('{"amount": ')).toBe('{"amount":');
	});
});
