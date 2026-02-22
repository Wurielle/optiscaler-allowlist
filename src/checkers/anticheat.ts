import { z } from "zod";
import type { AntiCheatResult } from "../types/anticheat.js";
import { CheckerError } from "../types/errors.js";
import { extractStructuredData } from "../utils/ai.js";
import { fetchWithRetry } from "../utils/http.js";

const AREWEANTICHEATYET_URL =
	"https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json";

/** Shape of an entry in the AreWeAntiCheatYet dataset */
interface AwacyGame {
	name: string;
	storeIds: {
		steam?: number;
	};
	status: string;
	anticheats: string[];
}

/** Anti-cheat statuses from AWAcy that indicate the game is safe for DLL injection */
const SAFE_STATUSES = new Set(["Supported", "Running"]);

/** Anti-cheat systems known to block DLL injection */
const BLOCKING_ANTICHEATS = new Set([
	"Easy Anti-Cheat",
	"BattlEye",
	"Vanguard",
	"XIGNCODE3",
	"nProtect GameGuard",
	"Mhyprot",
]);

const aiSafetySchema = z.object({
	safe: z.boolean(),
	reasoning: z.string(),
});

let cachedAwacyData: AwacyGame[] | null = null;

/** Fetch and cache the AreWeAntiCheatYet dataset */
async function getAwacyData(): Promise<AwacyGame[]> {
	if (cachedAwacyData) return cachedAwacyData;

	const response = await fetchWithRetry(AREWEANTICHEATYET_URL);
	if (!response.ok) {
		throw new CheckerError(`AreWeAntiCheatYet returned HTTP ${response.status}`, "dataset");
	}

	cachedAwacyData = (await response.json()) as AwacyGame[];
	return cachedAwacyData;
}

/** Reset the cached dataset (useful for testing) */
export function resetCache(): void {
	cachedAwacyData = null;
}

/**
 * Check a game's anti-cheat status against the AreWeAntiCheatYet dataset.
 * Falls back to AI if the game is not found in the dataset.
 *
 * @returns AntiCheatResult or null if status cannot be determined
 */
export async function checkAntiCheat(appId: string, game: string): Promise<AntiCheatResult | null> {
	const checkedAt = new Date().toISOString();

	// Try AWACY dataset first
	try {
		const games = await getAwacyData();
		const match = games.find((g) => g.storeIds.steam?.toString() === appId);

		if (match) {
			// Check if the game has blocking anti-cheat
			const hasBlockingAC = match.anticheats.some((ac) => BLOCKING_ANTICHEATS.has(ac));
			const statusSafe = SAFE_STATUSES.has(match.status);

			// Game is safe if it either has no blocking anti-cheat,
			// or its status indicates it works despite having anti-cheat
			const safe = !hasBlockingAC || statusSafe;

			return {
				safe,
				source: "areweanticheatyet.com",
				checkedAt,
			};
		}
	} catch {
		// AWACY dataset unavailable — fall through to AI
	}

	// AI fallback
	try {
		const result = await extractStructuredData(
			game,
			`Determine if the PC game "${game}" (Steam App ID: ${appId}) uses an anti-cheat system that would block third-party DLL injection (such as OptiScaler or ReShade). 

Anti-cheat systems that typically block injection: Easy Anti-Cheat (EAC), BattlEye, Vanguard, XIGNCODE3, nProtect GameGuard.

Games WITHOUT these anti-cheat systems, or single-player games, are generally safe.

Return a JSON object:
{"safe": true/false, "reasoning": "brief explanation"}`,
			aiSafetySchema,
		);

		return {
			safe: result.safe,
			source: "ai",
			checkedAt,
		};
	} catch {
		// Cannot determine — return null per spec
		return null;
	}
}
