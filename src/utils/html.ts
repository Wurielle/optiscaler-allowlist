export interface HtmlHeading {
	level: number;
	text: string;
	start: number;
	end: number;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

export function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&#x([\da-f]+);/gi, (_match, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function stripHtmlTags(html: string): string {
	return html.replace(/<[^>]+>/g, "");
}

export function normalizeText(value: string): string {
	return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, " ").trim();
}

export function parseHeadings(html: string): HtmlHeading[] {
	const headings: HtmlHeading[] = [];
	const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;

	for (const match of html.matchAll(headingRegex)) {
		const fullMatch = match[0];
		const level = Number.parseInt(match[1] ?? "0", 10);
		const innerHtml = match[2] ?? "";
		const start = match.index ?? -1;

		if (start < 0 || Number.isNaN(level)) {
			continue;
		}

		headings.push({
			level,
			text: normalizeText(innerHtml),
			start,
			end: start + fullMatch.length,
		});
	}

	return headings;
}

export function extractTagTexts(html: string, tagName: string): string[] {
	const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	const results: string[] = [];

	for (const match of html.matchAll(regex)) {
		const text = normalizeText(match[1] ?? "");
		if (text) {
			results.push(text);
		}
	}

	return results;
}

export function uniqueValues(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		unique.push(value);
	}

	return unique;
}
