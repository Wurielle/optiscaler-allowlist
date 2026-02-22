import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeNvidia } from "./nvidia.js";

const originalFetch = globalThis.fetch;

function mockNvidiaResponse(data: unknown[], status = 200): void {
	globalThis.fetch = vi.fn().mockResolvedValueOnce(
		new Response(JSON.stringify({ data }), {
			status,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

function mockErrorResponse(status: number): void {
	globalThis.fetch = vi.fn().mockResolvedValue(new Response("Error", { status }));
}

describe("scrapeNvidia", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "nvidia-test-"));
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should fetch, filter, normalize, and write NVIDIA game data", async () => {
		mockNvidiaResponse([
			{
				name: "Cyberpunk 2077",
				type: "Game",
				"dlss multi frame generation": "Yes",
				"dlss frame generation": "Yes",
				"dlss super resolution": "Yes",
				"dlss ray reconstruction": "Yes",
				dlaa: "Yes",
				"ray tracing": "Full RT",
			},
			{
				name: "Unreal Engine 5",
				type: "App",
				"dlss multi frame generation": "",
				"dlss frame generation": "",
				"dlss super resolution": "Yes",
				"dlss ray reconstruction": "",
				dlaa: "",
				"ray tracing": "",
			},
		]);

		const result = await scrapeNvidia({ outputDir: tmpDir });

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "Cyberpunk 2077",
			dlssMultiFrameGeneration: "Yes",
			dlssFrameGeneration: "Yes",
			dlssSuperResolution: "Yes",
			dlssRayReconstruction: "Yes",
			dlaa: "Yes",
			rayTracing: "Full RT",
		});

		// Verify file was written
		const written = JSON.parse(
			await node_fs.readFile(node_path.join(tmpDir, "nvidia.json"), "utf-8"),
		);
		expect(written).toHaveLength(1);
		expect(written[0].name).toBe("Cyberpunk 2077");
	});

	it("should throw ScraperError on non-200 HTTP response", async () => {
		// Use 403 (non-retryable) to avoid retry delays in tests
		mockErrorResponse(403);

		await expect(scrapeNvidia({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should include statusCode and provider on ScraperError", async () => {
		mockErrorResponse(403);

		try {
			await scrapeNvidia({ outputDir: tmpDir });
			expect.fail("Expected ScraperError to be thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ScraperError);
			expect((error as ScraperError).statusCode).toBe(403);
			expect((error as ScraperError).provider).toBe("nvidia");
		}
	});

	it("should handle empty data array", async () => {
		mockNvidiaResponse([]);

		const result = await scrapeNvidia({ outputDir: tmpDir });
		expect(result).toHaveLength(0);
	});

	it("should filter out non-Game entries", async () => {
		mockNvidiaResponse([
			{
				name: "DOOM: The Dark Ages",
				type: "Game",
				"dlss multi frame generation": "NV",
				"dlss frame generation": "NV",
				"dlss super resolution": "NV",
				"dlss ray reconstruction": "",
				dlaa: "",
				"ray tracing": "",
			},
			{
				name: "Unity",
				type: "Engine",
				"dlss multi frame generation": "",
				"dlss frame generation": "",
				"dlss super resolution": "Yes",
				"dlss ray reconstruction": "",
				dlaa: "",
				"ray tracing": "",
			},
			{
				name: "OBS Studio",
				type: "App",
				"dlss multi frame generation": "",
				"dlss frame generation": "",
				"dlss super resolution": "",
				"dlss ray reconstruction": "",
				dlaa: "",
				"ray tracing": "",
			},
		]);

		const result = await scrapeNvidia({ outputDir: tmpDir });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("DOOM: The Dark Ages");
	});

	it("should map NV feature values correctly", async () => {
		mockNvidiaResponse([
			{
				name: "Test Game",
				type: "Game",
				"dlss multi frame generation": "NV, U",
				"dlss frame generation": "NV, T",
				"dlss super resolution": "NV",
				"dlss ray reconstruction": "",
				dlaa: "Yes",
				"ray tracing": "",
			},
		]);

		const result = await scrapeNvidia({ outputDir: tmpDir });
		expect(result[0]).toEqual({
			name: "Test Game",
			dlssMultiFrameGeneration: "NV, U",
			dlssFrameGeneration: "NV, T",
			dlssSuperResolution: "NV",
			dlssRayReconstruction: "",
			dlaa: "Yes",
			rayTracing: "",
		});
	});

	it("should trim whitespace from game names", async () => {
		mockNvidiaResponse([
			{
				name: "  Padded Name  ",
				type: "Game",
				"dlss multi frame generation": "",
				"dlss frame generation": "",
				"dlss super resolution": "Yes",
				"dlss ray reconstruction": "",
				dlaa: "",
				"ray tracing": "",
			},
		]);

		const result = await scrapeNvidia({ outputDir: tmpDir });
		expect(result[0].name).toBe("Padded Name");
	});
});
