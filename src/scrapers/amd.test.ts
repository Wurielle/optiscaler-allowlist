import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScraperError } from "../types/errors.js";
import { scrapeAmd } from "./amd.js";

const originalFetch = globalThis.fetch;

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
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should fetch HTML, parse deterministic sections, merge games, and write AMD data", async () => {
		const html = `
			<html>
				<body>
					<h5>AMD FSR Redstone</h5>
					<table>
						<tr><td>Game A</td><td>Game B</td></tr>
					</table>
					<h5>FSR 3</h5>
					<table>
						<tr><td>Game A</td><td>Game C</td></tr>
					</table>
					<h5>FSR 2</h5>
					<table>
						<tr><td>Game C</td><td>Game D &amp; Friends</td></tr>
					</table>
					<h5>AMD FSR Frame Generation (ML) Support</h5>
					<table>
						<tr><td>Game A</td></tr>
					</table>
				</body>
			</html>
		`;

		mockHtmlResponse(html);

		const result = await scrapeAmd({ outputDir: tmpDir });

		expect(result.find((g) => g.name === "Game A")).toEqual({
			name: "Game A",
			fsrRedstone: true,
			fsr3: true,
			fsr2: false,
			fsrFrameGenerationMl: true,
		});

		expect(result.find((g) => g.name === "Game B")).toEqual({
			name: "Game B",
			fsrRedstone: true,
			fsr3: false,
			fsr2: false,
			fsrFrameGenerationMl: false,
		});

		expect(result.find((g) => g.name === "Game C")).toEqual({
			name: "Game C",
			fsrRedstone: false,
			fsr3: true,
			fsr2: true,
			fsrFrameGenerationMl: false,
		});

		expect(result.find((g) => g.name === "Game D & Friends")).toEqual({
			name: "Game D & Friends",
			fsrRedstone: false,
			fsr3: false,
			fsr2: true,
			fsrFrameGenerationMl: false,
		});

		expect(result).toHaveLength(4);

		const written = JSON.parse(await node_fs.readFile(node_path.join(tmpDir, "amd.json"), "utf-8"));
		expect(written).toHaveLength(4);
	});

	it("should strip HTML boilerplate before parsing", async () => {
		const html =
			"<html><head><script>ignored()</script></head>" +
			"<nav>ignore nav</nav>" +
			"<header>ignore header</header>" +
			"<body><h5>AMD FSR Redstone</h5><table><tr><td>Real Game</td></tr></table>" +
			"<h5>FSR 3</h5><table><tr><td>Real Game</td></tr></table>" +
			"<h5>FSR 2</h5><table><tr><td>Legacy Game</td></tr></table>" +
			"<h5>AMD FSR Frame Generation (ML) Support</h5><table><tr><td>FG Game</td></tr></table></body>" +
			"<footer>ignore footer</footer></html>";

		mockHtmlResponse(html);

		const result = await scrapeAmd({ outputDir: tmpDir });
		expect(result.some((g) => g.name === "Real Game")).toBe(true);
	});

	it("should throw ScraperError on non-200 HTTP response", async () => {
		mockErrorResponse(403);

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(ScraperError);
	});

	it("should throw ScraperError when expected heading is missing", async () => {
		mockHtmlResponse(
			"<html><body><h5>AMD FSR Redstone</h5><table><tr><td>Game A</td></tr></table></body></html>",
		);

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(
			"AMD page layout changed: missing fsr3 heading",
		);
	});

	it("should throw ScraperError when section table is missing", async () => {
		mockHtmlResponse(
			"<html><body>" +
				"<h5>AMD FSR Redstone</h5><table><tr><td>Game A</td></tr></table>" +
				"<h5>FSR 3</h5><div>No table here</div>" +
				"<h5>FSR 2</h5><table><tr><td>Game B</td></tr></table>" +
				"<h5>AMD FSR Frame Generation (ML) Support</h5><table><tr><td>Game C</td></tr></table>" +
				"</body></html>",
		);

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(
			"AMD page layout changed: missing table for fsr3",
		);
	});

	it("should throw ScraperError when parsed game count drops too much versus previous data", async () => {
		const previous = Array.from({ length: 8 }, (_value, index) => ({
			name: `Old Game ${index}`,
			fsrRedstone: true,
			fsr3: true,
			fsr2: false,
			fsrFrameGenerationMl: false,
		}));

		await node_fs.writeFile(
			node_path.join(tmpDir, "amd.json"),
			`${JSON.stringify(previous, null, 2)}\n`,
		);

		mockHtmlResponse(
			"<html><body>" +
				"<h5>AMD FSR Redstone</h5><table><tr><td>Game A</td></tr></table>" +
				"<h5>FSR 3</h5><table><tr><td>Game A</td></tr></table>" +
				"<h5>FSR 2</h5><table><tr><td>Game B</td></tr></table>" +
				"<h5>AMD FSR Frame Generation (ML) Support</h5><table><tr><td>Game A</td></tr></table>" +
				"</body></html>",
		);

		await expect(scrapeAmd({ outputDir: tmpDir })).rejects.toThrow(
			"AMD extraction suspicious: 2 games vs 8 previously (>25% drop)",
		);
	});
});
