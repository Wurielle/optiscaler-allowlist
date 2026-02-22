interface FetchWithRetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Initial delay in ms before first retry (default: 1000) */
	initialDelayMs?: number;
	/** Maximum delay in ms between retries (default: 30000) */
	maxDelayMs?: number;
	/** Optional AbortSignal for cancellation */
	signal?: AbortSignal;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * Fetch a URL with automatic retry and exponential backoff on 429 (rate limit)
 * and 5xx (server error) responses.
 */
export async function fetchWithRetry(
	url: string,
	init?: RequestInit,
	options?: FetchWithRetryOptions,
): Promise<Response> {
	const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
	const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
	const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const response = await fetch(url, {
			...init,
			signal: options?.signal ?? init?.signal,
		});

		if (response.ok) {
			return response;
		}

		const isRetryable = response.status === 429 || response.status >= 500;
		if (!isRetryable || attempt === maxRetries) {
			return response;
		}

		// Use Retry-After header if present, otherwise exponential backoff
		const retryAfter = response.headers.get("Retry-After");
		let delayMs: number;

		if (retryAfter) {
			const retryAfterSeconds = Number.parseInt(retryAfter, 10);
			delayMs = Number.isNaN(retryAfterSeconds) ? initialDelayMs : retryAfterSeconds * 1000;
		} else {
			delayMs = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
		}

		lastError = new Error(
			`HTTP ${response.status} on attempt ${attempt + 1}, retrying in ${delayMs}ms`,
		);
		await sleep(delayMs);
	}

	// Should not reach here, but satisfy TypeScript
	throw lastError ?? new Error("fetchWithRetry: unexpected state");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
