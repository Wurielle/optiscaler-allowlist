import node_path from "node:path";
import { ScraperError } from "../types/errors.js";
import type { NvidiaGame } from "../types/providers.js";
import { nvidiaGameArraySchema } from "../types/providers.js";
import { fetchWithRetry } from "../utils/http.js";
import { writeJson } from "../utils/json.js";

const NVIDIA_API_URL =
	"https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/nvidia-rtx-games-engines-apps/dlss-rt-games-apps-overrides.json";

const DEFAULT_OUTPUT_DIR = node_path.resolve("data/providers");

/** Raw entry shape from the NVIDIA JSON API (name can be string or number) */
interface NvidiaRawEntry {
	name: string | number;
	type: string;
	"dlss multi frame generation": string;
	"dlss frame generation": string;
	"dlss super resolution": string;
	"dlss ray reconstruction": string;
	dlaa: string;
	"ray tracing": string;
}

/** Map a raw NVIDIA API entry to our normalized NvidiaGame shape */
function mapRawEntry(raw: NvidiaRawEntry): NvidiaGame {
	return {
		gameName: String(raw.name).trim(),
		dlssMultiFrameGeneration: raw["dlss multi frame generation"] ?? "",
		dlssFrameGeneration: raw["dlss frame generation"] ?? "",
		dlssSuperResolution: raw["dlss super resolution"] ?? "",
		dlssRayReconstruction: raw["dlss ray reconstruction"] ?? "",
		dlaa: raw.dlaa ?? "",
		rayTracing: raw["ray tracing"] ?? "",
	};
}

interface ScrapeNvidiaOptions {
	/** Override the output directory (defaults to data/providers) */
	outputDir?: string;
}

/** Fetch NVIDIA game data, filter to games only, normalize, validate, and write to disk */
export async function scrapeNvidia(options?: ScrapeNvidiaOptions): Promise<NvidiaGame[]> {
	const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
	const response = await fetchWithRetry(NVIDIA_API_URL);

	if (!response.ok) {
		throw new ScraperError(
			`NVIDIA API returned HTTP ${response.status}`,
			"nvidia",
			response.status,
		);
	}

	const json = (await response.json()) as { data: NvidiaRawEntry[] };
	const rawEntries = json.data;

	if (!Array.isArray(rawEntries)) {
		throw new ScraperError("NVIDIA API response missing data array", "nvidia");
	}

	// Filter to Game entries only (exclude App, Engine, etc.)
	const gameEntries = rawEntries.filter((entry) => entry.type === "Game");

	// Map raw field names to camelCase
	const games = gameEntries.map(mapRawEntry);

	// Validate against Zod schema
	const validated = nvidiaGameArraySchema.parse(games);

	// Write to data/providers/nvidia.json
	const outputPath = node_path.join(outputDir, "nvidia.json");
	await writeJson(outputPath, validated);

	return validated;
}
