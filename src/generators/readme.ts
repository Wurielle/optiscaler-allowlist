import node_fs from "node:fs/promises";
import node_path from "node:path";
import { fileURLToPath } from "node:url";
import type { AllowlistEntry } from "../types/allowlist.js";
import { allowlistEntrySchema } from "../types/allowlist.js";

const DEFAULT_ALLOWLIST_DIR = node_path.resolve("data", "allowlist", "steam");
const DEFAULT_TEMPLATE_PATH = node_path.resolve("README.template.md");
const DEFAULT_OUTPUT_PATH = node_path.resolve("README.md");

export interface GenerateReadmeOptions {
	allowlistDir?: string;
	templatePath?: string;
	outputPath?: string;
	generatedAt?: Date;
}

export interface GenerateReadmeResult {
	entryCount: number;
	outputPath: string;
}

function checkbox(value: boolean): string {
	return value ? "[x]" : "[ ]";
}

function hasNvidiaFeature(value: string | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function escapeCell(value: string): string {
	return value.replaceAll("|", "\\|");
}

function formatStore(entry: AllowlistEntry): string {
	const appId = entry.stores.steam.appId;
	return `[Steam](https://store.steampowered.com/app/${appId}/)`;
}

export function renderAllowlistTable(entries: AllowlistEntry[]): string {
	if (entries.length === 0) {
		return "No allowlist entries found.";
	}

	const header = "| Game | Store | DLSS | FSR | XeSS |";
	const separator = "| --- | --- | --- | --- | --- |";

	const rows = entries
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((entry) => {
			const nvidia = entry.providers.nvidia;
			const amd = entry.providers.amd;
			const intel = entry.providers.intel;
			const hasDlss =
				hasNvidiaFeature(nvidia?.dlssMultiFrameGeneration) ||
				hasNvidiaFeature(nvidia?.dlssFrameGeneration) ||
				hasNvidiaFeature(nvidia?.dlssSuperResolution) ||
				hasNvidiaFeature(nvidia?.dlssRayReconstruction) ||
				hasNvidiaFeature(nvidia?.dlaa);
			const hasFsr =
				Boolean(amd?.fsrRedstone) ||
				Boolean(amd?.fsr3) ||
				Boolean(amd?.fsr2) ||
				Boolean(amd?.fsrFrameGenerationMl);
			const hasXess = Boolean(intel?.xess2) || Boolean(intel?.xess);

			return [
				escapeCell(entry.name),
				formatStore(entry),
				checkbox(hasDlss),
				checkbox(hasFsr),
				checkbox(hasXess),
			];
		})
		.map((cells) => `| ${cells.join(" | ")} |`);

	return [header, separator, ...rows].join("\n");
}

export function compileReadmeTemplate(
	template: string,
	entries: AllowlistEntry[],
	generatedAt: Date,
): string {
	return template
		.replaceAll("{{ALLOWLIST_TABLE}}", renderAllowlistTable(entries))
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
	const templatePath = options?.templatePath ?? DEFAULT_TEMPLATE_PATH;
	const outputPath = options?.outputPath ?? DEFAULT_OUTPUT_PATH;
	const generatedAt = options?.generatedAt ?? new Date();

	const [template, entries] = await Promise.all([
		node_fs.readFile(templatePath, "utf-8"),
		loadAllowlistEntries(allowlistDir),
	]);

	const readme = compileReadmeTemplate(template, entries, generatedAt);
	await node_fs.writeFile(outputPath, `${readme.trimEnd()}\n`, "utf-8");

	return { entryCount: entries.length, outputPath };
}

async function main(): Promise<void> {
	const result = await generateReadme();
	console.log(
		`Generated README with ${result.entryCount} allowlist entr${result.entryCount === 1 ? "y" : "ies"}.`,
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
