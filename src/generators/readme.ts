import node_fs from "node:fs/promises";
import node_path from "node:path";
import { fileURLToPath } from "node:url";
import type { AllowlistEntry } from "../types/allowlist.js";
import { allowlistEntrySchema } from "../types/allowlist.js";
import type { AntiCheatData } from "../types/anticheat.js";
import { antiCheatDataSchema } from "../types/anticheat.js";
import {
	amdGameArraySchema,
	intelGameArraySchema,
	nvidiaGameArraySchema,
} from "../types/providers.js";
import { storeMappingSchema } from "../types/stores.js";

const DEFAULT_ALLOWLIST_DIR = node_path.resolve("data", "allowlist", "steam");
const DEFAULT_PROVIDERS_DIR = node_path.resolve("data", "providers");
const DEFAULT_STORE_MAPPINGS_PATH = node_path.resolve("data", "stores", "by-game.json");
const DEFAULT_ANTICHEAT_PATH = node_path.resolve("data", "anticheat", "steam.json");
const DEFAULT_TEMPLATE_PATH = node_path.resolve("README.template.md");
const DEFAULT_OUTPUT_PATH = node_path.resolve("README.md");

interface ReadmeTableRow {
	name: string;
	steamAppId: number | null;
	hasDlss: boolean;
	hasFsr: boolean;
	hasXess: boolean;
}

export interface GenerateReadmeOptions {
	allowlistDir?: string;
	providersDir?: string;
	storeMappingsPath?: string;
	anticheatPath?: string;
	templatePath?: string;
	outputPath?: string;
	generatedAt?: Date;
}

export interface GenerateReadmeResult {
	safeCount: number;
	unsafeCount: number;
	notCheckedCount: number;
	unsupportedCount: number;
	outputPath: string;
}

function checkbox(value: boolean): string {
	return value ? "✅" : "❌";
}

