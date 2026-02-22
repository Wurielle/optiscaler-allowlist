import { z } from "zod";

export interface StoreMappingEntry {
	appId: number | null;
}

export const storeMappingEntrySchema = z.object({
	appId: z.number().int().positive().nullable(),
});

/** Record keyed by game name, mapping to store info */
export type StoreMapping = Record<string, StoreMappingEntry>;

export const storeMappingSchema = z.record(z.string(), storeMappingEntrySchema);
