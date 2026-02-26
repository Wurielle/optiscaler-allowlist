import node_fs from "node:fs/promises";
import node_path from "node:path";
import { type StoreMapping, storeMappingSchema } from "../types/stores.js";
import { readJson, writeJson } from "../utils/json.js";

interface LegacyStoreMappingEntry {
	appId: number | null;
}

type LegacyStoreMapping = Record<string, LegacyStoreMappingEntry>;

const storesDir = node_path.resolve("data/stores");
const legacyFilePath = node_path.join(storesDir, "steam.json");
const byGameFilePath = node_path.join(storesDir, "by-game.json");

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await node_fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function main(): Promise<void> {
	const hasLegacy = await fileExists(legacyFilePath);
	const hasByGame = await fileExists(byGameFilePath);

	if (!hasLegacy) {
		if (hasByGame) {
			console.log("No legacy data/stores/steam.json found; by-game mapping already exists.");
			return;
		}

		console.log("No store mapping found to migrate.");
		return;
	}

	const legacyMapping = await readJson<LegacyStoreMapping>(legacyFilePath);
	const migrated: StoreMapping = {};

	for (const [game, entry] of Object.entries(legacyMapping)) {
		migrated[game] = { steam: entry.appId };
	}

	storeMappingSchema.parse(migrated);
	await writeJson(byGameFilePath, migrated);
	await node_fs.rm(legacyFilePath, { force: true });

	console.log(
		`Migrated ${Object.keys(migrated).length} entries to data/stores/by-game.json and removed legacy data/stores/steam.json.`,
	);
}

main().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});
