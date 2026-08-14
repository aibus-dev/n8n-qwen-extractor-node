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
