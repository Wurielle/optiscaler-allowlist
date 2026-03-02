import { fetchWithRetry } from "../utils/http.js";

const STEAM_STORE_URL = "https://store.steampowered.com/app";

/**
 * Anti-cheat detection result from the Steam store page.
 *
 * - `hasAntiCheat: true` with details — the page explicitly discloses anti-cheat
 * - `hasAntiCheat: false` — the page loaded successfully with no anti-cheat section
 * - `null` return — page could not be loaded or parsed (age gate, error, etc.)
 */
export interface SteamAntiCheatInfo {
	hasAntiCheat: boolean;
	/** Names of anti-cheat systems found (e.g. "Easy Anti-Cheat", "BattlEye") */
	details: string[];
}

/** Cached Steam page HTML keyed by appId, cleared each run */
const pageCache = new Map<string, string>();

/** Reset the page cache (useful for testing and between runs) */
export function resetSteamCache(): void {
	pageCache.clear();
}

/**
 * Fetch and return the raw HTML of a Steam store page.
 * Uses a birthtime cookie to bypass age gates for mature-rated games.
 *
 * @returns The HTML string, or null if the page could not be fetched.
 */
export async function fetchSteamPage(appId: string): Promise<string | null> {
	if (pageCache.has(appId)) {
		return pageCache.get(appId) ?? null;
	}

	const url = `${STEAM_STORE_URL}/${appId}/`;

	try {
		const response = await fetchWithRetry(url, {
			headers: {
				Cookie: "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1",
				"Accept-Language": "en",
			},
		});

		if (!response.ok) {
			return null;
		}

		const html = await response.text();
		pageCache.set(appId, html);
		return html;
	} catch {
		return null;
	}
}

/**
 * Check whether a Steam store page discloses anti-cheat usage.
 *
 * Steam requires developers to disclose kernel-level anti-cheat on their store
 * pages. The disclosure appears in a `<div class="anticheat_section DRM_notice">`
 * block containing the anti-cheat system names.
 *
 * @returns SteamAntiCheatInfo or null if the page could not be checked
 */
export async function checkSteamAntiCheat(appId: string): Promise<SteamAntiCheatInfo | null> {
	const html = await fetchSteamPage(appId);
	if (!html) {
		return null;
	}

	// Detect age gate — if we still hit one despite cookies, bail out
	if (html.includes('id="app_agegate"') || html.includes('id="agegate_box"')) {
		return null;
	}

	// Detect non-game pages or missing apps — need some game page indicator
	if (!html.includes('id="category_block"') && !html.includes("game_area_details")) {
		return null;
	}

	return parseAntiCheatFromHtml(html);
}

/**
 * Parse anti-cheat disclosure from Steam store page HTML.
 *
 * Looks for the `anticheat_section` div which Steam uses for mandatory
 * anti-cheat disclosures. Extracts the names of anti-cheat systems from
 * `anticheat_name` child elements.
 */
export function parseAntiCheatFromHtml(html: string): SteamAntiCheatInfo {
	// Primary detection: look for the anticheat_section div
	// Steam uses: <div class="anticheat_section DRM_notice">
	const sectionRegex = /<div\s+class="anticheat_section[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/;
	const sectionMatch = sectionRegex.exec(html);

	if (!sectionMatch) {
		// No anticheat_section found — game does not disclose anti-cheat
		return { hasAntiCheat: false, details: [] };
	}

	const sectionHtml = sectionMatch[0];

	// Extract anti-cheat system names from anticheat_name elements
	// Pattern: <div class="anticheat_name">Easy Anti-Cheat<span ...>
	const nameRegex = /<div\s+class="anticheat_name"[^>]*>\s*([^<]+)/g;
	const details: string[] = [];

	for (const nameMatch of sectionHtml.matchAll(nameRegex)) {
		const name = nameMatch[1].trim();
		if (name) {
			details.push(name);
		}
	}

	// Also check for the header text as a fallback
	// e.g. "Uses Kernel Level Anti-Cheat" or "Uses Anti-Cheat"
	if (details.length === 0) {
		const headerRegex = /<div>\s*(Uses[^<]*Anti-Cheat[^<]*)\s*<\/div>/i;
		const headerMatch = headerRegex.exec(sectionHtml);
		if (headerMatch) {
			details.push(headerMatch[1].trim());
		}
	}

	return {
		hasAntiCheat: true,
		details,
	};
}
