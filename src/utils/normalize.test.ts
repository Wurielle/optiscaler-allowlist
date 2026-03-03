import { describe, expect, it } from "vitest";
import { normalizeGameName, toCanonicalName } from "./normalize.js";

describe("normalizeGameName", () => {
	it("should strip TM symbol", () => {
		expect(normalizeGameName("EVERSPACE\u2122 2")).toBe("everspace 2");
	});

	it("should strip R symbol", () => {
		expect(normalizeGameName("Borderlands\u00AE 4")).toBe("borderlands 4");
	});

	it("should strip C symbol", () => {
		expect(normalizeGameName("Game\u00A9 Title")).toBe("game title");
	});

	it("should normalize curly apostrophes", () => {
		expect(normalizeGameName("Assassin\u2019s Creed")).toBe("assassin's creed");
		expect(normalizeGameName("Five Nights At Freddy\u2019s")).toBe("five nights at freddy's");
	});

	it("should strip diacritics", () => {
		expect(normalizeGameName("God of War Ragnar\u00F6k")).toBe("god of war ragnarok");
		expect(normalizeGameName("Pok\u00E9mon")).toBe("pokemon");
	});

	it("should normalize dash variants", () => {
		expect(normalizeGameName("A \u2014 B")).toBe("a - b");
		expect(normalizeGameName("A \u2013 B")).toBe("a - b");
	});

	it("should normalize whitespace", () => {
		expect(normalizeGameName("A  B")).toBe("a b");
		expect(normalizeGameName("A\u00A0B")).toBe("a b");
	});

	it("should convert to lowercase", () => {
		expect(normalizeGameName("DEATHLOOP")).toBe("deathloop");
		expect(normalizeGameName("DOOM: The Dark Ages")).toBe("doom: the dark ages");
	});

	it("should handle combined variations", () => {
		expect(normalizeGameName("Diablo\u00AE IV")).toBe("diablo iv");
		expect(normalizeGameName("Call of Duty\u00AE: Modern Warfare\u00AE III")).toBe(
			"call of duty: modern warfare iii",
		);
	});

	it("should strip trailing asterisks", () => {
		expect(normalizeGameName("Battlefield\u2122 6*")).toBe("battlefield 6");
		expect(normalizeGameName("Game Title*")).toBe("game title");
		expect(normalizeGameName("Game**")).toBe("game");
	});
});

describe("toCanonicalName", () => {
	it("should strip TM and title case", () => {
		expect(toCanonicalName("EVERSPACE\u2122 2")).toBe("Everspace 2");
	});

	it("should strip R and title case", () => {
		expect(toCanonicalName("Borderlands\u00AE 4")).toBe("Borderlands 4");
	});

	it("should normalize apostrophes and title case", () => {
		expect(toCanonicalName("Assassin\u2019s Creed")).toBe("Assassin's Creed");
		expect(toCanonicalName("DEATH STRANDING DIRECTOR\u2019S CUT")).toBe(
			"Death Stranding Director's Cut",
		);
	});

	it("should strip diacritics and title case", () => {
		expect(toCanonicalName("God of War Ragnar\u00F6k")).toBe("God of War Ragnarok");
	});

	it("should title case all caps", () => {
		expect(toCanonicalName("DEATHLOOP")).toBe("Deathloop");
		expect(toCanonicalName("FINAL FANTASY XVI")).toBe("Final Fantasy Xvi");
	});

	it("should title case mixed case", () => {
		expect(toCanonicalName("Like a Dragon: Ishin!")).toBe("Like a Dragon: Ishin!");
		expect(toCanonicalName("flipscapes")).toBe("Flipscapes");
	});

	it("should preserve minor words in title case except first/last", () => {
		expect(toCanonicalName("Indiana Jones and the Great Circle")).toBe(
			"Indiana Jones and the Great Circle",
		);
		expect(toCanonicalName("Indiana Jones and The Great Circle")).toBe(
			"Indiana Jones and the Great Circle",
		);
	});

	it("should normalize dashes within words", () => {
		expect(toCanonicalName("A \u2014 B")).toBe("A - B");
	});

	it("should handle colons in titles", () => {
		expect(toCanonicalName("DOOM: The Dark Ages")).toBe("Doom: the Dark Ages");
	});

	it("should strip trailing asterisks", () => {
		expect(toCanonicalName("Battlefield\u2122 6*")).toBe("Battlefield 6");
		expect(toCanonicalName("Game Title*")).toBe("Game Title");
	});
});
