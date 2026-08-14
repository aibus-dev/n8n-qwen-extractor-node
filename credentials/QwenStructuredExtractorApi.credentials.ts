import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class QwenStructuredExtractorApi implements ICredentialType {
	name = 'qwenStructuredExtractorApi';

	displayName = 'Qwen Structured Extractor API';

	icon = 'file:qwen.svg' as const;

	documentationUrl =
		'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'API key from Alibaba Cloud Model Studio (DashScope) or another OpenAI-compatible gateway serving Qwen',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
			required: true,
			description:
				'OpenAI-compatible endpoint for Qwen. Change this if you use a different gateway or a self-hosted deployment.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
			method: 'GET',
		},
	};
}
