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
		await node_fs.mkdir(node_path.join(dataDir, "providers"), {
			recursive: true,
		});
		await node_fs.mkdir(node_path.join(dataDir, "stores"), {
			recursive: true,
		});
		await node_fs.mkdir(node_path.join(dataDir, "anticheat"), {
			recursive: true,
		});
	});

	afterEach(async () => {
		await node_fs.rm(dataDir, { recursive: true, force: true });
	});

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

		const allowlist = JSON.parse(
			await node_fs.readFile(node_path.join(dataDir, "allowlist.json"), "utf-8"),
		) as AllowlistEntry[];
		expect(allowlist[0].name).toBe("Safe Game");
		expect(allowlist[0].stores.steam.appId).toBe(100);
		expect(allowlist[0].providers.nvidia?.dlssSuperResolution).toBe("Yes");
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
	});

	it("should exclude games with null appId", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "No Match",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			"No Match": { appId: null },
		});

		const result = await generateAllowlist({ dataDir });
		expect(result.totalEntries).toBe(0);
	});

	it("should exclude games with no anti-cheat check yet", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Unchecked",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			Unchecked: { appId: 300 },
		});
		// No anticheat data file at all

		const result = await generateAllowlist({ dataDir });
		expect(result.totalEntries).toBe(0);
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

		const allowlist = JSON.parse(
			await node_fs.readFile(node_path.join(dataDir, "allowlist.json"), "utf-8"),
		) as AllowlistEntry[];
		expect(allowlist[0].providers.nvidia).toBeDefined();
		expect(allowlist[0].providers.amd).toBeDefined();
		expect(allowlist[0].providers.intel).toBeDefined();
	});

	it("should sort entries alphabetically by game name", async () => {
		await writeJson(node_path.join(dataDir, "providers/nvidia.json"), [
			{
				name: "Zelda",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				name: "Ark",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			{
				name: "DOOM",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		await writeJson(node_path.join(dataDir, "stores/steam.json"), {
			Zelda: { appId: 1 },
			Ark: { appId: 2 },
			DOOM: { appId: 3 },
		});
		await writeJson(node_path.join(dataDir, "anticheat/steam.json"), {
			"1": {
				safe: true,
				source: "test",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
			"2": {
				safe: true,
				source: "test",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
			"3": {
				safe: true,
				source: "test",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		await generateAllowlist({ dataDir });

		const allowlist = JSON.parse(
			await node_fs.readFile(node_path.join(dataDir, "allowlist.json"), "utf-8"),
		) as AllowlistEntry[];
		expect(allowlist.map((e) => e.name)).toEqual(["Ark", "DOOM", "Zelda"]);
	});

	it("should produce identical output on repeated runs (idempotent)", async () => {
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
			"500": {
				safe: true,
				source: "test",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		await generateAllowlist({ dataDir });
		const first = await node_fs.readFile(node_path.join(dataDir, "allowlist.json"), "utf-8");

		await generateAllowlist({ dataDir });
		const second = await node_fs.readFile(node_path.join(dataDir, "allowlist.json"), "utf-8");

		expect(first).toBe(second);
	});
});
