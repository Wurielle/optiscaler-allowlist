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
	anticheats: string[];
}

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
 * Check whether a game uses any anti-cheat system via the AreWeAntiCheatYet dataset.
 * A game is unsafe if it uses ANY anti-cheat system, as all anti-cheat can block DLL injection.
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
			// Game is unsafe if it uses any anti-cheat system at all
			const safe = match.anticheats.length === 0;

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
			`Determine if the PC game "${game}" (Steam App ID: ${appId}) uses ANY anti-cheat system. Any anti-cheat system (e.g., Easy Anti-Cheat, BattlEye, Vanguard, XIGNCODE3, nProtect GameGuard, Mhyprot, Denuvo Anti-Cheat, Javelin, or any other) can block third-party DLL injection tools like OptiScaler or ReShade.

If the game uses ANY anti-cheat system at all, it is NOT safe. There are no exceptions.

Only games with NO anti-cheat system are safe.

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
