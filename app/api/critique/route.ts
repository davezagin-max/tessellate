import fixtures from "@/fixtures/critique.json";
import { jsonRoute } from "@/lib/api";
import type { FixtureStore } from "@/lib/demo";
import { critiqueLive } from "@/lib/refine/critique";
import { CritiqueBody, LIMITS, type CritiqueData } from "@/lib/refine/types";

/** Render + request -> critique + revised program. Vision on the app's own output. */
export const maxDuration = 120;

export const POST = jsonRoute({
  store: "critique",
  fixtures: fixtures as unknown as FixtureStore<CritiqueData>,
  schema: CritiqueBody,
  // The request carries a PNG of up to 1024 x 1024 pixels.
  maxBytes: LIMITS.critiqueBytes,
  // Three reviews per session.
  rateLimit: { limit: 60, windowMs: 60_000 },
  live: ({ body, client, req }) => critiqueLive({ body, client, signal: req.signal }),
});
