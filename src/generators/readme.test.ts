import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AllowlistEntry } from "../types/allowlist.js";
import { writeJson } from "../utils/json.js";
import { compileReadmeTemplate, generateReadme, renderAllowlistTable } from "./readme.js";

describe("renderAllowlistTable", () => {
	it("renders checkbox columns for provider features", () => {
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
		expect(table).toContain("| Game | Store | DLSS | FSR | XeSS |");
		expect(table).toContain(
			"| AMID EVIL | [Steam](https://store.steampowered.com/app/673130/) | [x] | [x] | [x] |",
		);
	});
});

describe("compileReadmeTemplate", () => {
	it("injects generated table and timestamp into placeholders", () => {
		const template =
			"# Title\n\nGenerated: {{ALLOWLIST_LAST_UPDATED_UTC}}\n\n{{ALLOWLIST_TABLE}}\n";
		const generated = compileReadmeTemplate(template, [], new Date("2026-02-26T00:00:00.000Z"));

		expect(generated).toContain("Generated: 2026-02-26T00:00:00.000Z");
		expect(generated).toContain("No allowlist entries found.");
	});
});

describe("generateReadme", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "readme-gen-test-"));
		await node_fs.mkdir(node_path.join(tempDir, "allowlist"), { recursive: true });
	});

	afterEach(async () => {
		await node_fs.rm(tempDir, { recursive: true, force: true });
	});

	it("writes README from template and allowlist files", async () => {
		const templatePath = node_path.join(tempDir, "README.template.md");
		const outputPath = node_path.join(tempDir, "README.md");
		const allowlistDir = node_path.join(tempDir, "allowlist");

		await node_fs.writeFile(
			templatePath,
			"# OptiScaler Allowlist\n\n{{ALLOWLIST_TABLE}}\n",
			"utf-8",
		);
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

		const result = await generateReadme({
			allowlistDir,
			templatePath,
			outputPath,
			generatedAt: new Date("2026-02-26T12:00:00.000Z"),
		});

		expect(result.entryCount).toBe(1);
		const readme = await node_fs.readFile(outputPath, "utf-8");
		expect(readme).toContain("| Game A |");
	});
});
