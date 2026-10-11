import fixtures from "@/fixtures/generate.json";
import { jsonRoute } from "@/lib/api";
import type { FixtureStore } from "@/lib/demo";
import { generateLive } from "@/lib/refine/generate";
import { GenerateBody, type GenerateData } from "@/lib/refine/types";

/** Prompt -> program, via structured outputs, with one self-correction pass. */
export const maxDuration = 120;

export const POST = jsonRoute({
  store: "generate",
  fixtures: fixtures as unknown as FixtureStore<GenerateData>,
  schema: GenerateBody,
  rateLimit: { limit: 20, windowMs: 60_000 },
  live: ({ body, client, req }) => generateLive({ body, client, signal: req.signal }),
});
