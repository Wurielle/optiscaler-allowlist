import { z } from "zod";

// --- NVIDIA ---

/** Raw NVIDIA feature value as returned by the API */
export type NvidiaFeatureValue = "" | "Yes" | "NV" | "NV, U" | "NV, T" | "Full RT";

export const nvidiaFeatureValueSchema = z.enum(["", "Yes", "NV", "NV, U", "NV, T", "Full RT"]);

export interface NvidiaGame {
	gameName: string;
	dlssMultiFrameGeneration: string;
	dlssFrameGeneration: string;
	dlssSuperResolution: string;
	dlssRayReconstruction: string;
	dlaa: string;
	rayTracing: string;
}

export const nvidiaGameSchema = z.object({
	gameName: z.string().min(1),
	dlssMultiFrameGeneration: z.string(),
	dlssFrameGeneration: z.string(),
	dlssSuperResolution: z.string(),
	dlssRayReconstruction: z.string(),
	dlaa: z.string(),
	rayTracing: z.string(),
});

export const nvidiaGameArraySchema = z.array(nvidiaGameSchema);

// --- AMD ---

export interface AmdGame {
	gameName: string;
	fsrRedstone: boolean;
	fsr3: boolean;
	fsr2: boolean;
	fsrFrameGenerationMl: boolean;
}

export const amdGameSchema = z.object({
	gameName: z.string().min(1),
	fsrRedstone: z.boolean(),
	fsr3: z.boolean(),
	fsr2: z.boolean(),
	fsrFrameGenerationMl: z.boolean(),
});

export const amdGameArraySchema = z.array(amdGameSchema);

// --- Intel ---

export interface IntelGame {
	gameName: string;
	xess2: boolean;
	xess: boolean;
}

export const intelGameSchema = z.object({
	gameName: z.string().min(1),
	xess2: z.boolean(),
	xess: z.boolean(),
});

export const intelGameArraySchema = z.array(intelGameSchema);
