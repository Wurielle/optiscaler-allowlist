import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJson } from "../utils/json.js";
import { matchAll } from "./index.js";

// Mock the steam matcher module
vi.mock("./steam.js", () => ({
	searchSteam: vi.fn(),
	throttle: vi.fn().mockResolvedValue(undefined),
}));

import { searchSteam } from "./steam.js";

const mockSearch = vi.mocked(searchSteam);

describe("matchAll", () => {
	let tmpDir: string;
	let providersDir: string;
	let storesDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "matcher-test-"));
		providersDir = node_path.join(tmpDir, "providers");
		storesDir = node_path.join(tmpDir, "stores");
		await node_fs.mkdir(providersDir, { recursive: true });
		await node_fs.mkdir(storesDir, { recursive: true });
		mockSearch.mockReset();
	});

	afterEach(async () => {
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should collect game names from provider files and match new ones", async () => {
		await writeJson(node_path.join(providersDir, "nvidia.json"), [
			{
				gameName: "Game A",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "Game B",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);

		mockSearch
			.mockResolvedValueOnce({ appId: 100, matchedName: "Game A" })
			.mockResolvedValueOnce({ appId: null });

		const result = await matchAll({ providersDir, storesDir });

		expect(result.totalNames).toBe(2);
		expect(result.newNames).toBe(2);
		expect(result.matched).toBe(1);
		expect(result.unmatched).toBe(1);

		// Verify the output file
		const mapping = JSON.parse(
			await node_fs.readFile(node_path.join(storesDir, "steam.json"), "utf-8"),
		);
		expect(mapping["Game A"].appId).toBe(100);
		expect(mapping["Game B"].appId).toBeNull();
	});

	it("should skip names already in existing mappings", async () => {
		await writeJson(node_path.join(providersDir, "nvidia.json"), [
			{
				gameName: "Existing Game",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "New Game",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);

		// Pre-existing mapping
		await writeJson(node_path.join(storesDir, "steam.json"), {
			"Existing Game": { appId: 500 },
		});

		mockSearch.mockResolvedValueOnce({
			appId: 600,
			matchedName: "New Game",
		});

		const result = await matchAll({ providersDir, storesDir });

		expect(result.totalNames).toBe(2);
		expect(result.newNames).toBe(1);
		expect(result.matched).toBe(1);
		expect(mockSearch).toHaveBeenCalledTimes(1);
		expect(mockSearch).toHaveBeenCalledWith("New Game");
	});

	it("should collect names from multiple provider files", async () => {
		await writeJson(node_path.join(providersDir, "nvidia.json"), [
			{
				gameName: "Shared Game",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(providersDir, "amd.json"), [
			{
				gameName: "Shared Game",
				fsrRedstone: true,
				fsr3: false,
				fsr2: false,
				fsrFrameGenerationMl: false,
			},
			{
				gameName: "AMD Only",
				fsrRedstone: false,
				fsr3: true,
				fsr2: false,
				fsrFrameGenerationMl: false,
			},
		]);

		mockSearch
			.mockResolvedValueOnce({
				appId: 100,
				matchedName: "Shared Game",
			})
			.mockResolvedValueOnce({ appId: 200, matchedName: "AMD Only" });

		const result = await matchAll({ providersDir, storesDir });

		// "Shared Game" should only appear once (deduplicated via Set)
		expect(result.totalNames).toBe(2);
		expect(result.newNames).toBe(2);
	});

	it("should handle missing provider files gracefully", async () => {
		// No provider files exist
		mockSearch.mockResolvedValue({ appId: null });

		const result = await matchAll({ providersDir, storesDir });

		expect(result.totalNames).toBe(0);
		expect(result.newNames).toBe(0);
		expect(mockSearch).not.toHaveBeenCalled();
	});

	it("should respect the limit option and only process that many new names", async () => {
		await writeJson(node_path.join(providersDir, "nvidia.json"), [
			{
				gameName: "Game A",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "Game B",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "Game C",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "Game D",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				gameName: "Game E",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);

		mockSearch.mockResolvedValue({ appId: 100, matchedName: "Mock" });

		const result = await matchAll({ providersDir, storesDir, limit: 2 });

		expect(result.totalNames).toBe(5);
		expect(result.newNames).toBe(2);
		expect(result.matched).toBe(2);
		expect(result.unmatched).toBe(0);
		expect(mockSearch).toHaveBeenCalledTimes(2);
	});
});
