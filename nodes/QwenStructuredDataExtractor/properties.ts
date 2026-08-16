import type { INodeProperties } from 'n8n-workflow';

const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "amount": { "type": ["integer", "null"], "description": "Quantity ordered" },
    "size": { "type": ["string", "null"], "description": "Selected size (S, M, L, XL, 2XL, 3XL)" },
    "color": { "type": ["string", "null"], "description": "Product colour" },
    "phone": { "type": ["string", "null"], "description": "Delivery phone number" },
    "address": { "type": ["string", "null"], "description": "Delivery address" }
  },
  "required": ["amount", "size", "color", "phone", "address"],
  "additionalProperties": false
}`;

const DEFAULT_SYSTEM_PROMPT = `You extract structured information from conversation transcripts.
Task: analyse the conversation history and extract the details that were FINALLY agreed on.
Note: if the user changed their mind, take the most recent value.`;

export const qwenStructuredDataExtractorProperties: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getModels',
		},
		default: '',
		required: true,
		description:
			'Loaded live from the credential\'s /models endpoint, json_schema-capable models first. This node always asks for strict JSON Schema output, which Alibaba documents only for the qwen3.7-plus, qwen3.7-max and qwen3.8-max series — other models are listed but may answer with a 400. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'System Prompt',
		name: 'systemPrompt',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: DEFAULT_SYSTEM_PROMPT,
		required: true,
		description:
			'Instructions describing the extraction task. Keep this identical across items so DashScope can reuse its cached prefix.',
	},
	{
		displayName: 'User Input / Conversation History',
		name: 'userInput',
		type: 'string',
		typeOptions: {
			rows: 6,
		},
		default: '={{ $json.conversationHistory || $json.chat_log || $json.message }}',
		required: true,
		description:
			'Text or conversation transcript to extract from, for example "- user: ... \\n - system: ...".',
	},
	{
		displayName: 'JSON Schema Output',
		name: 'jsonSchema',
		type: 'json',
		typeOptions: {
			rows: 10,
		},
		default: DEFAULT_SCHEMA,
		required: true,
		description:
			'Any JSON Schema the model output must conform to. Strict mode needs "additionalProperties": false and every field listed in "required".',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Auto Ensure JSON Keyword',
				name: 'autoJsonKeyword',
				type: 'boolean',
				default: true,
				description:
					'Whether to append the word "JSON" to the system prompt. Qwen returns a 400 when response_format is used and no message contains that word.',
			},
			{
				displayName: 'Disable Thinking Mode',
				name: 'disableThinking',
				type: 'boolean',
				default: true,
				description:
					'Whether to send enable_thinking:false. DashScope rejects non-streaming calls to Qwen3 reasoning models without it, and thinking mode makes JSON output less reliable. Turn off only if a model rejects the parameter.',
			},
			{
				displayName: 'Include Execution Trace',
				name: 'includeTrace',
				type: 'boolean',
				default: false,
				description:
					'Whether to attach a "meta" key holding per-step durations and the token breakdown (prompt/completion/cached). Leave off to keep the output flat.',
			},
			{
				displayName: 'Include Raw Request/Response',
				name: 'includeRaw',
				type: 'boolean',
				default: false,
				description:
					'Whether to attach the outgoing payload and raw Qwen response to "meta" for debugging. Only applies when Include Execution Trace is on, and makes the output considerably larger.',
			},
			{
				displayName: 'Output Key Name',
				name: 'outputKeyName',
				type: 'string',
				default: '',
				placeholder: 'e.g. output or order_info',
				description:
					'Wrap the extracted data in a single key. Leave empty to emit the fields flat at the root.',
			},
			{
				displayName: 'Schema Name',
				name: 'schemaName',
				type: 'string',
				default: 'extracted_data',
				description: 'Identifier for the schema inside the API payload',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				typeOptions: {
					minValue: 0,
					maxValue: 2,
				},
				default: 0,
				description: 'Sampling temperature. Keep at 0 for consistent extraction results.',
			},
		],
	},
];
