import { z } from "zod";

export interface AllowlistNvidiaProvider {
	dlssMultiFrameGeneration: string;
	dlssFrameGeneration: string;
	dlssSuperResolution: string;
	dlssRayReconstruction: string;
	dlaa: string;
	rayTracing: string;
}

export interface AllowlistAmdProvider {
	fsrRedstone: boolean;
	fsr3: boolean;
	fsr2: boolean;
	fsrFrameGenerationMl: boolean;
}

export interface AllowlistIntelProvider {
	xess2: boolean;
	xess: boolean;
}

export interface AllowlistProviders {
	nvidia?: AllowlistNvidiaProvider;
	amd?: AllowlistAmdProvider;
	intel?: AllowlistIntelProvider;
}

export interface AllowlistStores {
	steam: { appId: number };
}

export interface AllowlistEntry {
	gameName: string;
	stores: AllowlistStores;
	providers: AllowlistProviders;
}

export const allowlistEntrySchema = z.object({
	gameName: z.string().min(1),
	stores: z.object({
		steam: z.object({
			appId: z.number().int().positive(),
		}),
	}),
	providers: z.object({
		nvidia: z
			.object({
				dlssMultiFrameGeneration: z.string(),
				dlssFrameGeneration: z.string(),
				dlssSuperResolution: z.string(),
				dlssRayReconstruction: z.string(),
				dlaa: z.string(),
				rayTracing: z.string(),
			})
			.optional(),
		amd: z
			.object({
				fsrRedstone: z.boolean(),
				fsr3: z.boolean(),
				fsr2: z.boolean(),
				fsrFrameGenerationMl: z.boolean(),
			})
			.optional(),
		intel: z
			.object({
				xess2: z.boolean(),
				xess: z.boolean(),
			})
			.optional(),
	}),
});

export const allowlistSchema = z.array(allowlistEntrySchema);
