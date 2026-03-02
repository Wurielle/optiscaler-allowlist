import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAntiCheat, resetCache } from "./anticheat.js";

// Mock the AI module
vi.mock("../utils/ai.js", () => ({
	extractStructuredData: vi.fn(),
}));

// Mock the Steam checker module
vi.mock("./steam.js", () => ({
	checkSteamAntiCheat: vi.fn(),
	fetchSteamPage: vi.fn(),
	resetSteamCache: vi.fn(),
}));

import { extractStructuredData } from "../utils/ai.js";
import { checkSteamAntiCheat, fetchSteamPage } from "./steam.js";

const originalFetch = globalThis.fetch;
const mockExtract = vi.mocked(extractStructuredData);
const mockSteamCheck = vi.mocked(checkSteamAntiCheat);
const mockFetchSteamPage = vi.mocked(fetchSteamPage);

function mockAwacyDataset(games: unknown[]): void {
	globalThis.fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response(JSON.stringify(games), { status: 200 }));
}

describe("checkAntiCheat", () => {
	beforeEach(() => {
		resetCache();
		mockExtract.mockReset();
		mockSteamCheck.mockReset();
		mockFetchSteamPage.mockReset();
		// Default: Steam returns null (unavailable), so tests that don't set it fall through
		mockSteamCheck.mockResolvedValue(null);
		mockFetchSteamPage.mockResolvedValue(null);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	// ── Tier 1: Steam store page ──

	it("should return safe=false when Steam detects anti-cheat", async () => {
		mockSteamCheck.mockResolvedValueOnce({
			hasAntiCheat: true,
			details: ["Easy Anti-Cheat"],
		});

		const result = await checkAntiCheat("4128260", "Highguard");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(false);
		expect(result?.source).toBe("steam");
	});

	it("should return safe=true when Steam finds no anti-cheat", async () => {
		mockSteamCheck.mockResolvedValueOnce({
			hasAntiCheat: false,
			details: [],
		});

		const result = await checkAntiCheat("1903340", "Clair Obscur: Expedition 33");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(true);
		expect(result?.source).toBe("steam");
	});

	it("should not call AWACY when Steam provides a result", async () => {
		mockSteamCheck.mockResolvedValueOnce({
			hasAntiCheat: false,
			details: [],
		});

		// Replace fetch with a spy to verify it's not called
		globalThis.fetch = vi.fn();

		await checkAntiCheat("12345", "Some Game");
		// fetch should not be called (AWACY uses globalThis.fetch)
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	// ── Tier 2: AreWeAntiCheatYet (when Steam is unavailable) ──

	it("should fall through to AWACY when Steam returns null", async () => {
		mockSteamCheck.mockResolvedValueOnce(null);
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

	it("should return safe=false for game with EAC in AWACY", async () => {
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

	it("should return safe=false for game with BattlEye in AWACY", async () => {
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

	it("should return safe=false for game with unknown/novel anti-cheat in AWACY", async () => {
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

	// ── Tier 3: AI fallback ──

	it("should fall through to AI when game is not in Steam or AWACY", async () => {
		mockSteamCheck.mockResolvedValueOnce(null);
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

	it("should pass Steam page HTML to AI when available", async () => {
		mockSteamCheck.mockResolvedValueOnce(null);
		mockFetchSteamPage.mockResolvedValueOnce("<html>some page content</html>");
		mockAwacyDataset([]); // Empty dataset

		mockExtract.mockResolvedValueOnce({
			safe: true,
			reasoning: "No anti-cheat found on the page",
		});

		await checkAntiCheat("99999", "Unknown Game");

		// AI should receive the HTML content, not just the game name
		expect(mockExtract).toHaveBeenCalledWith(
			"<html>some page content</html>",
			expect.stringContaining("Analyze this Steam store page"),
			expect.anything(),
		);
	});

	it("should use game name as content when no Steam page available", async () => {
		mockSteamCheck.mockResolvedValueOnce(null);
		mockFetchSteamPage.mockResolvedValueOnce(null);
		mockAwacyDataset([]); // Empty dataset

		mockExtract.mockResolvedValueOnce({
			safe: true,
			reasoning: "Single player RPG",
		});

		await checkAntiCheat("99999", "Unknown Game");

		// AI should receive the game name since no HTML available
		expect(mockExtract).toHaveBeenCalledWith(
			"Unknown Game",
			expect.stringContaining("Determine if the PC game"),
			expect.anything(),
		);
	});

	// ── Failure cases ──

	it("should return null when all three tiers fail", async () => {
		mockSteamCheck.mockResolvedValueOnce(null);
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));
		mockExtract.mockRejectedValueOnce(new Error("AI unavailable"));

		const result = await checkAntiCheat("88888", "Broken Game");
		expect(result).toBeNull();
	});

	it("should fall through to AWACY when Steam throws", async () => {
		mockSteamCheck.mockRejectedValueOnce(new Error("Steam error"));
		mockAwacyDataset([
			{
				name: "Fallback Game",
				storeIds: { steam: 44444 },
				anticheats: [],
			},
		]);

		const result = await checkAntiCheat("44444", "Fallback Game");
		expect(result).not.toBeNull();
		expect(result?.safe).toBe(true);
		expect(result?.source).toBe("areweanticheatyet.com");
	});

	// ── Timestamp ──

	it("should include checkedAt timestamp", async () => {
		mockSteamCheck.mockResolvedValueOnce({
			hasAntiCheat: false,
			details: [],
		});

		const before = new Date().toISOString();
		const result = await checkAntiCheat("55555", "Timestamped Game");
		const after = new Date().toISOString();

		expect(result).not.toBeNull();
		const checkedAt = result?.checkedAt ?? "";
		expect(checkedAt >= before).toBe(true);
		expect(checkedAt <= after).toBe(true);
	});
});
