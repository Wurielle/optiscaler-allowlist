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
import { normalizeGameName, toCanonicalName } from "../utils/normalize.js";

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

	// Build lookup maps by normalized game name for deduplication
	const nvidiaMap = new Map<string, NvidiaGame>();
	const amdMap = new Map<string, AmdGame>();
	const intelMap = new Map<string, IntelGame>();

	for (const game of nvidiaGames) {
		const key = normalizeGameName(game.name);
		if (!nvidiaMap.has(key)) {
			nvidiaMap.set(key, game);
		}
	}
	for (const game of amdGames) {
		const key = normalizeGameName(game.name);
		if (!amdMap.has(key)) {
			amdMap.set(key, game);
		}
	}
	for (const game of intelGames) {
		const key = normalizeGameName(game.name);
		if (!intelMap.has(key)) {
			intelMap.set(key, game);
		}
	}

	// Build reverse mapping: canonical name -> Steam appId
	const canonicalToAppId = new Map<string, number>();
	for (const [rawName, entry] of Object.entries(storeMappings)) {
		if (entry.steam !== null) {
			const canonical = toCanonicalName(rawName);
			const normalizedKey = normalizeGameName(rawName);
			if (!canonicalToAppId.has(normalizedKey)) {
				canonicalToAppId.set(normalizedKey, entry.steam);
			}
		}
	}

	// Collect all unique normalized game names across all providers
	const allNormalizedNames = new Set<string>([
		...nvidiaMap.keys(),
		...amdMap.keys(),
		...intelMap.keys(),
	]);

	// Group entries by appId to merge features from all providers
	const appEntries = new Map<number, AllowlistEntry>();

	for (const normName of allNormalizedNames) {
		const appId = canonicalToAppId.get(normName);
		if (appId === undefined) {
			continue; // No store mapping
		}

		const acResult = anticheatData[appId.toString()];
		if (!acResult || !acResult.safe) {
			continue; // Not checked or not safe
		}

		const nvidia = nvidiaMap.get(normName);
		const amd = amdMap.get(normName);
		const intel = intelMap.get(normName);

		const existing = appEntries.get(appId);
		const canonicalName =
			existing?.name ?? toCanonicalName(nvidia?.name ?? amd?.name ?? intel?.name ?? "");

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

		// Merge with existing entry for same appId
		if (existing) {
			existing.providers = {
				...existing.providers,
				...(nvidiaProvider && { nvidia: nvidiaProvider }),
				...(amdProvider && { amd: amdProvider }),
				...(intelProvider && { intel: intelProvider }),
			};
		} else {
			appEntries.set(appId, {
				name: canonicalName,
				stores: {
					steam: { appId },
				},
				providers: {
					...(nvidiaProvider && { nvidia: nvidiaProvider }),
					...(amdProvider && { amd: amdProvider }),
					...(intelProvider && { intel: intelProvider }),
				},
			});
		}
	}

	const entries = [...appEntries.values()];

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
