import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAntiCheat, resetCache } from "./anticheat.js";

// Mock the AI module
vi.mock("../utils/ai.js", () => ({
	extractStructuredData: vi.fn(),
}));

import { extractStructuredData } from "../utils/ai.js";

const originalFetch = globalThis.fetch;
const mockExtract = vi.mocked(extractStructuredData);

function mockAwacyDataset(games: unknown[]): void {
	globalThis.fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response(JSON.stringify(games), { status: 200 }));
}

describe("checkAntiCheat", () => {
	beforeEach(() => {
		resetCache();
		mockExtract.mockReset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("should return safe=true for game with no anti-cheat in AWACY", async () => {
		mockAwacyDataset([
			{
				name: "Safe Game",
				storeIds: { steam: 12345 },
				anticheats: [],
			},
		]);

		const result = await checkAntiCheat("12345", "Safe Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(true);
		expect(result?.source).toBe("areweanticheatyet.com");
	});

	it("should return safe=false for game with EAC", async () => {
		mockAwacyDataset([
			{
				name: "Blocked Game",
				storeIds: { steam: 67890 },
				anticheats: ["Easy Anti-Cheat"],
			},
		]);

		const result = await checkAntiCheat("67890", "Blocked Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(false);
		expect(result?.source).toBe("areweanticheatyet.com");
	});

	it("should return safe=false for game with any known anti-cheat", async () => {
		mockAwacyDataset([
			{
				name: "Supported EAC Game",
				storeIds: { steam: 11111 },
				anticheats: ["Easy Anti-Cheat"],
			},
		]);

		const result = await checkAntiCheat("11111", "Supported EAC Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(false);
	});

	it("should return safe=false for game with BattlEye", async () => {
		mockAwacyDataset([
			{
				name: "Running BattlEye Game",
				storeIds: { steam: 22222 },
				anticheats: ["BattlEye"],
			},
		]);

		const result = await checkAntiCheat("22222", "Running BattlEye Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(false);
		expect(result?.source).toBe("areweanticheatyet.com");
	});

	it("should return safe=false for game with unknown/novel anti-cheat system", async () => {
		mockAwacyDataset([
			{
				name: "Novel AC Game",
				storeIds: { steam: 33333 },
				anticheats: ["Javelin"],
			},
		]);

		const result = await checkAntiCheat("33333", "Novel AC Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(false);
		expect(result?.source).toBe("areweanticheatyet.com");
	});

	it("should fall back to AI when game is not in AWACY", async () => {
		mockAwacyDataset([]); // Empty dataset — no match

		mockExtract.mockResolvedValueOnce({
			safe: true,
			reasoning: "Single player game, no anti-cheat",
		});

		const result = await checkAntiCheat("99999", "Unknown Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(true);
		expect(result?.source).toBe("ai");
	});

	it("should return null when both AWACY and AI fail", async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));
		mockExtract.mockRejectedValueOnce(new Error("AI unavailable"));

		const result = await checkAntiCheat("88888", "Broken Game");
		expect(result).toBeNull();
	});

	it("should include checkedAt timestamp", async () => {
		mockAwacyDataset([
			{
				name: "Timestamped Game",
				storeIds: { steam: 55555 },
				anticheats: [],
			},
		]);

		const before = new Date().toISOString();
		const result = await checkAntiCheat("55555", "Timestamped Game");
		const after = new Date().toISOString();

		expect(result).not.toBeNull();
		const checkedAt = result?.checkedAt ?? "";
		expect(checkedAt >= before).toBe(true);
		expect(checkedAt <= after).toBe(true);
	});
});
