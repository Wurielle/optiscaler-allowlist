import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSteamAntiCheat, parseAntiCheatFromHtml, resetSteamCache } from "./steam.js";

const originalFetch = globalThis.fetch;

/** Minimal Steam page HTML with an anticheat_section (like Highguard) */
const HTML_WITH_ANTICHEAT = `
<html>
<body>
<div class="block responsive_apppage_details_left" id="category_block">
	<div class="game_area_features_list_ctn">
		<a class="game_area_details_specs_ctn">Online PvP</a>
	</div>
	<div class="anticheat_section DRM_notice" >
		<div>Uses Kernel Level Anti-Cheat</div>
		<div class="anticheat_name">Easy Anti-Cheat<span class="anticheat_uninstalls"> - Requires manual removal after game uninstall</span></div>
		<div class="anticheat_name">Boot Protection<span class="anticheat_uninstalls"> - Requires both Secure Boot &amp; TPM 2.0</span></div>
	</div>
</div>
</body>
</html>`;

/** Minimal Steam page HTML with NO anticheat_section (like Expedition 33) */
const HTML_WITHOUT_ANTICHEAT = `
<html>
<body>
<div class="block responsive_apppage_details_left" id="category_block">
	<div class="game_area_features_list_ctn">
		<a class="game_area_details_specs_ctn">Single-player</a>
		<a class="game_area_details_specs_ctn">Steam Achievements</a>
	</div>
</div>
</body>
</html>`;

/** Steam page with age gate */
const HTML_AGE_GATE = `
<html>
<body>
<div id="app_agegate" class="page_content">
	<h2>This game may contain content not appropriate for all ages</h2>
	<select name="ageYear" id="ageYear"></select>
</div>
</body>
</html>`;

/** Steam page for a non-game or missing app */
const HTML_NON_GAME = `
<html>
<body>
<div class="page_content">
	<p>This app is no longer available.</p>
</div>
</body>
</html>`;

/** Anticheat section with a single anti-cheat and no Boot Protection */
const HTML_SINGLE_ANTICHEAT = `
<html>
<body>
<div class="block responsive_apppage_details_left" id="category_block">
	<div class="game_area_features_list_ctn"></div>
	<div class="anticheat_section DRM_notice" >
		<div>Uses Anti-Cheat</div>
		<div class="anticheat_name">BattlEye<span class="anticheat_uninstalls"> - Runs at system startup</span></div>
	</div>
</div>
</body>
</html>`;

/** Anticheat section with header only, no anticheat_name children */
const HTML_ANTICHEAT_HEADER_ONLY = `
<html>
<body>
<div class="block responsive_apppage_details_left" id="category_block">
	<div class="game_area_features_list_ctn"></div>
	<div class="anticheat_section DRM_notice" >
		<div>Uses Kernel Level Anti-Cheat</div>
	</div>
</div>
</body>
</html>`;

function mockSteamPage(html: string, status = 200): void {
	globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(html, { status }));
}

describe("parseAntiCheatFromHtml", () => {
	it("should detect anti-cheat with multiple systems", () => {
		const result = parseAntiCheatFromHtml(HTML_WITH_ANTICHEAT);
		expect(result.hasAntiCheat).toBe(true);
		expect(result.details).toContain("Easy Anti-Cheat");
		expect(result.details).toContain("Boot Protection");
		expect(result.details).toHaveLength(2);
	});

	it("should return no anti-cheat for clean page", () => {
		const result = parseAntiCheatFromHtml(HTML_WITHOUT_ANTICHEAT);
		expect(result.hasAntiCheat).toBe(false);
		expect(result.details).toHaveLength(0);
	});

	it("should detect a single anti-cheat system", () => {
		const result = parseAntiCheatFromHtml(HTML_SINGLE_ANTICHEAT);
		expect(result.hasAntiCheat).toBe(true);
		expect(result.details).toEqual(["BattlEye"]);
	});

	it("should fall back to header text when no anticheat_name divs exist", () => {
		const result = parseAntiCheatFromHtml(HTML_ANTICHEAT_HEADER_ONLY);
		expect(result.hasAntiCheat).toBe(true);
		expect(result.details).toEqual(["Uses Kernel Level Anti-Cheat"]);
	});
});

describe("checkSteamAntiCheat", () => {
	beforeEach(() => {
		resetSteamCache();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("should detect anti-cheat from a store page", async () => {
		mockSteamPage(HTML_WITH_ANTICHEAT);

		const result = await checkSteamAntiCheat("4128260");
		expect(result).not.toBeNull();
		expect(result?.hasAntiCheat).toBe(true);
		expect(result?.details).toContain("Easy Anti-Cheat");
	});

	it("should return safe for a game with no anti-cheat", async () => {
		mockSteamPage(HTML_WITHOUT_ANTICHEAT);

		const result = await checkSteamAntiCheat("1903340");
		expect(result).not.toBeNull();
		expect(result?.hasAntiCheat).toBe(false);
		expect(result?.details).toHaveLength(0);
	});

	it("should return null when age gate is detected", async () => {
		mockSteamPage(HTML_AGE_GATE);

		const result = await checkSteamAntiCheat("1903340");
		expect(result).toBeNull();
	});

	it("should return null for non-game pages", async () => {
		mockSteamPage(HTML_NON_GAME);

		const result = await checkSteamAntiCheat("99999");
		expect(result).toBeNull();
	});

	it("should return null on HTTP error", async () => {
		mockSteamPage("", 500);

		const result = await checkSteamAntiCheat("12345");
		expect(result).toBeNull();
	});

	it("should return null on network failure", async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));

		const result = await checkSteamAntiCheat("12345");
		expect(result).toBeNull();
	});

	it("should send birthtime cookie to bypass age gate", async () => {
		mockSteamPage(HTML_WITHOUT_ANTICHEAT);

		await checkSteamAntiCheat("1903340");

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining("store.steampowered.com/app/1903340/"),
			expect.objectContaining({
				headers: expect.objectContaining({
					Cookie: expect.stringContaining("birthtime=0"),
				}),
			}),
		);
	});

	it("should cache pages for repeated lookups", async () => {
		mockSteamPage(HTML_WITHOUT_ANTICHEAT);

		const result1 = await checkSteamAntiCheat("1903340");
		const result2 = await checkSteamAntiCheat("1903340");

		expect(result1).toEqual(result2);
		// fetch should only be called once due to caching
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});
});
