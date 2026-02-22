import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJson } from "../utils/json.js";
import { checkAll } from "./index.js";

// Mock the anticheat checker module
vi.mock("./anticheat.js", () => ({
	checkAntiCheat: vi.fn(),
	resetCache: vi.fn(),
}));

import { checkAntiCheat } from "./anticheat.js";

const mockCheck = vi.mocked(checkAntiCheat);

describe("checkAll", () => {
	let tmpDir: string;
	let storesDir: string;
	let anticheatDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "checker-test-"));
		storesDir = node_path.join(tmpDir, "stores");
		anticheatDir = node_path.join(tmpDir, "anticheat");
		await node_fs.mkdir(storesDir, { recursive: true });
		await node_fs.mkdir(anticheatDir, { recursive: true });
		mockCheck.mockReset();
	});

	afterEach(async () => {
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should check new app IDs and write results", async () => {
		await writeJson(node_path.join(storesDir, "steam.json"), {
			"Game A": { appId: 100 },
			"Game B": { appId: 200 },
			"Game C": { appId: null },
		});

		mockCheck
			.mockResolvedValueOnce({
				safe: true,
				source: "areweanticheatyet.com",
				checkedAt: "2025-01-01T00:00:00.000Z",
			})
			.mockResolvedValueOnce({
				safe: false,
				source: "ai",
				checkedAt: "2025-01-01T00:00:00.000Z",
			});

		const result = await checkAll({ storesDir, anticheatDir });

		expect(result.totalAppIds).toBe(2); // excludes null appId
		expect(result.newAppIds).toBe(2);
		expect(result.safe).toBe(1);
		expect(result.unsafe).toBe(1);
		expect(result.skipped).toBe(0);

		const written = JSON.parse(
			await node_fs.readFile(node_path.join(anticheatDir, "steam.json"), "utf-8"),
		);
		expect(written["100"].safe).toBe(true);
		expect(written["200"].safe).toBe(false);
	});

	it("should skip already-checked app IDs", async () => {
		await writeJson(node_path.join(storesDir, "steam.json"), {
			"Existing Game": { appId: 100 },
			"New Game": { appId: 200 },
		});

		await writeJson(node_path.join(anticheatDir, "steam.json"), {
			"100": {
				safe: true,
				source: "areweanticheatyet.com",
				checkedAt: "2025-01-01T00:00:00.000Z",
			},
		});

		mockCheck.mockResolvedValueOnce({
			safe: true,
			source: "ai",
			checkedAt: "2025-01-01T00:00:00.000Z",
		});

		const result = await checkAll({ storesDir, anticheatDir });

		expect(result.totalAppIds).toBe(2);
		expect(result.newAppIds).toBe(1);
		expect(mockCheck).toHaveBeenCalledTimes(1);
		expect(mockCheck).toHaveBeenCalledWith("200", "New Game");
	});

	it("should skip and count when checkAntiCheat returns null", async () => {
		await writeJson(node_path.join(storesDir, "steam.json"), {
			"Unknown Game": { appId: 300 },
		});

		mockCheck.mockResolvedValueOnce(null);

		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await checkAll({ storesDir, anticheatDir });

		expect(result.skipped).toBe(1);
		expect(result.safe).toBe(0);
		expect(result.unsafe).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown Game"));

		consoleSpy.mockRestore();
	});

	it("should handle missing store file gracefully", async () => {
		const result = await checkAll({ storesDir, anticheatDir });

		expect(result.totalAppIds).toBe(0);
		expect(result.newAppIds).toBe(0);
		expect(mockCheck).not.toHaveBeenCalled();
	});

	it("should respect the limit option and only process that many new app IDs", async () => {
		await writeJson(node_path.join(storesDir, "steam.json"), {
			"Game A": { appId: 100 },
			"Game B": { appId: 200 },
			"Game C": { appId: 300 },
			"Game D": { appId: 400 },
			"Game E": { appId: 500 },
		});

		mockCheck.mockResolvedValue({
			safe: true,
			source: "areweanticheatyet.com",
			checkedAt: "2025-01-01T00:00:00.000Z",
		});

		const result = await checkAll({ storesDir, anticheatDir, limit: 2 });

		expect(result.totalAppIds).toBe(5);
		expect(result.newAppIds).toBe(2);
		expect(result.safe).toBe(2);
		expect(result.unsafe).toBe(0);
		expect(result.skipped).toBe(0);
		expect(mockCheck).toHaveBeenCalledTimes(2);
	});
});