function hasNvidiaFeature(value: string | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function escapeCell(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatStore(steamAppId: number | null): string {
	if (steamAppId === null) {
		return "Not mapped";
	}

	return `<a href="https://store.steampowered.com/app/${steamAppId}/" target="_blank" rel="noopener noreferrer">Steam</a>`;
}

function renderGamesTable(rows: ReadmeTableRow[]): string {
	if (rows.length === 0) {
		return "No games found.";
	}

	const bodyRows = rows
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((row) => {
			return [
				escapeCell(row.name),
				formatStore(row.steamAppId),
				checkbox(row.hasDlss),
				checkbox(row.hasFsr),
				checkbox(row.hasXess),
			];
		})
		.map(
			(cells) =>
				`<tr><td>${cells[0]}</td><td>${cells[1]}</td><td>${cells[2]}</td><td>${cells[3]}</td><td>${cells[4]}</td></tr>`,
		);

	return [
		'<table width="100%">',
		"<thead><tr><th>Game</th><th>Store</th><th>DLSS</th><th>FSR</th><th>XeSS</th></tr></thead>",
		"<tbody>",
		bodyRows.join("\n"),
		"</tbody>",
		"</table>",
	].join("\n");
}

export function renderAllowlistTable(entries: AllowlistEntry[]): string {
	const rows = entries.map((entry) => {
		const nvidia = entry.providers.nvidia;
		const amd = entry.providers.amd;
		const intel = entry.providers.intel;

		return {
			name: entry.name,
			steamAppId: entry.stores.steam.appId,
			hasDlss:
				hasNvidiaFeature(nvidia?.dlssMultiFrameGeneration) ||
				hasNvidiaFeature(nvidia?.dlssFrameGeneration) ||
				hasNvidiaFeature(nvidia?.dlssSuperResolution) ||
				hasNvidiaFeature(nvidia?.dlssRayReconstruction) ||
				hasNvidiaFeature(nvidia?.dlaa),
			hasFsr:
				Boolean(amd?.fsrRedstone) ||
				Boolean(amd?.fsr3) ||
				Boolean(amd?.fsr2) ||
				Boolean(amd?.fsrFrameGenerationMl),
			hasXess: Boolean(intel?.xess2) || Boolean(intel?.xess),
		} satisfies ReadmeTableRow;
	});

	return renderGamesTable(rows);
}

async function tryReadJsonFile<T>(
	filePath: string,
	parse: (value: unknown) => T,
	fallback: T,
): Promise<T> {
	try {
		const content = await node_fs.readFile(filePath, "utf-8");
		return parse(JSON.parse(content));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return fallback;
		}
		throw error;
	}
}

async function loadAllGameRows(
	providersDir: string,
	storeMappingsPath: string,
): Promise<ReadmeTableRow[]> {
	const [nvidiaGames, amdGames, intelGames, storeMappings] = await Promise.all([
		tryReadJsonFile(
			node_path.join(providersDir, "nvidia.json"),
			(value) => nvidiaGameArraySchema.parse(value),
			[],
		),
		tryReadJsonFile(
			node_path.join(providersDir, "amd.json"),
			(value) => amdGameArraySchema.parse(value),
			[],
		),
		tryReadJsonFile(
			node_path.join(providersDir, "intel.json"),
			(value) => intelGameArraySchema.parse(value),
			[],
		),
		tryReadJsonFile(storeMappingsPath, (value) => storeMappingSchema.parse(value), {}),
	]);

	const dlssByName = new Map<string, boolean>();
	for (const game of nvidiaGames) {
		dlssByName.set(
			game.name,
			hasNvidiaFeature(game.dlssMultiFrameGeneration) ||
				hasNvidiaFeature(game.dlssFrameGeneration) ||
				hasNvidiaFeature(game.dlssSuperResolution) ||
				hasNvidiaFeature(game.dlssRayReconstruction) ||
				hasNvidiaFeature(game.dlaa),
		);
	}

	const fsrByName = new Map<string, boolean>();
	for (const game of amdGames) {
		fsrByName.set(
			game.name,
			game.fsrRedstone || game.fsr3 || game.fsr2 || game.fsrFrameGenerationMl,
		);
	}

	const xessByName = new Map<string, boolean>();
	for (const game of intelGames) {
		xessByName.set(game.name, game.xess2 || game.xess);
	}

	const allNames = new Set<string>([
		...nvidiaGames.map((game) => game.name),
		...amdGames.map((game) => game.name),
		...intelGames.map((game) => game.name),
	]);

	return [...allNames].map((name) => ({
		name,
		steamAppId: storeMappings[name]?.steam ?? null,
		hasDlss: dlssByName.get(name) ?? false,
		hasFsr: fsrByName.get(name) ?? false,
		hasXess: xessByName.get(name) ?? false,
	}));
}

export function compileReadmeTemplate(
	template: string,
	safeEntries: AllowlistEntry[],
	unsafeRows: ReadmeTableRow[],
	notCheckedRows: ReadmeTableRow[],
	unsupportedRows: ReadmeTableRow[],
	generatedAt: Date,
): string {
	return template
		.replaceAll("{{ALLOWLIST_TABLE}}", renderAllowlistTable(safeEntries))
		.replaceAll("{{SAFE_GAMES_TABLE}}", renderAllowlistTable(safeEntries))
		.replaceAll("{{UNSAFE_GAMES_TABLE}}", renderGamesTable(unsafeRows))
		.replaceAll("{{NOT_CHECKED_GAMES_TABLE}}", renderGamesTable(notCheckedRows))
		.replaceAll("{{UNSUPPORTED_GAMES_TABLE}}", renderGamesTable(unsupportedRows))
		.replaceAll("{{ALLOWLIST_LAST_UPDATED_UTC}}", generatedAt.toISOString());
}

async function loadAllowlistEntries(allowlistDir: string): Promise<AllowlistEntry[]> {
	try {
		const fileNames = await node_fs.readdir(allowlistDir);
		const jsonNames = fileNames.filter((name) => name.endsWith(".json"));
		const entries = await Promise.all(
			jsonNames.map(async (fileName) => {
				const filePath = node_path.join(allowlistDir, fileName);
				const content = await node_fs.readFile(filePath, "utf-8");
				return allowlistEntrySchema.parse(JSON.parse(content)) as AllowlistEntry;
			}),
		);
		return entries.sort((a, b) => a.name.localeCompare(b.name));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export async function generateReadme(
	options?: GenerateReadmeOptions,
): Promise<GenerateReadmeResult> {
	const allowlistDir = options?.allowlistDir ?? DEFAULT_ALLOWLIST_DIR;
	const providersDir = options?.providersDir ?? DEFAULT_PROVIDERS_DIR;
	const storeMappingsPath = options?.storeMappingsPath ?? DEFAULT_STORE_MAPPINGS_PATH;
	const anticheatPath = options?.anticheatPath ?? DEFAULT_ANTICHEAT_PATH;
	const templatePath = options?.templatePath ?? DEFAULT_TEMPLATE_PATH;
	const outputPath = options?.outputPath ?? DEFAULT_OUTPUT_PATH;
	const generatedAt = options?.generatedAt ?? new Date();

	const [template, safeEntries, allRows, anticheatData] = await Promise.all([
		node_fs.readFile(templatePath, "utf-8"),
		loadAllowlistEntries(allowlistDir),
		loadAllGameRows(providersDir, storeMappingsPath),
		tryReadJsonFile(anticheatPath, (value) => antiCheatDataSchema.parse(value), {}),
	]);

	const safeGameNames = new Set(safeEntries.map((entry) => entry.name));

	const unsafeRows: ReadmeTableRow[] = [];
	const notCheckedRows: ReadmeTableRow[] = [];
	const unsupportedRows: ReadmeTableRow[] = [];

	for (const row of allRows) {
		if (safeGameNames.has(row.name)) {
			continue;
		}

		// Games with no upscaling support from any provider
		if (!row.hasDlss && !row.hasFsr && !row.hasXess) {
			unsupportedRows.push(row);
			continue;
		}

		// Games with a Steam app ID can be classified by anti-cheat status
		if (row.steamAppId !== null) {
			const acResult = anticheatData[row.steamAppId.toString()];
			if (acResult && !acResult.safe) {
				unsafeRows.push(row);
				continue;
			}
		}

		// Not in anti-cheat data, or no Steam app ID to check against
		notCheckedRows.push(row);
	}

	unsafeRows.sort((a, b) => a.name.localeCompare(b.name));
	notCheckedRows.sort((a, b) => a.name.localeCompare(b.name));
	unsupportedRows.sort((a, b) => a.name.localeCompare(b.name));

	const readme = compileReadmeTemplate(
		template,
		safeEntries,
		unsafeRows,
		notCheckedRows,
		unsupportedRows,
		generatedAt,
	);
	await node_fs.writeFile(outputPath, `${readme.trimEnd()}\n`, "utf-8");

	return {
		safeCount: safeEntries.length,
		unsafeCount: unsafeRows.length,
		notCheckedCount: notCheckedRows.length,
		unsupportedCount: unsupportedRows.length,
		outputPath,
	};
}

async function main(): Promise<void> {
	const result = await generateReadme();
	const plural = (n: number): string => (n === 1 ? "y" : "ies");
	console.log(
		`Generated README with ${result.safeCount} safe entr${plural(result.safeCount)}, ${result.unsafeCount} unsafe entr${plural(result.unsafeCount)}, ${result.notCheckedCount} not-checked entr${plural(result.notCheckedCount)}, and ${result.unsupportedCount} unsupported entr${plural(result.unsupportedCount)}.`,
	);
}

if (
	process.argv[1] &&
	node_path.resolve(process.argv[1]) === node_path.resolve(fileURLToPath(import.meta.url))
) {
	main().catch((error) => {
		console.error("Failed to generate README:", error);
		process.exit(1);
	});
}
