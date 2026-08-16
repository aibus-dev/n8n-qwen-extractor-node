import type { NodeExecutionHint } from 'n8n-workflow';
import { formatDuration, type ITokenUsage } from './executionTracer';

export interface IRunSummary {
	totalItems: number;
	failedItems: number;
	truncatedItems: number;
	schemaWarnings: string[];
	usage: ITokenUsage;
	durationMs: number;
}

export function buildExecutionHints(run: IRunSummary): NodeExecutionHint[] {
	const { usage } = run;
	const succeeded = run.totalItems - run.failedItems;

	const summary = [`${succeeded}/${run.totalItems} items in ${formatDuration(run.durationMs)}`];

	summary.push(
		usage.promptTokens + usage.completionTokens > 0
			? `~${usage.totalTokens} tokens (prompt ${usage.promptTokens} / completion ${usage.completionTokens})`
			: `~${usage.totalTokens} tokens`,
	);

	if (usage.cachedTokens > 0) {
		summary.push(`${usage.cachedTokens} cached`);
	}

	const hints: NodeExecutionHint[] = [
		{
			message: summary.join(' | '),
			type: run.failedItems > 0 ? 'warning' : 'info',
			location: 'outputPane',
		},
	];

	if (run.truncatedItems > 0) {
		hints.push({
			message: `${run.truncatedItems} item(s) were cut off (finish_reason=length). Shorten the input or simplify the JSON Schema.`,
			type: 'warning',
			location: 'outputPane',
		});
	}

	for (const warning of run.schemaWarnings) {
		hints.push({
			message: warning,
			type: 'warning',
			location: 'outputPane',
		});
	}

	return hints;
}

export function describeApiError(error: Error): string {
	const message = error.message ?? '';

	if (/enable_thinking/i.test(message)) {
		return `${message}\n\nHint: this model requires the thinking parameter to be set explicitly on non-streaming calls. Turn on the "Disable Thinking Mode" option (it is on by default), or turn it off if this model rejects the parameter entirely.`;
	}

	if (/must contain the word ['"]?json/i.test(message)) {
		return `${message}\n\nHint: Qwen requires the word "json" somewhere in the messages when response_format is used. Turn on the "Auto Ensure JSON Keyword" option.`;
	}

	if (/json_schema|response_format/i.test(message)) {
		return `${message}\n\nHint: this node always asks for strict JSON Schema output, which Alibaba documents only for the qwen3.7-plus, qwen3.7-max and qwen3.8-max series. Pick one of those in "Model Name or ID" — the dropdown flags models that are not documented for it.`;
	}

	return message;
}
