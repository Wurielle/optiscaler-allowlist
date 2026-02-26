import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AllowlistEntry } from "../types/allowlist.js";
import { writeJson } from "../utils/json.js";
import { generateAllowlist } from "./allowlist.js";

describe("generateAllowlist", () => {
	let dataDir: string;

	beforeEach(async () => {
		dataDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "allowlist-test-"));
		await node_fs.mkdir(node_path.join(dataDir, "providers"), { recursive: true });
		await node_fs.mkdir(node_path.join(dataDir, "stores"), { recursive: true });
		await node_fs.mkdir(node_path.join(dataDir, "anticheat"), { recursive: true });
	});

	afterEach(async () => {
		await node_fs.rm(dataDir, { recursive: true, force: true });
	});

	async function readAllowlistEntry(appId: number): Promise<AllowlistEntry> {
		const filePath = node_path.join(dataDir, "allowlist", "steam", `${appId}.json`);
		return JSON.parse(await node_fs.readFile(filePath, "utf-8")) as AllowlistEntry;
	}

	async function readAllowlistFileNames(): Promise<string[]> {
		const dirPath = node_path.join(dataDir, "allowlist", "steam");
		const names = await node_fs.readdir(dirPath);
		return names.sort();
	}

	it("should include games with appId and safe anti-cheat", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Safe Game",
				dlssMultiFrameGeneration: "Yes",
				dlssFrameGeneration: "Yes",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"Safe Game": { appId: 100 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"100": {
				safe: true,
				source: "areweanticheatyet.com",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		const result = await generateAllowlist({ dataDir });
		expect(result.totalEntries).toBe(1);

		const entry = await readAllowlistEntry(100);
		expect(entry.name).toBe("Safe Game");
		expect(entry.stores.steam.appId).toBe(100);
		expect(entry.providers.nvidia?.dlssSuperResolution).toBe("Yes");
	});

	it("should exclude games with safe=false", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Unsafe Game",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"Unsafe Game": { appId: 200 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"200": {
				safe: false,
				source: "ai",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		const result = await generateAllowlist({ dataDir });
		expect(result.totalEntries).toBe(0);
		expect(await readAllowlistFileNames()).toEqual([]);
	});

	it("should merge provider features from multiple providers", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Multi Provider",
				dlssMultiFrameGeneration: "Yes",
				dlssFrameGeneration: "Yes",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "providers/amd.json"), [
			{
				name: "Multi Provider",
				fsrRedstone: true,
				fsr3: true,
				fsr2: false,
				fsrFrameGenerationMl: true,
			},
		]);
		await writeJson(node_path.join(dataDir, "providers/intel.json"), [
			{ name: "Multi Provider", xess2: true, xess: true },
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"Multi Provider": { appId: 400 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"400": {
				safe: true,
				source: "areweanticheatyet.com",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		const result = await generateAllowlist({ dataDir });
		expect(result.totalEntries).toBe(1);

		const entry = await readAllowlistEntry(400);
		expect(entry.providers.nvidia).toBeDefined();
		expect(entry.providers.amd).toBeDefined();
		expect(entry.providers.intel).toBeDefined();
	});

	it("should write one file per appId", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "First",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				name: "Second",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			First: { appId: 2 },
			Second: { appId: 1 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"1": { safe: true, source: "test", checkedAt: "2025-01-01T00:00:00.000Z" },
			"2": { safe: true, source: "test", checkedAt: "2025-01-01T00:00:00.000Z" },
		});

		await generateAllowlist({ dataDir });
		expect(await readAllowlistFileNames()).toEqual(["1.json", "2.json"]);
	});

	it("should remove stale app files on rerun", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Stable Game",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"Stable Game": { appId: 500 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"500": { safe: true, source: "test", checkedAt: "2025-01-01T00:00:00.000Z" },
		});

		await generateAllowlist({ dataDir });
		expect(await readAllowlistFileNames()).toEqual(["500.json"]);

		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"500": { safe: false, source: "test", checkedAt: "2025-01-01T00:00:00.000Z" },
		});

		const rerunResult = await generateAllowlist({ dataDir });
		expect(rerunResult.totalEntries).toBe(0);
		expect(await readAllowlistFileNames()).toEqual([]);
	});

	it("should remove legacy allowlist.json on generation", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Legacy Migration",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"Legacy Migration": { appId: 777 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"777": { safe: true, source: "test", checkedAt: "2025-01-01T00:00:00.000Z" },
		});
		await writeJson(node_path.join(dataDir, "allowlist.json"), [{ name: "old" }]);

		await generateAllowlist({ dataDir });

		await expect(node_fs.access(node_path.join(dataDir, "allowlist.json"))).rejects.toThrow();
		expect(await readAllowlistFileNames()).toEqual(["777.json"]);
	});
});
