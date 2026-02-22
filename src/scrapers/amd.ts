import node_path from "node:path";
import { z } from "zod";
import { ScraperError } from "../types/errors.js";
import type { AmdGame } from "../types/providers.js";
import { amdGameArraySchema } from "../types/providers.js";
import { extractStructuredData } from "../utils/ai.js";
import { fetchWithRetry } from "../utils/http.js";
import { writeJson } from "../utils/json.js";

const AMD_URL =
	"https://www.amd.com/en/products/graphics/technologies/fidelityfx/supported-games.html";

const DEFAULT_OUTPUT_DIR = node_path.resolve("data/providers");

/** Schema for AI extraction result per section */
const gameListSchema = z.array(z.string().min(1));

/** Sections to extract from the AMD page */
const AMD_SECTIONS = [
	{ key: "fsrRedstone" as const, label: "FSR Redstone / FSR 4" },
	{ key: "fsr3" as const, label: "FSR 3" },
	{ key: "fsr2" as const, label: "FSR 2" },
	{ key: "fsrFrameGenerationMl" as const, label: "FSR Frame Generation (ML)" },
] as const;

const EXTRACTION_PROMPT = `Extract the game names from this HTML content. The page contains AMD FidelityFX / FSR supported games organized in tabbed sections.

For each of the following sections, return the list of game names found:
1. "FSR Redstone" or "FSR 4" section - the newest FSR technology
2. "FSR 3" section
3. "FSR 2" section  
4. "FSR Frame Generation (ML)" section

Return a JSON object with these exact keys:
{
  "fsrRedstone": ["Game Name 1", "Game Name 2", ...],
  "fsr3": ["Game Name 1", "Game Name 2", ...],
  "fsr2": ["Game Name 1", "Game Name 2", ...],
  "fsrFrameGenerationMl": ["Game Name 1", "Game Name 2", ...]
}

If a section is not found or empty, return an empty array for that key.
Return ONLY the JSON object, no other text.`;

const amdExtractionSchema = z.object({
	fsrRedstone: gameListSchema,
	fsr3: gameListSchema,
	fsr2: gameListSchema,
	fsrFrameGenerationMl: gameListSchema,
});

interface ScrapeAmdOptions {
	/** Override the output directory (defaults to data/providers) */
	outputDir?: string;
}

/** Strip navigation, footer, and other boilerplate from AMD HTML */
function stripBoilerplate(html: string): string {
	// Remove script and style tags
	let stripped = html.replace(/<script[\s\S]*?<\/script>/gi, "");
	stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, "");
	// Remove navigation
	stripped = stripped.replace(/<nav[\s\S]*?<\/nav>/gi, "");
	// Remove footer
	stripped = stripped.replace(/<footer[\s\S]*?<\/footer>/gi, "");
	// Remove header
	stripped = stripped.replace(/<header[\s\S]*?<\/header>/gi, "");
	return stripped;
}

/** Merge extracted section lists into AmdGame[] */
function mergeIntoGames(extracted: z.infer<typeof amdExtractionSchema>): AmdGame[] {
	const gameMap = new Map<string, AmdGame>();

	for (const section of AMD_SECTIONS) {
		const names = extracted[section.key];
		for (const name of names) {
			const trimmed = name.trim();
			if (!trimmed) continue;

			const existing = gameMap.get(trimmed);
			if (existing) {
				existing[section.key] = true;
			} else {
				gameMap.set(trimmed, {
					gameName: trimmed,
					fsrRedstone: section.key === "fsrRedstone",
					fsr3: section.key === "fsr3",
					fsr2: section.key === "fsr2",
					fsrFrameGenerationMl: section.key === "fsrFrameGenerationMl",
				});
			}
		}
	}

	return Array.from(gameMap.values());
}

/** Fetch AMD FidelityFX page, extract game data via AI, validate, and write to disk */
export async function scrapeAmd(options?: ScrapeAmdOptions): Promise<AmdGame[]> {
	const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
	const response = await fetchWithRetry(AMD_URL);

	if (!response.ok) {
		throw new ScraperError(`AMD page returned HTTP ${response.status}`, "amd", response.status);
	}

	const html = await response.text();
	const stripped = stripBoilerplate(html);

	const extracted = await extractStructuredData(stripped, EXTRACTION_PROMPT, amdExtractionSchema);

	// Check for completely empty extraction
	const totalGames =
		extracted.fsrRedstone.length +
		extracted.fsr3.length +
		extracted.fsr2.length +
		extracted.fsrFrameGenerationMl.length;

	if (totalGames === 0) {
		throw new ScraperError(
			"AI extraction returned empty results for all AMD sections — page structure may have changed",
			"amd",
		);
	}

	const games = mergeIntoGames(extracted);
	const validated = amdGameArraySchema.parse(games);

	const outputPath = node_path.join(outputDir, "amd.json");
	await writeJson(outputPath, validated);

	return validated;
}
