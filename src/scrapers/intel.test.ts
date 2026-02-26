import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeIntel } from "./intel.js";

const originalFetch = globalThis.fetch;

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
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should fetch HTML, parse deterministic sections, merge games, and write Intel data", async () => {
		const html = `
			<html>
				<body>
					<h1>XeSS Enabled Games</h1>
					<h3>XeSS 2 enabled games</h3>
					<div class="elementor-loop-container">
						<h1>Game A</h1>
						<h1>Game B</h1>
						<h1>Game B</h1>
					</div>
					<h3>XeSS Enabled Games</h3>
					<div class="elementor-loop-container">
						<h1>Game B</h1>
						<h1>Game C &amp; Co</h1>
					</div>
				</body>
			</html>
		`;

		mockHtmlResponse(html);

		const result = await scrapeIntel({ outputDir: tmpDir });

		expect(result.find((g) => g.name === "Game A")).toEqual({
			name: "Game A",
			xess2: true,
			xess: false,
		});

		expect(result.find((g) => g.name === "Game B")).toEqual({
			name: "Game B",
			xess2: true,
			xess: true,
		});

		expect(result.find((g) => g.name === "Game C & Co")).toEqual({
			name: "Game C & Co",
			xess2: false,
			xess: true,
		});

		expect(result).toHaveLength(3);

		const written = JSON.parse(
			await node_fs.readFile(node_path.join(tmpDir, "intel.json"), "utf-8"),
		);
		expect(written).toHaveLength(3);
	});

	it("should strip HTML boilerplate before parsing", async () => {
		const html =
			"<html><head><script>ignored()</script></head>" +
			"<nav>ignore nav</nav>" +
			"<body><h3>XeSS 2 enabled games</h3><h1>New Game</h1>" +
			"<h3>XeSS Enabled Games</h3><h1>Legacy Game</h1></body>" +
			"<footer>ignore footer</footer></html>";

		mockHtmlResponse(html);

		const result = await scrapeIntel({ outputDir: tmpDir });
		expect(result.some((g) => g.name === "New Game")).toBe(true);
		expect(result.some((g) => g.name === "Legacy Game")).toBe(true);
	});

	it("should throw ScraperError on non-200 HTTP response", async () => {
		mockErrorResponse(403);

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should throw ScraperError when XeSS 2 heading is missing", async () => {
		mockHtmlResponse("<html><body><h3>XeSS Enabled Games</h3><h1>Game A</h1></body></html>");

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(
			"Intel page layout changed: missing XeSS 2 enabled games heading",
		);
	});

	it("should throw ScraperError when XeSS section heading is missing", async () => {
		mockHtmlResponse("<html><body><h3>XeSS 2 enabled games</h3><h1>Game A</h1></body></html>");

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(
			"Intel page layout changed: missing XeSS enabled games heading",
		);
	});

	it("should throw ScraperError when parsed game count drops too much versus previous data", async () => {
		const previous = Array.from({ length: 8 }, (_value, index) => ({
			name: `Old Intel Game ${index}`,
			xess2: true,
			xess: true,
		}));

		await node_fs.writeFile(
			node_path.join(tmpDir, "intel.json"),
			`${JSON.stringify(previous, null, 2)}\n`,
		);

		mockHtmlResponse(
			"<html><body>" +
				"<h3>XeSS 2 enabled games</h3><h1>Game A</h1>" +
				"<h3>XeSS Enabled Games</h3><h1>Game B</h1>" +
				"</body></html>",
		);

		await expect(scrapeIntel({ outputDir: tmpDir })).rejects.toThrow(
			"Intel extraction suspicious: 2 games vs 8 previously (>25% drop)",
		);
	});
});
