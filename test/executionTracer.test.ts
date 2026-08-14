import {
	addTokenUsage,
	EMPTY_TOKEN_USAGE,
	ExecutionTracer,
	formatDuration,
	readTokenUsage,
} from '../nodes/QwenStructuredDataExtractor/executionTracer';
import { buildExecutionHints, describeApiError } from '../nodes/QwenStructuredDataExtractor/executionHints';

describe('readTokenUsage', () => {
	it('reads the standard OpenAI-compatible usage block', () => {
		expect(
			readTokenUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }),
		).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedTokens: 0 });
	});

	it('picks up DashScope cached_tokens from prompt_tokens_details', () => {
		const usage = readTokenUsage({
			usage: {
				prompt_tokens: 100,
				completion_tokens: 20,
				total_tokens: 120,
				prompt_tokens_details: { cached_tokens: 64 },
			},
		});
		expect(usage.cachedTokens).toBe(64);
	});

	it('derives total_tokens when the endpoint omits it', () => {
		expect(readTokenUsage({ usage: { prompt_tokens: 7, completion_tokens: 3 } }).totalTokens).toBe(
			10,
		);
	});

	it('returns zeros for a response with no usage block', () => {
		expect(readTokenUsage({})).toEqual(EMPTY_TOKEN_USAGE);
	});
});

describe('addTokenUsage', () => {
	it('sums every counter including cached tokens', () => {
		const a = { promptTokens: 1, completionTokens: 2, totalTokens: 3, cachedTokens: 4 };
		expect(addTokenUsage(a, a)).toEqual({
			promptTokens: 2,
			completionTokens: 4,
			totalTokens: 6,
			cachedTokens: 8,
		});
	});
});

describe('ExecutionTracer', () => {
	it('records successful async and sync steps', async () => {
		const tracer = new ExecutionTracer();
		await tracer.step('llm_call', async () => 'ok');
		tracer.stepSync('parse_output', () => 1);

		const steps = tracer.toJson();
		expect(steps.map((s) => s.name)).toEqual(['llm_call', 'parse_output']);
		expect(steps.every((s) => s.status === 'ok')).toBe(true);
	});

	it('records a failed step and rethrows the original error', async () => {
		const tracer = new ExecutionTracer();
		const boom = new Error('boom');

		await expect(tracer.step('llm_call', async () => Promise.reject(boom))).rejects.toBe(boom);

		const [step] = tracer.toJson();
		expect(step.status).toBe('error');
		expect((step.detail as Record<string, unknown>).error).toBe('boom');
	});

	it('annotates the most recent step of a given name', async () => {
		const tracer = new ExecutionTracer();
		await tracer.step('llm_call', async () => 'ok');
		tracer.annotate('llm_call', { finishReason: 'stop' });

		expect((tracer.toJson()[0].detail as Record<string, unknown>).finishReason).toBe('stop');
	});

	it('sums durationOf across repeated steps and ignores unknown names', async () => {
		const tracer = new ExecutionTracer();
		await tracer.step('llm_call', async () => 'a');
		await tracer.step('llm_call', async () => 'b');

		expect(tracer.durationOf('llm_call')).toBeGreaterThanOrEqual(0);
		expect(tracer.durationOf('nope')).toBe(0);
	});
});

describe('formatDuration', () => {
	it.each([
		[312, '312ms'],
		[1000, '1.0s'],
		[2412, '2.4s'],
	])('formats %ims as %s', (ms, expected) => {
		expect(formatDuration(ms)).toBe(expected);
	});
});

describe('buildExecutionHints', () => {
	const usage = { promptTokens: 912, completionTokens: 175, totalTokens: 1087, cachedTokens: 640 };

	it('summarises items, duration, tokens and cache hits', () => {
		const [hint] = buildExecutionHints({
			totalItems: 2,
			failedItems: 0,
			truncatedItems: 0,
			schemaWarnings: [],
			usage,
			durationMs: 2412,
		});

		expect(hint.message).toBe('2/2 items in 2.4s | ~1087 tokens (prompt 912 / completion 175) | 640 cached');
		expect(hint.type).toBe('info');
	});

	it('drops the breakdown when the endpoint reports only a total', () => {
		const [hint] = buildExecutionHints({
			totalItems: 1,
			failedItems: 0,
			truncatedItems: 0,
			schemaWarnings: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 50, cachedTokens: 0 },
			durationMs: 100,
		});
		expect(hint.message).toBe('1/1 items in 100ms | ~50 tokens');
	});

	it('marks the summary as a warning and adds hints for failures and truncation', () => {
		const hints = buildExecutionHints({
			totalItems: 3,
			failedItems: 1,
			truncatedItems: 2,
			schemaWarnings: ['schema warning'],
			usage,
			durationMs: 500,
		});

		expect(hints[0].type).toBe('warning');
		expect(hints[0].message).toContain('2/3 items');
		expect(hints[1].message).toContain('finish_reason=length');
		expect(hints[2].message).toBe('schema warning');
	});
});

describe('describeApiError', () => {
	it('points at the Disable Thinking Mode option for enable_thinking failures', () => {
		const message = describeApiError(
			new Error('parameter.enable_thinking must be set to false for non-streaming calls'),
		);
		expect(message).toContain('Disable Thinking Mode');
	});

	it('points at the Auto Ensure JSON Keyword option for the missing-json failure', () => {
		const message = describeApiError(
			new Error(`'messages' must contain the word 'json' in some form`),
		);
		expect(message).toContain('Auto Ensure JSON Keyword');
	});

	it('passes unrelated errors through unchanged', () => {
		expect(describeApiError(new Error('rate limit exceeded'))).toBe('rate limit exceeded');
	});
});
