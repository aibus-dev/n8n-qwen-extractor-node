import type {
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	NodeExecutionHint,
} from 'n8n-workflow';

export interface IMockContextConfig {
	responses: unknown[];
	items?: number;
	params?: Record<string, unknown>;
	options?: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	continueOnFail?: boolean;
}

export interface IMockRequest {
	credentialType: string;
	options: IHttpRequestOptions;
}

/** Shape the node writes under the "meta" key when Include Execution Trace is on. */
export interface ITraceMeta {
	model: string;
	itemIndex: number;
	finishReason: string;
	durationMs: number;
	llmDurationMs: number;
	tokens: Record<string, number>;
	steps: Array<{ name: string; durationMs: number; status: string }>;
	rawRequest?: unknown;
	rawResponse?: unknown;
}

export interface IMockContext {
	ctx: IExecuteFunctions;
	hints: NodeExecutionHint[];
	aiEvents: Array<{ event: string; msg?: string }>;
	requests: IMockRequest[];
	errorLogs: Array<Record<string, unknown>>;
}

export const DEFAULT_SCHEMA =
	'{"type":"object","properties":{"amount":{"type":"integer"}},"required":["amount"],"additionalProperties":false}';

export const LOOSE_SCHEMA = '{"type":"object","properties":{"amount":{"type":"integer"}}}';

export const TEST_BASE_URL = 'https://example.test/v1';

export function okResponse(
	content: string,
	usage: Record<string, unknown> = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
	finishReason = 'stop',
): unknown {
	return {
		choices: [{ finish_reason: finishReason, message: { content } }],
		usage,
	};
}

export function createMockContext(config: IMockContextConfig): IMockContext {
	const hints: NodeExecutionHint[] = [];
	const aiEvents: Array<{ event: string; msg?: string }> = [];
	const requests: IMockRequest[] = [];
	const errorLogs: Array<Record<string, unknown>> = [];

	const credentials = config.credentials ?? { apiKey: 'sk-test-key', baseUrl: TEST_BASE_URL };

	const params: Record<string, unknown> = {
		model: 'qwen-plus',
		systemPrompt: 'Extract json details from the conversation.',
		userInput: '- user: two shirts in size L',
		jsonSchema: DEFAULT_SCHEMA,
		...config.params,
		options: config.options ?? {},
	};

	let requestIndex = 0;

	const ctx = {
		getInputData: () =>
			new Array(config.items ?? config.responses.length).fill(null).map(() => ({ json: {} })),

		getCredentials: async () => credentials,

		getNodeParameter: (name: string, _itemIndex: number, fallbackValue?: unknown) =>
			name in params ? params[name] : fallbackValue,

		getNode: () => ({ name: 'Qwen Structured Data Extractor', type: 'qwenStructuredDataExtractor' }),

		continueOnFail: () => config.continueOnFail ?? false,

		logAiEvent: (event: string, msg?: string) => aiEvents.push({ event, msg }),

		logger: {
			debug: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: (_message: string, meta?: Record<string, unknown>) => errorLogs.push(meta ?? {}),
		},

		addExecutionHints: (...newHints: NodeExecutionHint[]) => hints.push(...newHints),

		helpers: {
			httpRequestWithAuthentication: async (
				credentialType: string,
				options: IHttpRequestOptions,
			) => {
				requests.push({ credentialType, options });
				const response = config.responses[requestIndex++];
				if (response instanceof Error) {
					throw response;
				}
				return response;
			},
		},
	} as unknown as IExecuteFunctions;

	return { ctx, hints, aiEvents, requests, errorLogs };
}

export interface IMockLoadOptionsConfig {
	response: unknown;
	credentials?: Record<string, unknown>;
}

export interface IMockLoadOptionsContext {
	ctx: ILoadOptionsFunctions;
	requests: IMockRequest[];
}

export function createLoadOptionsContext(
	config: IMockLoadOptionsConfig,
): IMockLoadOptionsContext {
	const requests: IMockRequest[] = [];
	const credentials = config.credentials ?? { apiKey: 'sk-test-key', baseUrl: TEST_BASE_URL };

	const ctx = {
		getCredentials: async () => credentials,

		getNodeParameter: (_name: string, fallbackValue?: unknown) => fallbackValue,

		getNode: () => ({ name: 'Qwen Structured Data Extractor', type: 'qwenStructuredDataExtractor' }),

		helpers: {
			httpRequestWithAuthentication: async (
				credentialType: string,
				options: IHttpRequestOptions,
			) => {
				requests.push({ credentialType, options });
				if (config.response instanceof Error) {
					throw config.response;
				}
				return config.response;
			},
		},
	} as unknown as ILoadOptionsFunctions;

	return { ctx, requests };
}
