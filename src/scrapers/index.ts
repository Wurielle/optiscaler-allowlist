import { ScraperError } from "../types/errors.js";
import { scrapeAmd } from "./amd.js";
import { scrapeIntel } from "./intel.js";
import { scrapeNvidia } from "./nvidia.js";

export interface ScraperResult {
	provider: string;
	success: boolean;
	gameCount: number;
	error?: string;
}

export interface ScrapeAllOptions {
	/** Override the output directory (defaults to data/providers) */
	outputDir?: string;
}

/**
 * Run all three provider scrapers, handling partial failures.
 * One scraper failing does not block the others.
 */
export async function scrapeAll(options?: ScrapeAllOptions): Promise<ScraperResult[]> {
	const outputDir = options?.outputDir;
	const results: ScraperResult[] = [];

	// Run scrapers sequentially to be respectful of rate limits
	const scrapers = [
		{
			name: "nvidia",
			fn: () => scrapeNvidia({ outputDir }),
		},
		{
			name: "amd",
			fn: () => scrapeAmd({ outputDir }),
		},
		{
			name: "intel",
			fn: () => scrapeIntel({ outputDir }),
		},
	];

	for (const scraper of scrapers) {
		try {
			const games = await scraper.fn();
			results.push({
				provider: scraper.name,
				success: true,
				gameCount: games.length,
			});
		} catch (error) {
			const message =
				error instanceof ScraperError
					? error.message
					: error instanceof Error
						? error.message
						: String(error);
			results.push({
				provider: scraper.name,
				success: false,
				gameCount: 0,
				error: message,
			});
		}
	}

	return results;
}
