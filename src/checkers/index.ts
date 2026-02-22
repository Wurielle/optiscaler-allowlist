import node_fs from "node:fs/promises";
import node_path from "node:path";
import type { AntiCheatData } from "../types/anticheat.js";
import type { StoreMapping } from "../types/stores.js";
import { readJson, writeJson } from "../utils/json.js";
import { checkAntiCheat, resetCache } from "./anticheat.js";

const DEFAULT_STORES_DIR = node_path.resolve("data/stores");
const DEFAULT_ANTICHEAT_DIR = node_path.resolve("data/anticheat");

const DEFAULT_LIMIT = 25;

export interface CheckerOptions {
	/** Override the stores data directory */
	storesDir?: string;
	/** Override the anticheat data directory */
	anticheatDir?: string;
	/** Maximum number of new app IDs to check per run (default: 25) */
	limit?: number;
}

export interface CheckResult {
	totalAppIds: number;
	newAppIds: number;
	safe: number;
	unsafe: number;
	skipped: number;
}

/** Load store mappings, or return empty object if file doesn't exist */
async function loadStoreMappings(storesDir: string): Promise<StoreMapping> {
	const filePath = node_path.join(storesDir, "steam.json");
	try {
		await node_fs.access(filePath);
		return await readJson<StoreMapping>(filePath);
	} catch {
		return {};
	}
}

/** Load existing anti-cheat data, or return empty object if file doesn't exist */
async function loadExistingResults(anticheatDir: string): Promise<AntiCheatData> {
	const filePath = node_path.join(anticheatDir, "steam.json");
	try {
		await node_fs.access(filePath);
		return await readJson<AntiCheatData>(filePath);
	} catch {
		return {};
	}
}

/**
 * Read store mappings, collect non-null app IDs, diff against existing anti-cheat data,
 * and check only new IDs.
 */
export async function checkAll(options?: CheckerOptions): Promise<CheckResult> {
	const storesDir = options?.storesDir ?? DEFAULT_STORES_DIR;
	const anticheatDir = options?.anticheatDir ?? DEFAULT_ANTICHEAT_DIR;
	const limit = options?.limit ?? DEFAULT_LIMIT;

	const storeMappings = await loadStoreMappings(storesDir);
	const existing = await loadExistingResults(anticheatDir);
	const results: AntiCheatData = { ...existing };

	// Collect non-null app IDs with their game names
	const appIdEntries: { appId: string; game: string }[] = [];
	for (const [game, entry] of Object.entries(storeMappings)) {
		if (entry.appId !== null) {
			appIdEntries.push({ appId: entry.appId.toString(), game });
		}
	}

	// Filter to only new app IDs, capped at limit
	const allNewEntries = appIdEntries.filter((entry) => !(entry.appId in results));
	const newEntries = allNewEntries.slice(0, limit);

	let safe = 0;
	let unsafe = 0;
	let skipped = 0;

	// Reset AWACY cache for fresh data each run
	resetCache();

	for (const entry of newEntries) {
		const result = await checkAntiCheat(entry.appId, entry.game);

		if (result === null) {
			// Cannot determine — skip and log warning
			console.warn(
				`Warning: Could not determine anti-cheat status for ${entry.game} (appId: ${entry.appId})`,
			);
			skipped++;
			continue;
		}

		results[entry.appId] = result;

		if (result.safe) {
			safe++;
		} else {
			unsafe++;
		}
	}

	// Write updated results
	const outputPath = node_path.join(anticheatDir, "steam.json");
	await writeJson(outputPath, results);

	return {
		totalAppIds: appIdEntries.length,
		newAppIds: newEntries.length,
		safe,
		unsafe,
		skipped,
	};
}
