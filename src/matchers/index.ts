import node_fs from "node:fs/promises";
import node_path from "node:path";
import type { AmdGame, IntelGame, NvidiaGame } from "../types/providers.js";
import type { StoreMapping } from "../types/stores.js";
import { readJson, writeJson } from "../utils/json.js";
import { searchSteam, throttle } from "./steam.js";

const DEFAULT_PROVIDERS_DIR = node_path.resolve("data/providers");
const DEFAULT_STORES_DIR = node_path.resolve("data/stores");

const DEFAULT_LIMIT = 25;

export interface MatcherOptions {
	/** Override the providers data directory */
	providersDir?: string;
	/** Override the stores data directory */
	storesDir?: string;
	/** Maximum number of new names to match per run (default: 25) */
	limit?: number;
}

export interface MatchResult {
	totalNames: number;
	newNames: number;
	matched: number;
	unmatched: number;
}

/** Collect all unique game names from provider JSON files */
async function collectGameNames(providersDir: string): Promise<Set<string>> {
	const names = new Set<string>();

	const tryRead = async <T extends { name: string }>(filename: string): Promise<void> => {
		const filePath = node_path.join(providersDir, filename);
		try {
			await node_fs.access(filePath);
			const data = await readJson<T[]>(filePath);
			for (const entry of data) {
				names.add(entry.name);
			}
		} catch {
			// File doesn't exist yet — skip
		}
	};

	await tryRead<NvidiaGame>("nvidia.json");
	await tryRead<AmdGame>("amd.json");
	await tryRead<IntelGame>("intel.json");

	return names;
}

/** Load existing store mappings, or return empty object if file doesn't exist */
async function loadExistingMappings(storesDir: string): Promise<StoreMapping> {
	const byGameFilePath = node_path.join(storesDir, "by-game.json");
	try {
		await node_fs.access(byGameFilePath);
		return await readJson<StoreMapping>(byGameFilePath);
	} catch {
		return {};
	}
}

/**
 * Read all provider files, collect unique game names, diff against existing
 * store mappings, and run the Steam matcher only for new names.
 */
export async function matchAll(options?: MatcherOptions): Promise<MatchResult> {
	const providersDir = options?.providersDir ?? DEFAULT_PROVIDERS_DIR;
	const storesDir = options?.storesDir ?? DEFAULT_STORES_DIR;
	const limit = options?.limit ?? DEFAULT_LIMIT;

	const allNames = await collectGameNames(providersDir);
	const existing = await loadExistingMappings(storesDir);
	const mapping: StoreMapping = { ...existing };

	// Find names not yet in the mapping, capped at limit
	const allNewNames = [...allNames].filter((name) => !(name in mapping));
	const newNames = allNewNames.slice(0, limit);

	let matched = 0;
	let unmatched = 0;

	for (let i = 0; i < newNames.length; i++) {
		const name = newNames[i];

		const result = await searchSteam(name);
		mapping[name] = { steam: result.appId };

		if (result.appId !== null) {
			matched++;
		} else {
			unmatched++;
		}

		// Throttle between requests (skip after last)
		if (i < newNames.length - 1) {
			await throttle();
		}
	}

	// Write updated mappings
	const outputPath = node_path.join(storesDir, "by-game.json");
	await writeJson(outputPath, mapping);

	return {
		totalNames: allNames.size,
		newNames: newNames.length,
		matched,
		unmatched,
	};
}
