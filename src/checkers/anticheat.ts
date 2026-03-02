import { z } from "zod";
import type { AntiCheatResult } from "../types/anticheat.js";
import { CheckerError } from "../types/errors.js";
import { extractStructuredData } from "../utils/ai.js";
import { fetchWithRetry } from "../utils/http.js";
import { checkSteamAntiCheat, fetchSteamPage } from "./steam.js";

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
 * Check whether a game uses any anti-cheat system using a 3-tier approach:
 *
 * 1. **Steam store page** (most authoritative) — Steam requires developers to
 *    disclose kernel-level anti-cheat. Deterministic HTML parsing.
 * 2. **AreWeAntiCheatYet dataset** — Community-maintained list of games with
 *    anti-cheat systems.
 * 3. **AI fallback** — LLM analysis grounded with actual Steam page content
 *    (when available) for better accuracy than pure parametric knowledge.
 *
 * A game is unsafe if it uses ANY anti-cheat system, as all anti-cheat can
 * block DLL injection tools like OptiScaler.
 *
 * @returns AntiCheatResult or null if status cannot be determined
 */
export async function checkAntiCheat(appId: string, game: string): Promise<AntiCheatResult | null> {
	const checkedAt = new Date().toISOString();

	// Tier 1: Steam store page — deterministic, most authoritative
	try {
		const steamResult = await checkSteamAntiCheat(appId);

		if (steamResult) {
			return {
				safe: !steamResult.hasAntiCheat,
				source: "steam",
				checkedAt,
			};
		}
		// steamResult is null — page unavailable, fall through
	} catch {
		// Steam check failed — fall through to AWACY
	}

	// Tier 2: AreWeAntiCheatYet dataset
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

	// Tier 3: AI fallback — grounded with Steam page content when available
	try {
		const steamHtml = await fetchSteamPage(appId);
		const result = await extractStructuredData(
			steamHtml ?? game,
			buildAiPrompt(game, appId, steamHtml !== null),
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

/**
 * Build the AI prompt based on whether we have Steam page HTML to analyze.
 * When we have the HTML, the AI can look for actual anti-cheat indicators
 * rather than guessing from parametric knowledge.
 */
function buildAiPrompt(game: string, appId: string, hasHtml: boolean): string {
	if (hasHtml) {
		return `Analyze this Steam store page for the game "${game}" (Steam App ID: ${appId}).

Determine if this game uses ANY anti-cheat system that would block third-party DLL injection tools like OptiScaler or ReShade.

Look for these indicators in the page content:
- Anti-cheat disclosures (e.g. "Uses Kernel Level Anti-Cheat", "Uses Anti-Cheat")
- References to anti-cheat systems: Easy Anti-Cheat (EAC), BattlEye, Vanguard, XIGNCODE3, nProtect GameGuard, Mhyprot, Denuvo Anti-Cheat, Javelin, or any other
- DRM notices mentioning anti-cheat
- Game categories or descriptions mentioning competitive multiplayer with anti-cheat

If the game uses ANY anti-cheat system at all, it is NOT safe. Only games with NO anti-cheat system are safe.

Single-player games and games without any anti-cheat disclosure are typically safe.

Return a JSON object:
{"safe": true/false, "reasoning": "brief explanation based on what you found in the page"}`;
	}

	return `Determine if the PC game "${game}" (Steam App ID: ${appId}) uses ANY anti-cheat system.

Any anti-cheat system (e.g., Easy Anti-Cheat, BattlEye, Vanguard, XIGNCODE3, nProtect GameGuard, Mhyprot, Denuvo Anti-Cheat, Javelin, or any other) can block third-party DLL injection tools like OptiScaler or ReShade.

Important guidelines:
- If the game is single-player only with no online competitive component, it almost certainly does NOT use anti-cheat. Mark it as safe.
- If the game is a competitive online multiplayer game (FPS, battle royale, etc.), it is more likely to use anti-cheat.
- Do NOT assume a game has anti-cheat just because it has multiplayer. Many co-op and casual multiplayer games do not use anti-cheat.
- When uncertain, lean towards marking single-player and co-op games as safe, and competitive multiplayer games as unsafe.

If the game uses ANY anti-cheat system at all, it is NOT safe. There are no exceptions.
Only games with NO anti-cheat system are safe.

Return a JSON object:
{"safe": true/false, "reasoning": "brief explanation"}`;
}
