import node_fs from "node:fs/promises";
import node_path from "node:path";
import { ScraperError } from "../types/errors.js";
import type { AmdGame } from "../types/providers.js";
import { amdGameArraySchema } from "../types/providers.js";
import { extractTagTexts, parseHeadings, uniqueValues } from "../utils/html.js";
import { fetchWithRetry } from "../utils/http.js";
import { readJson, writeJson } from "../utils/json.js";

const AMD_URL =
	"https://www.amd.com/en/products/graphics/technologies/fidelityfx/supported-games.html";

const DEFAULT_OUTPUT_DIR = node_path.resolve("data/providers");

// A large one-day drop is usually a broken parse or partial upstream page, not a real catalog change.
const MAX_ALLOWED_DROP_RATIO = 0.25;

/** Sections to extract from the AMD page */
const AMD_SECTIONS = [
	{ key: "fsrRedstone" as const, label: "FSR Redstone / FSR 4" },
	{ key: "fsr3" as const, label: "FSR 3" },
	{ key: "fsr2" as const, label: "FSR 2" },
	{ key: "fsrFrameGenerationMl" as const, label: "FSR Frame Generation (ML)" },
] as const;

type AmdSectionKey = (typeof AMD_SECTIONS)[number]["key"];

type AmdExtraction = Record<AmdSectionKey, string[]>;

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

function getSectionHeadingMatcher(sectionKey: AmdSectionKey): (headingText: string) => boolean {
	switch (sectionKey) {
		case "fsrRedstone":
			return (headingText) => /\bfsr\b/i.test(headingText) && /redstone|\b4\b/i.test(headingText);
		case "fsr3":
			return (headingText) => /^fsr\s*3\b/i.test(headingText);
		case "fsr2":
			return (headingText) => /^fsr\s*2\b/i.test(headingText);
		case "fsrFrameGenerationMl":
			return (headingText) => /frame generation\s*\(\s*ml\s*\)/i.test(headingText);
	}
}

function extractSectionGames(html: string, sectionKey: AmdSectionKey): string[] {
	const headings = parseHeadings(html);
	const matchHeading = getSectionHeadingMatcher(sectionKey);
	const sectionHeading = headings.find((heading) => matchHeading(heading.text));

	if (!sectionHeading) {
		throw new ScraperError(`AMD page layout changed: missing ${sectionKey} heading`, "amd");
	}

	const nextHeading = headings.find(
		(heading) => heading.level === sectionHeading.level && heading.start > sectionHeading.start,
	);

	const sectionHtml = html.slice(sectionHeading.end, nextHeading?.start ?? html.length);
	const tableMatch = sectionHtml.match(/<table[\s\S]*?<\/table>/i);

	if (!tableMatch) {
		throw new ScraperError(`AMD page layout changed: missing table for ${sectionKey}`, "amd");
	}

	return uniqueValues(extractTagTexts(tableMatch[0], "td"));
}

function extractAmdSections(html: string): AmdExtraction {
	return {
		fsrRedstone: extractSectionGames(html, "fsrRedstone"),
		fsr3: extractSectionGames(html, "fsr3"),
		fsr2: extractSectionGames(html, "fsr2"),
		fsrFrameGenerationMl: extractSectionGames(html, "fsrFrameGenerationMl"),
	};
}

async function getPreviousGameCount(outputPath: string): Promise<number | null> {
	try {
		await node_fs.access(outputPath);
	} catch {
		return null;
	}

	const previous = await readJson<AmdGame[]>(outputPath);
	return previous.length;
}

function assertNoLargeDrop(previousCount: number | null, nextCount: number): void {
	if (previousCount === null || previousCount === 0) {
		return;
	}

	const minAllowedCount = Math.ceil(previousCount * (1 - MAX_ALLOWED_DROP_RATIO));
	if (nextCount < minAllowedCount) {
		throw new ScraperError(
			`AMD extraction suspicious: ${nextCount} games vs ${previousCount} previously (>25% drop)`,
			"amd",
		);
	}
}

/** Merge extracted section lists into AmdGame[] */
function mergeIntoGames(extracted: AmdExtraction): AmdGame[] {
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
					name: trimmed,
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

/** Fetch AMD FidelityFX page, parse game data, validate, and write to disk */
export async function scrapeAmd(options?: ScrapeAmdOptions): Promise<AmdGame[]> {
	const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
	const response = await fetchWithRetry(AMD_URL);

	if (!response.ok) {
		throw new ScraperError(`AMD page returned HTTP ${response.status}`, "amd", response.status);
	}

	const html = await response.text();
	const stripped = stripBoilerplate(html);
	const extracted = extractAmdSections(stripped);

	// Check for completely empty extraction
	const totalGames =
		extracted.fsrRedstone.length +
		extracted.fsr3.length +
		extracted.fsr2.length +
		extracted.fsrFrameGenerationMl.length;

	if (totalGames === 0) {
		throw new ScraperError(
			"Extraction returned empty results for all AMD sections — page structure may have changed",
			"amd",
		);
	}

	const games = mergeIntoGames(extracted);
	const validated = amdGameArraySchema.parse(games);

	const outputPath = node_path.join(outputDir, "amd.json");
	const previousCount = await getPreviousGameCount(outputPath);
	assertNoLargeDrop(previousCount, validated.length);
	await writeJson(outputPath, validated);

	return validated;
}
