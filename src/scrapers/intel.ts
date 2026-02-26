import node_fs from "node:fs/promises";
import node_path from "node:path";
import { ScraperError } from "../types/errors.js";
import type { IntelGame } from "../types/providers.js";
import { intelGameArraySchema } from "../types/providers.js";
import { extractTagTexts, parseHeadings, uniqueValues } from "../utils/html.js";
import { fetchWithRetry } from "../utils/http.js";
import { readJson, writeJson } from "../utils/json.js";

const INTEL_URL = "https://game.intel.com/us/xess-enabled-games/";

const DEFAULT_OUTPUT_DIR = node_path.resolve("data/providers");

// A large one-day drop is usually a broken parse or partial upstream page, not a real catalog change.
const MAX_ALLOWED_DROP_RATIO = 0.25;

interface IntelExtraction {
	xess2: string[];
	xess: string[];
}

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

function extractIntelSections(html: string): IntelExtraction {
	const headings = parseHeadings(html);

	const xess2Heading = headings.find((heading) => /^xess\s*2\s*enabled games$/i.test(heading.text));
	if (!xess2Heading) {
		throw new ScraperError(
			"Intel page layout changed: missing XeSS 2 enabled games heading",
			"intel",
		);
	}

	const xessHeading = headings.find(
		(heading) => /^xess\s*enabled games$/i.test(heading.text) && heading.start > xess2Heading.start,
	);

	if (!xessHeading) {
		throw new ScraperError(
			"Intel page layout changed: missing XeSS enabled games heading",
			"intel",
		);
	}

	const xess2Section = html.slice(xess2Heading.end, xessHeading.start);
	const xessSection = html.slice(xessHeading.end);

	const xess2 = uniqueValues(extractTagTexts(xess2Section, "h1"));
	const xess = uniqueValues(extractTagTexts(xessSection, "h1"));

	return { xess2, xess };
}

async function getPreviousGameCount(outputPath: string): Promise<number | null> {
	try {
		await node_fs.access(outputPath);
	} catch {
		return null;
	}

	const previous = await readJson<IntelGame[]>(outputPath);
	return previous.length;
}

function assertNoLargeDrop(previousCount: number | null, nextCount: number): void {
	if (previousCount === null || previousCount === 0) {
		return;
	}

	const minAllowedCount = Math.ceil(previousCount * (1 - MAX_ALLOWED_DROP_RATIO));
	if (nextCount < minAllowedCount) {
		throw new ScraperError(
			`Intel extraction suspicious: ${nextCount} games vs ${previousCount} previously (>25% drop)`,
			"intel",
		);
	}
}

/** Merge extracted section lists into IntelGame[] */
function mergeIntoGames(extracted: IntelExtraction): IntelGame[] {
	const gameMap = new Map<string, IntelGame>();

	for (const name of extracted.xess2) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		gameMap.set(trimmed, { name: trimmed, xess2: true, xess: false });
	}

	for (const name of extracted.xess) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		const existing = gameMap.get(trimmed);
		if (existing) {
			existing.xess = true;
		} else {
			gameMap.set(trimmed, { name: trimmed, xess2: false, xess: true });
		}
	}

	return Array.from(gameMap.values());
}

/** Fetch Intel XeSS page, parse game data, validate, and write to disk */
export async function scrapeIntel(options?: ScrapeIntelOptions): Promise<IntelGame[]> {
	const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
	const response = await fetchWithRetry(INTEL_URL);

	if (!response.ok) {
		throw new ScraperError(`Intel page returned HTTP ${response.status}`, "intel", response.status);
	}

	const html = await response.text();
	const stripped = stripBoilerplate(html);
	const extracted = extractIntelSections(stripped);

	const totalGames = extracted.xess2.length + extracted.xess.length;

	if (totalGames === 0) {
		throw new ScraperError(
			"Extraction returned empty results for all Intel sections — page structure may have changed",
			"intel",
		);
	}

	const games = mergeIntoGames(extracted);
	const validated = intelGameArraySchema.parse(games);

	const outputPath = node_path.join(outputDir, "intel.json");
	const previousCount = await getPreviousGameCount(outputPath);
	assertNoLargeDrop(previousCount, validated.length);
	await writeJson(outputPath, validated);

	return validated;
}
