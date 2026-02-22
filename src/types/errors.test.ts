import { describe, expect, it } from "vitest";
import { CheckerError, MatcherError, ScraperError } from "./errors.js";

describe("ScraperError", () => {
	it("should set name, message, provider, and statusCode", () => {
		const error = new ScraperError("NVIDIA API returned 503", "nvidia", 503);
		expect(error.name).toBe("ScraperError");
		expect(error.message).toBe("NVIDIA API returned 503");
		expect(error.provider).toBe("nvidia");
		expect(error.statusCode).toBe(503);
	});

	it("should work without statusCode", () => {
		const error = new ScraperError("Parse failed", "amd");
		expect(error.name).toBe("ScraperError");
		expect(error.provider).toBe("amd");
		expect(error.statusCode).toBeUndefined();
	});

	it("should be an instance of Error", () => {
		const error = new ScraperError("fail", "intel");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(ScraperError);
	});
});

describe("MatcherError", () => {
	it("should set name, message, and game", () => {
		const error = new MatcherError("No match found", "Half-Life 3");
		expect(error.name).toBe("MatcherError");
		expect(error.message).toBe("No match found");
		expect(error.game).toBe("Half-Life 3");
	});

	it("should be an instance of Error", () => {
		const error = new MatcherError("fail", "test");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(MatcherError);
	});
});

describe("CheckerError", () => {
	it("should set name, message, and appId", () => {
		const error = new CheckerError("Check failed", "730");
		expect(error.name).toBe("CheckerError");
		expect(error.message).toBe("Check failed");
		expect(error.appId).toBe("730");
	});

	it("should be an instance of Error", () => {
		const error = new CheckerError("fail", "123");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(CheckerError);
	});
});
