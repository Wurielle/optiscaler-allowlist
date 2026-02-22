import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSteam, stringSimilarity } from "./steam.js";

const originalFetch = globalThis.fetch;

function mockSteamSearch(items: { id: number; name: string }[]): void {
	globalThis.fetch = vi
		.fn()
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ total: items.length, items }), { status: 200 }),
		);
}

describe("stringSimilarity", () => {
	it("should return 1 for identical strings", () => {
		expect(stringSimilarity("Cyberpunk 2077", "Cyberpunk 2077")).toBe(1);
	});

	it("should return 1 for case-insensitive matches", () => {
		expect(stringSimilarity("DOOM", "doom")).toBe(1);
	});

	it("should return high similarity for close matches", () => {
		const sim = stringSimilarity("DOOM: The Dark Ages", "DOOM: The Dark Ages");
		expect(sim).toBe(1);
	});

	it("should return lower similarity for different strings", () => {
		const sim = stringSimilarity("Cyberpunk 2077", "The Witcher 3");
		expect(sim).toBeLessThan(0.5);
	});

	it("should return 0 for empty strings", () => {
		expect(stringSimilarity("", "test")).toBe(0);
		expect(stringSimilarity("test", "")).toBe(0);
	});

	it("should handle minor differences", () => {
		const sim = stringSimilarity("Black Myth: Wukong", "Black Myth Wukong");
		expect(sim).toBeGreaterThan(0.8);
	});
});

describe("searchSteam", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("should return appId when a close match is found", async () => {
		mockSteamSearch([{ id: 1091500, name: "Cyberpunk 2077" }]);

		const result = await searchSteam("Cyberpunk 2077");
		expect(result.appId).toBe(1091500);
		expect(result.matchedName).toBe("Cyberpunk 2077");
	});

	it("should return null when no results are returned", async () => {
		mockSteamSearch([]);

		const result = await searchSteam("Nonexistent Game XYZ");
		expect(result.appId).toBeNull();
	});

	it("should return null when top result is too different", async () => {
		mockSteamSearch([{ id: 123, name: "Completely Different Game Title" }]);

		const result = await searchSteam("DOOM: The Dark Ages");
		expect(result.appId).toBeNull();
	});

	it("should accept fuzzy matches above threshold", async () => {
		mockSteamSearch([{ id: 2358720, name: "Black Myth: Wukong" }]);

		const result = await searchSteam("Black Myth Wukong");
		expect(result.appId).toBe(2358720);
	});

	it("should throw MatcherError on non-retryable HTTP error from Steam", async () => {
		// Use 403 (non-retryable) to avoid retry delay complications
		globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

		await expect(searchSteam("Test Game")).rejects.toThrow("Steam search returned HTTP 403");
	});
});
