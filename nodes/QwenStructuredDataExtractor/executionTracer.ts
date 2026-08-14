import type { IDataObject } from 'n8n-workflow';

export interface ITraceStep {
	name: string;
	startedAt: number;
	durationMs: number;
	status: 'ok' | 'error';
	detail?: IDataObject;
}

export interface ITokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cachedTokens: number;
}

export const EMPTY_TOKEN_USAGE: ITokenUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	cachedTokens: 0,
};

interface IRawUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number };
}

export function readTokenUsage(responseObj: unknown): ITokenUsage {
	const usage = (responseObj as { usage?: IRawUsage })?.usage ?? {};
	const promptTokens: number = usage.prompt_tokens ?? 0;
	const completionTokens: number = usage.completion_tokens ?? 0;

	return {
		promptTokens,
		completionTokens,
		totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
		cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
	};
}

export function addTokenUsage(a: ITokenUsage, b: ITokenUsage): ITokenUsage {
	return {
		promptTokens: a.promptTokens + b.promptTokens,
		completionTokens: a.completionTokens + b.completionTokens,
		totalTokens: a.totalTokens + b.totalTokens,
		cachedTokens: a.cachedTokens + b.cachedTokens,
	};
}

export class ExecutionTracer {
	private steps: ITraceStep[] = [];

	private readonly runStartedAt = Date.now();

	async step<T>(name: string, fn: () => Promise<T>, detail?: IDataObject): Promise<T> {
		const startedAt = Date.now();
		try {
			const result = await fn();
			this.record(name, startedAt, 'ok', detail);
			return result;
		} catch (error) {
			this.record(name, startedAt, 'error', {
				...detail,
				error: (error as Error).message,
			});
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
			throw error;
		}
	}

	stepSync<T>(name: string, fn: () => T, detail?: IDataObject): T {
		const startedAt = Date.now();
		try {
			const result = fn();
			this.record(name, startedAt, 'ok', detail);
			return result;
		} catch (error) {
			this.record(name, startedAt, 'error', {
				...detail,
				error: (error as Error).message,
			});
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
			throw error;
		}
	}

	annotate(name: string, detail: IDataObject): void {
		for (let i = this.steps.length - 1; i >= 0; i--) {
			if (this.steps[i].name === name) {
				this.steps[i].detail = { ...this.steps[i].detail, ...detail };
				return;
			}
		}
	}

	private record(
		name: string,
		startedAt: number,
		status: 'ok' | 'error',
		detail?: IDataObject,
	): void {
		this.steps.push({
			name,
			startedAt,
			durationMs: Date.now() - startedAt,
			status,
			...(detail === undefined ? {} : { detail }),
		});
	}

	get elapsedMs(): number {
		return Date.now() - this.runStartedAt;
	}

	durationOf(name: string): number {
		return this.steps
			.filter((step) => step.name === name)
			.reduce((sum, step) => sum + step.durationMs, 0);
	}

	toJson(): IDataObject[] {
		return this.steps.map((step) => ({ ...step })) as unknown as IDataObject[];
	}
}

export function formatDuration(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
