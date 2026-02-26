import node_fs from "node:fs/promises";
import node_path from "node:path";
import type {
	AllowlistAmdProvider,
	AllowlistEntry,
	AllowlistIntelProvider,
	AllowlistNvidiaProvider,
} from "../types/allowlist.js";
import { allowlistEntrySchema } from "../types/allowlist.js";
import type { AntiCheatData } from "../types/anticheat.js";
import type { AmdGame, IntelGame, NvidiaGame } from "../types/providers.js";
import type { StoreMapping } from "../types/stores.js";
import { readJson, writeJson } from "../utils/json.js";

const DEFAULT_DATA_DIR = node_path.resolve("data");
const DEFAULT_ALLOWLIST_PLATFORM = "steam";

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

async function loadStoreMappings(storesDir: string): Promise<StoreMapping> {
	return (await tryReadJson<StoreMapping>(node_path.join(storesDir, "by-game.json"))) ?? {};
}

/**
 * Read all provider files, store mappings, and anti-cheat results.
 * Filter to games with non-null appId and safe anti-cheat status.
 * Merge provider features and write per-app allowlist files.
 */
export async function generateAllowlist(options?: GenerateOptions): Promise<GenerateResult> {
	const dataDir = options?.dataDir ?? DEFAULT_DATA_DIR;
	const providersDir = node_path.join(dataDir, "providers");
	const storesDir = node_path.join(dataDir, "stores");
	const anticheatDir = node_path.join(dataDir, "anticheat");
	const allowlistDir = node_path.join(dataDir, "allowlist");
	const platformDir = node_path.join(allowlistDir, DEFAULT_ALLOWLIST_PLATFORM);

	// Load all data sources
	const nvidiaGames =
		(await tryReadJson<NvidiaGame[]>(node_path.join(providersDir, "nvidia.json"))) ?? [];
	const amdGames = (await tryReadJson<AmdGame[]>(node_path.join(providersDir, "amd.json"))) ?? [];
	const intelGames =
		(await tryReadJson<IntelGame[]>(node_path.join(providersDir, "intel.json"))) ?? [];
	const storeMappings = await loadStoreMappings(storesDir);
	const anticheatData =
		(await tryReadJson<AntiCheatData>(node_path.join(anticheatDir, "steam.json"))) ?? {};

	// Build lookup maps by game name
	const nvidiaMap = new Map(nvidiaGames.map((g) => [g.name, g]));
	const amdMap = new Map(amdGames.map((g) => [g.name, g]));
	const intelMap = new Map(intelGames.map((g) => [g.name, g]));

	// Collect all unique game names across all providers
	const allGameNames = new Set([...nvidiaMap.keys(), ...amdMap.keys(), ...intelMap.keys()]);

	const entries: AllowlistEntry[] = [];

	for (const name of allGameNames) {
		// Check store mapping
		const storeEntry = storeMappings[name];
		if (!storeEntry || storeEntry.steam === null) {
			continue; // No store ID — exclude
		}

		const appIdStr = storeEntry.steam.toString();

		// Check anti-cheat status
		const acResult = anticheatData[appIdStr];
		if (!acResult || !acResult.safe) {
			continue; // Not checked or not safe — exclude
		}

		// Build provider data
		const nvidia = nvidiaMap.get(name);
		const amd = amdMap.get(name);
		const intel = intelMap.get(name);

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
			name,
			stores: {
				steam: { appId: storeEntry.steam },
			},
			providers: {
				...(nvidiaProvider && { nvidia: nvidiaProvider }),
				...(amdProvider && { amd: amdProvider }),
				...(intelProvider && { intel: intelProvider }),
			},
		});
	}

	// Sort alphabetically by game name
	entries.sort((a, b) => a.name.localeCompare(b.name));

	// Validate + write one file per appId
	await node_fs.rm(platformDir, { recursive: true, force: true });
	await node_fs.mkdir(platformDir, { recursive: true });

	for (const entry of entries) {
		allowlistEntrySchema.parse(entry);
		const outputPath = node_path.join(platformDir, `${entry.stores.steam.appId}.json`);
		await writeJson(outputPath, entry);
	}

	// Remove legacy monolithic allowlist file if present.
	await node_fs.rm(node_path.join(dataDir, "allowlist.json"), { force: true });

	return { totalEntries: entries.length };
}
