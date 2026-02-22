import node_fs from "node:fs/promises";
import node_os from "node:os";
import node_path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson, writeJson } from "./json.js";

describe("readJson", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "json-test-"));
	});

	afterEach(async () => {
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should parse a valid JSON file", async () => {
		const filePath = node_path.join(tmpDir, "data.json");
		await node_fs.writeFile(filePath, '{"name":"test","value":42}\n', "utf-8");

		const result = await readJson<{ name: string; value: number }>(filePath);
		expect(result).toEqual({ name: "test", value: 42 });
	});

	it("should parse a JSON array", async () => {
		const filePath = node_path.join(tmpDir, "arr.json");
		await node_fs.writeFile(filePath, "[1, 2, 3]\n", "utf-8");

		const result = await readJson<number[]>(filePath);
		expect(result).toEqual([1, 2, 3]);
	});

	it("should throw when file does not exist", async () => {
		await expect(readJson(node_path.join(tmpDir, "missing.json"))).rejects.toThrow();
	});

	it("should throw on invalid JSON", async () => {
		const filePath = node_path.join(tmpDir, "bad.json");
		await node_fs.writeFile(filePath, "not json", "utf-8");

		await expect(readJson(filePath)).rejects.toThrow();
	});
});

describe("writeJson", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await node_fs.mkdtemp(node_path.join(node_os.tmpdir(), "json-test-"));
	});

	afterEach(async () => {
		await node_fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("should write JSON with 2-space indentation and trailing newline", async () => {
		const filePath = node_path.join(tmpDir, "out.json");
		await writeJson(filePath, { key: "value", num: 1 });

		const content = await node_fs.readFile(filePath, "utf-8");
		expect(content).toBe('{\n  "key": "value",\n  "num": 1\n}\n');
	});

	it("should write JSON arrays correctly", async () => {
		const filePath = node_path.join(tmpDir, "arr.json");
		await writeJson(filePath, [{ name: "a" }, { name: "b" }]);

		const content = await node_fs.readFile(filePath, "utf-8");
		expect(content).toBe('[\n  {\n    "name": "a"\n  },\n  {\n    "name": "b"\n  }\n]\n');
	});

	it("should create parent directories if they don't exist", async () => {
		const filePath = node_path.join(tmpDir, "deep", "nested", "file.json");
		await writeJson(filePath, { ok: true });

		const content = await node_fs.readFile(filePath, "utf-8");
		expect(content).toBe('{\n  "ok": true\n}\n');
	});

	it("should overwrite existing files", async () => {
		const filePath = node_path.join(tmpDir, "overwrite.json");
		await writeJson(filePath, { v: 1 });
		await writeJson(filePath, { v: 2 });

		const result = await readJson<{ v: number }>(filePath);
		expect(result.v).toBe(2);
	});
});
