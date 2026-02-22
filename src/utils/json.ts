import node_fs from "node:fs/promises";
import node_path from "node:path";

/**
 * Read and parse a JSON file.
 * Returns the parsed value typed as T (caller is responsible for validation).
 */
export async function readJson<T>(filePath: string): Promise<T> {
	const content = await node_fs.readFile(filePath, "utf-8");
	return JSON.parse(content) as T;
}

/**
 * Write a value as JSON to a file.
 * Uses 2-space indentation and a trailing newline.
 * Creates parent directories if they don't exist.
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
	const dir = node_path.dirname(filePath);
	await node_fs.mkdir(dir, { recursive: true });
	const content = `${JSON.stringify(data, null, 2)}\n`;
	await node_fs.writeFile(filePath, content, "utf-8");
}
