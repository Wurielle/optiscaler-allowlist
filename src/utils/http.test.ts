import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http.js";

describe("fetchWithRetry", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("should return response on successful request", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		const response = await fetchWithRetry("https://example.com/api");
		expect(response.ok).toBe(true);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("should return non-retryable error responses immediately", async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

		const response = await fetchWithRetry("https://example.com/api");
		expect(response.status).toBe(404);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("should retry on 429 with exponential backoff", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
			.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		globalThis.fetch = mockFetch;

		const promise = fetchWithRetry("https://example.com/api", undefined, {
			maxRetries: 3,
			initialDelayMs: 100,
		});

		// First retry after 100ms (100 * 2^0)
		await vi.advanceTimersByTimeAsync(100);
		// Second retry after 200ms (100 * 2^1)
		await vi.advanceTimersByTimeAsync(200);

		const response = await promise;
		expect(response.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it("should retry on 500 server errors", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		globalThis.fetch = mockFetch;

		const promise = fetchWithRetry("https://example.com/api", undefined, {
			maxRetries: 2,
			initialDelayMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100);
		const response = await promise;
		expect(response.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("should return error response after exhausting retries", async () => {
		const mockFetch = vi.fn().mockResolvedValue(new Response("Rate limited", { status: 429 }));

		globalThis.fetch = mockFetch;

		const promise = fetchWithRetry("https://example.com/api", undefined, {
			maxRetries: 2,
			initialDelayMs: 100,
		});

		await vi.advanceTimersByTimeAsync(100); // retry 1
		await vi.advanceTimersByTimeAsync(200); // retry 2

		const response = await promise;
		expect(response.status).toBe(429);
		// initial + 2 retries = 3 calls
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it("should respect Retry-After header", async () => {
		const headers = new Headers({ "Retry-After": "2" });
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("Rate limited", { status: 429, headers }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		globalThis.fetch = mockFetch;

		const promise = fetchWithRetry("https://example.com/api", undefined, {
			maxRetries: 2,
			initialDelayMs: 100,
		});

		// Retry-After: 2 means 2000ms
		await vi.advanceTimersByTimeAsync(2000);

		const response = await promise;
		expect(response.ok).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("should cap delay at maxDelayMs", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("Error", { status: 500 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		globalThis.fetch = mockFetch;

		const promise = fetchWithRetry("https://example.com/api", undefined, {
			maxRetries: 2,
			initialDelayMs: 50000,
			maxDelayMs: 5000,
		});

		// Should be capped at 5000ms, not 50000ms
		await vi.advanceTimersByTimeAsync(5000);

		const response = await promise;
		expect(response.ok).toBe(true);
	});

	it("should forward request init options", async () => {
		const mockFetch = vi.fn().mockResolvedValueOnce(new Response("ok", { status: 200 }));
		globalThis.fetch = mockFetch;

		await fetchWithRetry("https://example.com/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});

		expect(mockFetch).toHaveBeenCalledWith(
			"https://example.com/api",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);
	});
});
