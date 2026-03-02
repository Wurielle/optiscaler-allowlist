import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AllowlistEntry } from "../types/allowlist.js";
import { writeJson } from "../utils/json.js";
import { compileReadmeTemplate, generateReadme, renderAllowlistTable } from "./readme.js";

describe("renderAllowlistTable", () => {
	it("renders emoji feature columns and steam links", () => {
		const entries: AllowlistEntry[] = [
			{
				name: "AMID EVIL",
				stores: { steam: { appId: 673130 } },
				providers: {
					nvidia: {
						dlssMultiFrameGeneration: "",
						dlssFrameGeneration: "",
						dlssSuperResolution: "Yes",
						dlssRayReconstruction: "",
						dlaa: "",
						rayTracing: "Yes",
					},
					amd: {
						fsrRedstone: true,
						fsr3: false,
						fsr2: true,
						fsrFrameGenerationMl: false,
					},
					intel: {
						xess2: true,
						xess: false,
					},
				},
			},
		];

		const table = renderAllowlistTable(entries);
		expect(table).toContain('<table width="100%">');
		expect(table).toContain("<th>Game</th><th>Store</th><th>DLSS</th><th>FSR</th><th>XeSS</th>");
		expect(table).toContain(
			'<tr><td>AMID EVIL</td><td><a href="https://store.steampowered.com/app/673130/" target="_blank" rel="noopener noreferrer">Steam</a></td><td>✅</td><td>✅</td><td>✅</td></tr>',
		);
	});
});

describe("compileReadmeTemplate", () => {
	it("injects generated tables and timestamp into placeholders", () => {
		const template =
			"# Title\n\nGenerated: {{ALLOWLIST_LAST_UPDATED_UTC}}\n\n## Safe Games\n{{SAFE_GAMES_TABLE}}\n\n## Unsafe Games\n{{UNSAFE_GAMES_TABLE}}\n\n## Not Checked Games\n{{NOT_CHECKED_GAMES_TABLE}}\n\n## Unsupported Games\n{{UNSUPPORTED_GAMES_TABLE}}\n";
		const generated = compileReadmeTemplate(
			template,
			[],
			[
				{
					name: "Game B",
					steamAppId: null,
					hasDlss: false,
					hasFsr: true,
					hasXess: false,
				},
			],
			[
				{
					name: "Game C",
					steamAppId: 30,
					hasDlss: true,
					hasFsr: false,
					hasXess: false,
				},
			],
			[
				{
					name: "Game D",
					steamAppId: 40,
					hasDlss: false,
					hasFsr: false,
					hasXess: false,
				},
			],
			new Date("2026-02-26T00:00:00.000Z"),
		);

		expect(generated).toContain("Generated: 2026-02-26T00:00:00.000Z");
		expect(generated).toContain("No games found."); // safe table is empty
		expect(generated).toContain("<td>Game B</td>");
		expect(generated).toContain("<td>Game C</td>");
		expect(generated).toContain("<td>Game D</td>");
	});
});

