import { z } from "zod";

export interface AntiCheatResult {
	safe: boolean;
	source: string;
	checkedAt: string;
}

export const antiCheatResultSchema = z.object({
	safe: z.boolean(),
	source: z.string().min(1),
	checkedAt: z.string().datetime(),
});

/** Record keyed by app ID (as string), mapping to anti-cheat check result */
export type AntiCheatData = Record<string, AntiCheatResult>;

export const antiCheatDataSchema = z.record(z.string(), antiCheatResultSchema);
