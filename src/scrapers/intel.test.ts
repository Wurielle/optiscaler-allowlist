import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeIntel } from "./intel.js";

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

describe("scrapeIntel", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "intel-test-"));
		mockExtract.mockReset();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should fetch HTML, extract via AI, merge sections, and write Intel game data", async () => {
		mockHtmlResponse("<html><body>Intel XeSS games page</body></html>");
		mockExtract.mockResolvedValueOnce({
			xess2: ["Game A", "Game B"],
			xess: ["Game B", "Game C"],
		});

		const result = await scrapeIntel({ outputDir: tmpDir });

		// Game A only in XeSS 2
		const gameA = result.find((g) => g.name === "Game A");
		expect(gameA).toEqual({
			name: "Game A",
			xess2: true,
			xess: false,
		});

		// Game B in both
		const gameB = result.find((g) => g.name === "Game B");
		expect(gameB).toEqual({
			name: "Game B",
			xess2: true,
			xess: true,
		});

		// Game C only in XeSS
		const gameC = result.find((g) => g.name === "Game C");
		expect(gameC).toEqual({
			name: "Game C",
			xess2: false,
			xess: true,
		});

		expect(result).toHaveLength(3);

		// Verify file was written
		const written = JSON.parse(
			await node_fs.readFile(node_path.join(tmpDir, "intel.json"), "utf-8"),
		);
		expect(written).toHaveLength(3);
	});

	it("should throw ScraperError on non-200 HTTP response", async () => {
		mockErrorResponse(403);

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should throw ScraperError when AI returns empty results", async () => {
		mockHtmlResponse("<html><body>empty page</body></html>");
		mockExtract.mockResolvedValueOnce({
			xess2: [],
			xess: [],
		});

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should strip HTML boilerplate before sending to AI", async () => {
		const html =
			"<html><head><script>evil()</script></head>" +
			"<nav>menu</nav>" +
			"<body><main>xess content</main></body>" +
			"<footer>footer</footer></html>";

		mockHtmlResponse(html);
		mockExtract.mockResolvedValueOnce({
			xess2: ["Test Game"],
			xess: [],
		});

		await scrapeIntel({ outputDir: tmpDir });

		const calledHtml = mockExtract.mock.calls[0][0];
		expect(calledHtml).not.toContain("<script");
		expect(calledHtml).not.toContain("<nav");
		expect(calledHtml).not.toContain("<footer");
		expect(calledHtml).toContain("xess content");
	});

	it("should handle game in both XeSS versions", async () => {
		mockHtmlResponse("<html>content</html>");
		mockExtract.mockResolvedValueOnce({
			xess2: ["Dual Game"],
			xess: ["Dual Game"],
		});

		const result = await scrapeIntel({ outputDir: tmpDir });
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "Dual Game",
			xess2: true,
			xess: true,
		});
	});

	it("should handle only XeSS 1 games", async () => {
		mockHtmlResponse("<html>content</html>");
		mockExtract.mockResolvedValueOnce({
			xess2: [],
			xess: ["Legacy Game"],
		});

		const result = await scrapeIntel({ outputDir: tmpDir });
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			name: "Legacy Game",
			xess2: false,
			xess: true,
		});
	});
});