describe("generateReadme", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "readme-gen-test-"));
		await node_fs.mkdir(node_path.join(tempDir, "allowlist"), { recursive: true });
		await node_fs.mkdir(node_path.join(tempDir, "providers"), { recursive: true });
		await node_fs.mkdir(node_path.join(tempDir, "stores"), { recursive: true });
		await node_fs.mkdir(node_path.join(tempDir, "anticheat"), { recursive: true });
	});

	afterEach(async () => {
		await node_fs.rm(tempDir, { recursive: true, force: true });
	});

	it("writes README with safe, unsafe, not-checked, and unsupported sections", async () => {
		const templatePath = node_path.join(tempDir, "README.template.md");
		const outputPath = node_path.join(tempDir, "README.md");
		const allowlistDir = node_path.join(tempDir, "allowlist");
		const providersDir = node_path.join(tempDir, "providers");
		const storeMappingsPath = node_path.join(tempDir, "stores", "by-game.json");
		const anticheatPath = node_path.join(tempDir, "anticheat", "steam.json");

		await node_fs.writeFile(
			templatePath,
			"# OptiScaler Allowlist\n\n## Safe Games\n\n{{SAFE_GAMES_TABLE}}\n\n## Unsafe Games\n\n{{UNSAFE_GAMES_TABLE}}\n\n## Not Checked Games\n\n{{NOT_CHECKED_GAMES_TABLE}}\n\n## Unsupported Games\n\n{{UNSUPPORTED_GAMES_TABLE}}\n",
			"utf-8",
		);

		// Game A: safe (in allowlist)
		await writeJson(node_path.join(allowlistDir, "10.json"), {
			name: "Game A",
			stores: { steam: { appId: 10 } },
			providers: {
				nvidia: {
					dlssMultiFrameGeneration: "Yes",
					dlssFrameGeneration: "",
					dlssSuperResolution: "Yes",
					dlssRayReconstruction: "",
					dlaa: "",
					rayTracing: "",
				},
			},
		});

		await writeJson(node_path.join(providersDir, "nvidia.json"), [
			// Game A: safe (in allowlist)
			{
				name: "Game A",
				dlssMultiFrameGeneration: "Yes",
				dlssFrameGeneration: "",
				dlssSuperResolution: "Yes",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "",
			},
			// Game D: unsupported (only ray tracing, no upscaling features)
			{
				name: "Game D",
				dlssMultiFrameGeneration: "",
				dlssFrameGeneration: "",
				dlssSuperResolution: "",
				dlssRayReconstruction: "",
				dlaa: "",
				rayTracing: "Yes",
			},
		]);
		await writeJson(node_path.join(providersDir, "amd.json"), [
			// Game B: unsafe (has FSR but anti-cheat says unsafe)
			{
				name: "Game B",
				fsrRedstone: false,
				fsr3: true,
				fsr2: false,
				fsrFrameGenerationMl: false,
			},
			// Game C: not checked (has FSR but not in anti-cheat data)
			{
				name: "Game C",
				fsrRedstone: false,
				fsr3: false,
				fsr2: true,
				fsrFrameGenerationMl: false,
			},
		]);
		await writeJson(node_path.join(providersDir, "intel.json"), []);
		await writeJson(storeMappingsPath, {
			"Game A": { steam: 10 },
			"Game B": { steam: 20 },
			"Game C": { steam: 30 },
			"Game D": { steam: 40 },
		});
		await writeJson(anticheatPath, {
			"10": { safe: true, source: "pcgamingwiki.com", checkedAt: "2026-01-01T00:00:00.000Z" },
			"20": {
				safe: false,
				source: "pcgamingwiki.com",
				checkedAt: "2026-01-01T00:00:00.000Z",
			},
			// 30 (Game C) deliberately missing — not checked
			// 40 (Game D) checked but unsupported takes priority
		});

		const result = await generateReadme({
			allowlistDir,
			providersDir,
			storeMappingsPath,
			anticheatPath,
			templatePath,
			outputPath,
			generatedAt: new Date("2026-02-26T12:00:00.000Z"),
		});

		expect(result.safeCount).toBe(1);
		expect(result.unsafeCount).toBe(1);
		expect(result.notCheckedCount).toBe(1);
		expect(result.unsupportedCount).toBe(1);

		const readme = await node_fs.readFile(outputPath, "utf-8");
		expect(readme).toContain("## Safe Games");
		expect(readme).toContain("## Unsafe Games");
		expect(readme).toContain("## Not Checked Games");
		expect(readme).toContain("## Unsupported Games");
		expect(readme).toContain("<td>Game A</td>");
		expect(readme).toContain("<td>Game B</td>");
		expect(readme).toContain("<td>Game C</td>");
		expect(readme).toContain("<td>Game D</td>");
	});
});
