import node_fs from "node:fs/promises";
import node_path from "node:path";
import type {
	AllowlistAmdProvider,
	AllowlistEntry,
	AllowlistIntelProvider,
	AllowlistNvidiaProvider,
} from "../types/allowlist.js";
import { allowlistSchema } from "../types/allowlist.js";
import type { AntiCheatData } from "../types/anticheat.js";
import type { AmdGame, IntelGame, NvidiaGame } from "../types/providers.js";
import type { StoreMapping } from "../types/stores.js";
import { readJson, writeJson } from "../utils/json.js";

const DEFAULT_DATA_DIR = node_path.resolve("data");

export interface GenerateOptions {
	/** Override the base data directory */
	dataDir?: string;
}

export interface GenerateResult {
	totalEntries: number;
}

/** Try to read a JSON file, return null if it doesn't exist */
async function tryReadJson<T>(filePath: string): Promise<T | null> {
	try {
		await node_fs.access(filePath);
		return await readJson<T>(filePath);
	} catch {
		return null;
	}
}

/**
 * Read all provider files, store mappings, and anti-cheat results.
 * Filter to games with non-null appId and safe anti-cheat status.
 * Merge provider features and write data/allowlist.json.
 */
export async function generateAllowlist(options?: GenerateOptions): Promise<GenerateResult> {
	const dataDir = options?.dataDir ?? DEFAULT_DATA_DIR;
	const providersDir = node_path.join(dataDir, "providers");
	const storesDir = node_path.join(dataDir, "stores");
	const anticheatDir = node_path.join(dataDir, "anticheat");

	// Load all data sources
	const nvidiaGames =
		(await tryReadJson<NvidiaGame[]>(node_path.join(providersDir, "nvidia.json"))) ?? [];
	const amdGames = (await tryReadJson<AmdGame[]>(node_path.join(providersDir, "amd.json"))) ?? [];
	const intelGames =
		(await tryReadJson<IntelGame[]>(node_path.join(providersDir, "intel.json"))) ?? [];
	const storeMappings =
		(await tryReadJson<StoreMapping>(node_path.join(storesDir, "steam.json"))) ?? {};
	const anticheatData =
		(await tryReadJson<AntiCheatData>(node_path.join(anticheatDir, "steam.json"))) ?? {};

	// Build lookup maps by game name
	const nvidiaMap = new Map(nvidiaGames.map((g) => [g.gameName, g]));
	const amdMap = new Map(amdGames.map((g) => [g.gameName, g]));
	const intelMap = new Map(intelGames.map((g) => [g.gameName, g]));

	// Collect all unique game names across all providers
	const allGameNames = new Set([...nvidiaMap.keys(), ...amdMap.keys(), ...intelMap.keys()]);

	const entries: AllowlistEntry[] = [];

	for (const gameName of allGameNames) {
		// Check store mapping
		const storeEntry = storeMappings[gameName];
		if (!storeEntry || storeEntry.appId === null) {
			continue; // No store ID — exclude
		}

		const appIdStr = storeEntry.appId.toString();

		// Check anti-cheat status
		const acResult = anticheatData[appIdStr];
		if (!acResult || !acResult.safe) {
			continue; // Not checked or not safe — exclude
		}

		// Build provider data
		const nvidia = nvidiaMap.get(gameName);
		const amd = amdMap.get(gameName);
		const intel = intelMap.get(gameName);

		const nvidiaProvider: AllowlistNvidiaProvider | undefined = nvidia
			? {
					dlssMultiFrameGeneration: nvidia.dlssMultiFrameGeneration,
					dlssFrameGeneration: nvidia.dlssFrameGeneration,
					dlssSuperResolution: nvidia.dlssSuperResolution,
					dlssRayReconstruction: nvidia.dlssRayReconstruction,
					dlaa: nvidia.dlaa,
					rayTracing: nvidia.rayTracing,
				}
			: undefined;

		const amdProvider: AllowlistAmdProvider | undefined = amd
			? {
					fsrRedstone: amd.fsrRedstone,
					fsr3: amd.fsr3,
					fsr2: amd.fsr2,
					fsrFrameGenerationMl: amd.fsrFrameGenerationMl,
				}
			: undefined;

		const intelProvider: AllowlistIntelProvider | undefined = intel
			? {
					xess2: intel.xess2,
					xess: intel.xess,
				}
			: undefined;

		entries.push({
			gameName,
			stores: {
				steam: { appId: storeEntry.appId },
			},
			providers: {
				...(nvidiaProvider && { nvidia: nvidiaProvider }),
				...(amdProvider && { amd: amdProvider }),
				...(intelProvider && { intel: intelProvider }),
			},
		});
	}

	// Sort alphabetically by game name
	entries.sort((a, b) => a.gameName.localeCompare(b.gameName));

	// Validate
	allowlistSchema.parse(entries);

	// Write output
	const outputPath = node_path.join(dataDir, "allowlist.json");
	await writeJson(outputPath, entries);

	return { totalEntries: entries.length };
}
