import OpenAI from "openai";
import type { z } from "zod";

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
	if (clientInstance) {
		return clientInstance;
	}

	const apiKey = process.env.AI_API_KEY;
	const baseURL = process.env.AI_BASE_URL;

	if (!apiKey) {
		throw new Error("AI_API_KEY environment variable is required");
	}

	clientInstance = new OpenAI({
		apiKey,
		baseURL: baseURL || undefined,
	});

	return clientInstance;
}

function getModel(): string {
	return process.env.AI_MODEL || "gpt-4o-mini";
}

/**
 * Extract structured data from HTML content using an LLM.
 *
 * Sends the HTML and a prompt describing the expected output to the configured
 * OpenAI-compatible API. Parses and validates the response against the provided
 * Zod schema.
 *
 * @param html - The HTML content to extract data from
 * @param prompt - Instructions describing what to extract and the expected format
 * @param schema - Zod schema to validate the extracted data against
 * @returns The validated structured data
 */
export async function extractStructuredData<T>(
	html: string,
	prompt: string,
	schema: z.ZodType<T>,
): Promise<T> {
	const client = getClient();
	const model = getModel();

	const response = await client.chat.completions.create({
		model,
		messages: [
			{
				role: "system",
				content:
					"You are a data extraction assistant. You extract structured data from HTML content. " +
					"Always respond with valid JSON only, no markdown fences or extra text.",
			},
			{
				role: "user",
				content: `${prompt}\n\nHTML content:\n${html}`,
			},
		],
		temperature: 0,
	});

	const content = response.choices[0]?.message?.content;
	if (!content) {
		throw new Error("AI returned empty response");
	}

	const parsed: unknown = JSON.parse(content);
	return schema.parse(parsed);
}

/** Reset the cached client (useful for testing) */
export function resetClient(): void {
	clientInstance = null;
}
