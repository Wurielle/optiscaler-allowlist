import { afterEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeAll } from "./index.js";

// Mock individual scrapers
vi.mock("./nvidia.js", () => ({
	scrapeNvidia: vi.fn(),
}));
vi.mock("./amd.js", () => ({
	scrapeAmd: vi.fn(),
}));
vi.mock("./intel.js", () => ({
	scrapeIntel: vi.fn(),
}));

import { scrapeAmd } from "./amd.js";
import { scrapeIntel } from "./intel.js";
import { scrapeNvidia } from "./nvidia.js";

const mockNvidia = vi.mocked(scrapeNvidia);
const mockAmd = vi.mocked(scrapeAmd);
const mockIntel = vi.mocked(scrapeIntel);

describe("scrapeAll", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("should return success results for all scrapers", async () => {
		mockNvidia.mockResolvedValueOnce([
			{
				gameName: "Game 1",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		mockAmd.mockResolvedValueOnce([
			{
				gameName: "Game 2",
				fsrRedstone: true,
				fsr3: false,
				fsr2: false,
				fsrFrameGenerationMl: false,
			},
		]);
		mockIntel.mockResolvedValueOnce([{ gameName: "Game 3", xess2: true, xess: false }]);

		const results = await scrapeAll();

		expect(results).toHaveLength(3);
		expect(results[0]).toEqual({
			provider: "nvidia",
			success: true,
			gameCount: 1,
		});
		expect(results[1]).toEqual({
			provider: "amd",
			success: true,
			gameCount: 1,
		});
		expect(results[2]).toEqual({
			provider: "intel",
			success: true,
			gameCount: 1,
		});
	});

	it("should isolate partial failures — one scraper failing does not block others", async () => {
		mockNvidia.mockResolvedValueOnce([
			{
				gameName: "Game 1",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
		]);
		mockAmd.mockRejectedValueOnce(new ScraperError("AMD page failed", "amd", 503));
		mockIntel.mockResolvedValueOnce([{ gameName: "Game 3", xess2: false, xess: true }]);

		const results = await scrapeAll();

		expect(results).toHaveLength(3);
		expect(results[0].success).toBe(true);
		expect(results[1].success).toBe(false);
		expect(results[1].error).toContain("AMD page failed");
		expect(results[2].success).toBe(true);
	});

	it("should handle all scrapers failing", async () => {
		mockNvidia.mockRejectedValueOnce(new Error("network error"));
		mockAmd.mockRejectedValueOnce(new ScraperError("fail", "amd"));
		mockIntel.mockRejectedValueOnce(new ScraperError("fail", "intel"));

		const results = await scrapeAll();

		expect(results).toHaveLength(3);
		expect(results.every((r) => !r.success)).toBe(true);
		expect(results.every((r) => r.gameCount === 0)).toBe(true);
	});

	it("should pass outputDir to all scrapers", async () => {
		mockNvidia.mockResolvedValueOnce([]);
		mockAmd.mockResolvedValueOnce([]);
		mockIntel.mockResolvedValueOnce([]);

		await scrapeAll({ outputDir: "/tmp/test-output" });

		expect(mockNvidia).toHaveBeenCalledWith({
			outputDir: "/tmp/test-output",
		});
		expect(mockAmd).toHaveBeenCalledWith({ outputDir: "/tmp/test-output" });
		expect(mockIntel).toHaveBeenCalledWith({
			outputDir: "/tmp/test-output",
		});
	});
});
