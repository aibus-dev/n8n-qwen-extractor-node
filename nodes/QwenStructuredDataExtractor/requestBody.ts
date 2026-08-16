export interface IExtractionRequest {
	model: string;
	systemPrompt: string;
	userInput: string;
	schema: object;
	schemaName: string;
	temperature: number;
	disableThinking: boolean;
}

export interface IChatCompletionsBody {
	model: string;
	temperature: number;
	response_format: {
		type: 'json_schema';
		json_schema: {
			name: string;
			strict: true;
			schema: object;
		};
	};
	messages: Array<{ role: 'system' | 'user'; content: string }>;
	enable_thinking?: false;
}

export function buildRequestBody(request: IExtractionRequest): IChatCompletionsBody {
	return {
		model: request.model,
		temperature: request.temperature,
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: request.schemaName,
				strict: true,
				schema: request.schema,
			},
		},
		messages: [
			{ role: 'system', content: request.systemPrompt },
			{ role: 'user', content: `Content to extract from:\n${request.userInput}` },
		],
		...(request.disableThinking ? { enable_thinking: false as const } : {}),
	};
}

export function ensureJsonKeyword(systemPrompt: string): string {
	if (systemPrompt.toLowerCase().includes('json')) {
		return systemPrompt;
	}
	return `${systemPrompt}\n(Note: you must return the result as valid JSON matching the requested schema.)`;
}

export function stripCodeFence(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.startsWith('```')) {
		return trimmed;
	}
	return trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
}

/**
 * Pull the JSON value out of a reply that carries prose around it. Qwen thinking models are
 * known to leak reasoning into message.content even under json_schema, so the fence strip
 * alone is not enough. Returns the input untouched when there is nothing balanced to find,
 * leaving JSON.parse to raise the error.
 */
export function extractJsonPayload(raw: string): string {
	const text = stripCodeFence(raw).trim();

	if (text.startsWith('{') || text.startsWith('[')) {
		return text;
	}

	const start = text.search(/[{[]/);
	if (start === -1) {
		return text;
	}

	const open = text[start];
	const close = open === '{' ? '}' : ']';
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const char = text[i];

		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = inString;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}

		if (char === open) {
			depth++;
		} else if (char === close) {
			depth--;
			if (depth === 0) {
				return text.slice(start, i + 1);
			}
		}
	}

	return text;
}
