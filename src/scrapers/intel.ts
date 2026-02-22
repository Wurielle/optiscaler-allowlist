import node_path from "node:path";
import { z } from "zod";
import { ScraperError } from "../types/errors.js";
import type { IntelGame } from "../types/providers.js";
import { intelGameArraySchema } from "../types/providers.js";
import { extractStructuredData } from "../utils/ai.js";
import { fetchWithRetry } from "../utils/http.js";
import { writeJson } from "../utils/json.js";

const INTEL_URL = "https://game.intel.com/us/xess-enabled-games/";

const DEFAULT_OUTPUT_DIR = node_path.resolve("data/providers");

const gameListSchema = z.array(z.string().min(1));

const EXTRACTION_PROMPT = `Extract the game names from this HTML content. The page lists Intel XeSS enabled games in two sections:

1. "XeSS 2" enabled games - the newer version
2. "XeSS" enabled games (XeSS 1) - the original version

Return a JSON object with these exact keys:
{
  "xess2": ["Game Name 1", "Game Name 2", ...],
  "xess": ["Game Name 1", "Game Name 2", ...]
}

If a section is not found or empty, return an empty array for that key.
Return ONLY the JSON object, no other text.`;

const intelExtractionSchema = z.object({
	xess2: gameListSchema,
	xess: gameListSchema,
});

interface ScrapeIntelOptions {
	/** Override the output directory (defaults to data/providers) */
	outputDir?: string;
}

/** Strip boilerplate from Intel HTML */
function stripBoilerplate(html: string): string {
	let stripped = html.replace(/<script[\s\S]*?<\/script>/gi, "");
	stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, "");
	stripped = stripped.replace(/<nav[\s\S]*?<\/nav>/gi, "");
	stripped = stripped.replace(/<footer[\s\S]*?<\/footer>/gi, "");
	stripped = stripped.replace(/<header[\s\S]*?<\/header>/gi, "");
	return stripped;
}

/** Merge extracted section lists into IntelGame[] */
function mergeIntoGames(extracted: z.infer<typeof intelExtractionSchema>): IntelGame[] {
	const gameMap = new Map<string, IntelGame>();

	for (const name of extracted.xess2) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		gameMap.set(trimmed, { gameName: trimmed, xess2: true, xess: false });
	}

	for (const name of extracted.xess) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		const existing = gameMap.get(trimmed);
		if (existing) {
			existing.xess = true;
		} else {
			gameMap.set(trimmed, { gameName: trimmed, xess2: false, xess: true });
		}
	}

	return Array.from(gameMap.values());
}

/** Fetch Intel XeSS page, extract game data via AI, validate, and write to disk */
export async function scrapeIntel(options?: ScrapeIntelOptions): Promise<IntelGame[]> {
	const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
	const response = await fetchWithRetry(INTEL_URL);

	if (!response.ok) {
		throw new ScraperError(`Intel page returned HTTP ${response.status}`, "intel", response.status);
	}

	const html = await response.text();
	const stripped = stripBoilerplate(html);

	const extracted = await extractStructuredData(stripped, EXTRACTION_PROMPT, intelExtractionSchema);

	const totalGames = extracted.xess2.length + extracted.xess.length;

	if (totalGames === 0) {
		throw new ScraperError(
			"AI extraction returned empty results for all Intel sections — page structure may have changed",
			"intel",
		);
	}

	const games = mergeIntoGames(extracted);
	const validated = intelGameArraySchema.parse(games);

	const outputPath = node_path.join(outputDir, "intel.json");
	await writeJson(outputPath, validated);

	return validated;
}
