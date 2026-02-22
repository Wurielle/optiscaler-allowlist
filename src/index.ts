import { checkAll } from "./checkers/index.js";
import { generateAllowlist } from "./generators/allowlist.js";
import { matchAll } from "./matchers/index.js";
import { scrapeAll } from "./scrapers/index.js";

const COMMANDS = ["scrape", "match", "check", "generate", "pipeline"] as const;
type Command = (typeof COMMANDS)[number];

function parseLimit(): number | undefined {
	const idx = process.argv.indexOf("--limit");
	if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
	const val = Number.parseInt(process.argv[idx + 1], 10);
	return Number.isNaN(val) ? undefined : val;
}

function printUsage(): void {
	console.log("Usage: npx tsx src/index.ts <command> [--limit N]");
	console.log("");
	console.log("Commands:");
	console.log("  scrape    - Scrape all provider pages (NVIDIA, AMD, Intel)");
	console.log("  match     - Match game names to Steam app IDs");
	console.log("  check     - Check anti-cheat safety for matched games");
	console.log("  generate  - Generate the unified allowlist");
	console.log("  pipeline  - Run all stages in sequence");
	console.log("");
	console.log("Options:");
	console.log("  --limit N - Max new entries to process per run (default: 25, match/check only)");
}

async function runScrape(): Promise<void> {
	console.log("Scraping provider pages...");
	const results = await scrapeAll();
	for (const r of results) {
		if (r.success) {
			console.log(`  ${r.provider}: ${r.gameCount} games`);
		} else {
			console.error(`  ${r.provider}: FAILED - ${r.error}`);
		}
	}
	const failed = results.filter((r) => !r.success);
	if (failed.length > 0) {
		console.error(`${failed.length} scraper(s) failed`);
	}
}

async function runMatch(limit?: number): Promise<void> {
	console.log(`Matching game names to Steam app IDs (limit: ${limit ?? 25})...`);
	const result = await matchAll({ limit });
	console.log(
		`  Total names: ${result.totalNames}, New: ${result.newNames}, Matched: ${result.matched}, Unmatched: ${result.unmatched}`,
	);
}

async function runCheck(limit?: number): Promise<void> {
	console.log(`Checking anti-cheat safety (limit: ${limit ?? 25})...`);
	const result = await checkAll({ limit });
	console.log(
		`  Total IDs: ${result.totalAppIds}, New: ${result.newAppIds}, Safe: ${result.safe}, Unsafe: ${result.unsafe}, Skipped: ${result.skipped}`,
	);
}

async function runGenerate(): Promise<void> {
	console.log("Generating allowlist...");
	const result = await generateAllowlist();
	console.log(`  Allowlist entries: ${result.totalEntries}`);
}

async function runPipeline(limit?: number): Promise<void> {
	await runScrape();
	await runMatch(limit);
	await runCheck(limit);
	await runGenerate();
	console.log("Pipeline complete.");
}

async function main(): Promise<void> {
	const command = process.argv[2] as Command | undefined;

	if (!command || !COMMANDS.includes(command)) {
		printUsage();
		process.exit(command ? 1 : 0);
	}

	const limit = parseLimit();

	switch (command) {
		case "scrape":
			await runScrape();
			break;
		case "match":
			await runMatch(limit);
			break;
		case "check":
			await runCheck(limit);
			break;
		case "generate":
			await runGenerate();
			break;
		case "pipeline":
			await runPipeline(limit);
			break;
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
