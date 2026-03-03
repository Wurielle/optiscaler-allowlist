const SPECIAL_SYMBOLS = /[\u2122\u00AE\u00A9]/g;
const APOSTROPHE_VARIANTS = /['\u2018\u2019\u201A\u201B\u2032\u2035]/g;
const DASH_VARIANTS = /[-\u2010-\u2015]/g;
// biome-ignore lint/suspicious/noMisleadingCharacterClass: intentionally matches combining diacritical marks
const DIACRITICS = /[\u0300-\u036f]/g;
const WHITESPACE = /[ \t\r\n\u00A0]+/g;

export function normalizeGameName(name: string): string {
	return name
		.replace(SPECIAL_SYMBOLS, "")
		.normalize("NFKD")
		.replace(DIACRITICS, "")
		.replace(APOSTROPHE_VARIANTS, "'")
		.replace(DASH_VARIANTS, "-")
		.replace(WHITESPACE, " ")
		.toLowerCase()
		.trim();
}

const MINOR_WORDS = new Set([
	"a",
	"an",
	"and",
	"as",
	"at",
	"but",
	"by",
	"for",
	"in",
	"nor",
	"of",
	"on",
	"or",
	"so",
	"the",
	"to",
	"up",
	"yet",
]);

export function toCanonicalName(name: string): string {
	const cleaned = name
		.replace(SPECIAL_SYMBOLS, "")
		.normalize("NFKD")
		.replace(DIACRITICS, "")
		.replace(APOSTROPHE_VARIANTS, "'")
		.replace(DASH_VARIANTS, "-")
		.replace(WHITESPACE, " ")
		.trim();

	const words = cleaned.split(/\s+/);

	const titleWords = words.map((word, index) => {
		if (word.length === 0) return word;

		if (word.includes("-")) {
			return word
				.split("-")
				.map((part, partIndex) => {
					if (partIndex === 0) {
						return capitalizeWord(part);
					}
					if (MINOR_WORDS.has(part.toLowerCase())) {
						return part.toLowerCase();
					}
					return capitalizeWord(part);
				})
				.join("-");
		}

		if (index === 0 || index === words.length - 1) {
			return capitalizeWord(word);
		}

		if (MINOR_WORDS.has(word.toLowerCase())) {
			return word.toLowerCase();
		}

		return capitalizeWord(word);
	});

	return titleWords.join(" ");
}

function capitalizeWord(word: string): string {
	if (word.length === 0) return word;

	const lower = word.toLowerCase();
	const hasInternalCaps = /[a-z].[A-Z]/.test(word);

	if (hasInternalCaps) {
		return word;
	}

	if (/^i{1,3}$/.test(lower) || lower === "iv" || lower === "vi" || lower === "vii") {
		return word.toUpperCase();
	}

	return lower.charAt(0).toUpperCase() + lower.slice(1);
}
