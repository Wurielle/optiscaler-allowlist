import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeAmd } from "./amd.js";

// Mock the AI module
vi.mock("../utils/ai.js", () => ({
	extractStructuredData: vi.fn(),
}));

import { extractStructuredData } from "../utils/ai.js";

const originalFetch = globalThis.fetch;
const mockExtract = vi.mocked(extractStructuredData);

function mockHtmlResponse(html: string, status = 200): void {
	globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(html, { status }));
}

function mockErrorResponse(status: number): void {
	globalThis.fetch = vi.fn().mockResolvedValue(new Response("Error", { status }));
}

describe("scrapeAmd", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "amd-test-"));
		mockExtract.mockReset();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should fetch HTML, extract via AI, merge sections, and write AMD game data", async () => {
		mockHtmlResponse("<html><body>AMD games page</body></html>");
		mockExtract.mockResolvedValueOnce({
			fsrRedstone: ["Game A", "Game B"],
			fsr3: ["Game A", "Game C"],
			fsr2: ["Game C", "Game D"],
			fsrFrameGenerationMl: ["Game A"],
		});

		const result = await scrapeAmd({ outputDir: tmpDir });

		// Game A appears in Redstone, FSR3, and FG ML
		const gameA = result.find((g) => g.name === "Game A");
		expect(gameA).toEqual({
			name: "Game A",
			fsrRedstone: true,
			fsr3: true,
			fsr2: false,
			fsrFrameGenerationMl: true,
		});

		// Game B only in Redstone
		const gameB = result.find((g) => g.name === "Game B");
		expect(gameB).toEqual({
			name: "Game B",
			fsrRedstone: true,
			fsr3: false,
			fsr2: false,
			fsrFrameGenerationMl: false,
		});

		// Game C in FSR3 and FSR2
		const gameC = result.find((g) => g.name === "Game C");
		expect(gameC).toEqual({
			name: "Game C",
			fsrRedstone: false,
			fsr3: true,
			fsr2: true,
			fsrFrameGenerationMl: false,
		});

		expect(result).toHaveLength(4);

		// Verify file was written
		const written = JSON.parse(await node_fs.readFile(node_path.join(tmpDir, "amd.json"), "utf-8"));
		expect(written).toHaveLength(4);
	});

	it("should throw ScraperError on non-200 HTTP response", async () => {
		mockErrorResponse(403);

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should throw ScraperError when AI returns empty results", async () => {
		mockHtmlResponse("<html><body>empty page</body></html>");
		mockExtract.mockResolvedValueOnce({
			fsrRedstone: [],
			fsr3: [],
			fsr2: [],
			fsrFrameGenerationMl: [],
		});

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should strip HTML boilerplate before sending to AI", async () => {
		const html =
			"<html><head><script>evil()</script></head>" +
			"<nav>menu</nav>" +
			"<header>header</header>" +
			"<body><main>game content</main></body>" +
			"<footer>footer</footer></html>";

		mockHtmlResponse(html);
		mockExtract.mockResolvedValueOnce({
			fsrRedstone: ["Test Game"],
			fsr3: [],
			fsr2: [],
			fsrFrameGenerationMl: [],
		});

		await scrapeAmd({ outputDir: tmpDir });

		// Verify the AI received stripped HTML (no script/nav/footer/header)
		const calledHtml = mockExtract.mock.calls[0][0];
		expect(calledHtml).not.toContain("<script");
		expect(calledHtml).not.toContain("<nav");
		expect(calledHtml).not.toContain("<footer");
		expect(calledHtml).not.toContain("<header");
		expect(calledHtml).toContain("game content");
	});

	it("should handle games appearing in multiple sections", async () => {
		mockHtmlResponse("<html>content</html>");
		mockExtract.mockResolvedValueOnce({
			fsrRedstone: ["Multi-Section Game"],
			fsr3: ["Multi-Section Game"],
			fsr2: ["Multi-Section Game"],
			fsrFrameGenerationMl: ["Multi-Section Game"],
		});

		const result = await scrapeAmd({ outputDir: tmpDir });
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "Multi-Section Game",
			fsrRedstone: true,
			fsr3: true,
			fsr2: true,
			fsrFrameGenerationMl: true,
		});
	});
});
