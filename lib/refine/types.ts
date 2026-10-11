/**
 * The contract between the browser and the two Claude-backed routes.
 * Shared by route handlers, the client loop, fixtures, and tests.
 */
import { z } from "zod";
import { ProgramSchema, type Program } from "../geometry/dsl";

/** Effort levels offered in the UI. Opus 5.5 also has xhigh and max; three is enough to show the trade. */
export const EFFORTS = ["low", "medium", "high"] as const;
export type RefineEffort = (typeof EFFORTS)[number];

/** Claude reviews its own render at most this many times per session. */
export const MAX_REVIEWS = 3;

export const LIMITS = {
  promptChars: 600,
  /** Base64 characters of the PNG. About 1.4 MB of image. */
  imageChars: 1_900_000,
  /** Request body cap for the review route, which carries the image. */
  critiqueBytes: 2_200_000,
  listItems: 6,
  itemChars: 220,
} as const;

const demoId = z.string().max(64).optional();
const prompt = z.string().trim().min(1).max(LIMITS.promptChars);

export const GenerateBody = z.object({
  demoId,
  prompt,
  effort: z.enum(EFFORTS),
});
export type GenerateBody = z.infer<typeof GenerateBody>;

export const CritiqueBody = z.object({
  demoId,
  prompt,
  program: ProgramSchema,
  /**
   * The render Claude should look at, as base64 PNG (a data URL is accepted).
   * Optional on the wire because demo replay never reads it and the browser
   * does not upload it then; the live handler requires it.
   */
  image: z.string().max(LIMITS.imageChars).optional(),
  iteration: z.number().int().min(1).max(MAX_REVIEWS),
  effort: z.enum(EFFORTS),
});
export type CritiqueBody = z.infer<typeof CritiqueBody>;

export interface GenerateData {
  program: Program;
  /** True when the first answer failed validation and Claude fixed it from the validator's errors. */
  corrected: boolean;
  /** Clamps the validator applied to the accepted program. */
  warnings: string[];
}

export interface Critique {
  /** What the render gets right, in Claude's words. */
  matches: string[];
  /** Where the render falls short of the request. */
  gaps: string[];
  /** 0 to 10: how well the render matches the request. */
  score: number;
  /** True when Claude judges the render good enough to stop. */
  done: boolean;
}

export interface CritiqueData extends Critique {
  /** The next program to draw. Equal to the reviewed program when `done` is true. */
  revisedProgram: Program;
  corrected: boolean;
  warnings: string[];
}

/**
 * What Claude returns for a review, as a structured-output schema. Field
 * order matters: the model writes the critique first and the revision after,
 * so the revision follows from the gaps it just named. No numeric bounds
 * here; `score` is clamped in code.
 */
export const CritiqueWire = z.object({
  matches: z.array(z.string()),
  gaps: z.array(z.string()),
  score: z.number(),
  done: z.boolean(),
  revisedProgram: ProgramSchema,
});
export type CritiqueWire = z.infer<typeof CritiqueWire>;

/** Fixture key for one step of a recorded session. */
export function demoIdFor(
  session: string,
  effort: RefineEffort,
  step: "generate" | number,
): string {
  return step === "generate"
    ? `${session}-${effort}-generate`
    : `${session}-${effort}-critique-${step}`;
}
