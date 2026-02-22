import { MatcherError } from "../types/errors.js";
import { fetchWithRetry } from "../utils/http.js";

const STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/";

/** Minimum similarity threshold for accepting a Steam match */
const SIMILARITY_THRESHOLD = 0.6;

/** Delay between Steam API requests (ms) */
const THROTTLE_DELAY_MS = 1100;

interface SteamSearchItem {
	id: number;
	name: string;
}

interface SteamSearchResponse {
	total: number;
	items: SteamSearchItem[];
}

/**
 * Compute normalized Levenshtein similarity between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function stringSimilarity(a: string, b: string): number {
	const s1 = a.toLowerCase().trim();
	const s2 = b.toLowerCase().trim();

	if (s1 === s2) return 1;
	if (s1.length === 0 || s2.length === 0) return 0;

	const len1 = s1.length;
	const len2 = s2.length;

	// Levenshtein distance via dynamic programming
	const matrix: number[][] = [];

	for (let i = 0; i <= len1; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= len2; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	const distance = matrix[len1][len2];
	const maxLen = Math.max(len1, len2);
	return 1 - distance / maxLen;
}

/**
 * Search the Steam Store for a game name and return the best matching app ID,
 * or null if no good match is found.
 */
export async function searchSteam(
	gameName: string,
): Promise<{ appId: number | null; matchedName?: string }> {
	const url = new URL(STEAM_SEARCH_URL);
	url.searchParams.set("term", gameName);
	url.searchParams.set("l", "english");
	url.searchParams.set("cc", "US");

	const response = await fetchWithRetry(url.toString());

	if (!response.ok) {
		throw new MatcherError(`Steam search returned HTTP ${response.status}`, gameName);
	}

	const data = (await response.json()) as SteamSearchResponse;

	if (!data.items || data.items.length === 0) {
		return { appId: null };
	}

	// Check the top result for similarity
	const topResult = data.items[0];
	const similarity = stringSimilarity(gameName, topResult.name);

	if (similarity >= SIMILARITY_THRESHOLD) {
		return { appId: topResult.id, matchedName: topResult.name };
	}

	return { appId: null };
}

/** Sleep for the throttle delay to respect rate limits */
export function throttle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, THROTTLE_DELAY_MS));
}
