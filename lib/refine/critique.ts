/** Render + request -> critique + revised program. Server-side only. */
import type Anthropic from "@anthropic-ai/sdk";
import type { LiveResult } from "../api";
import { PipelineError, callClaude, untrusted, type Msg } from "../claude";
import { MODELS } from "../config";
import { validateProgram } from "../geometry/validate";
import { askWithCorrection } from "./correct";
import { CRITIQUE_SYSTEM } from "./prompts";
import {
  CritiqueWire,
  LIMITS,
  MAX_REVIEWS,
  type Critique,
  type CritiqueBody,
  type CritiqueData,
} from "./types";

const MAX_TOKENS = 16_000;

/** Base64 of the eight-byte PNG signature. */
const PNG_MAGIC = "iVBORw0KGgo";

/** Accepts raw base64 or a data URL and returns raw base64, or null if it is not a PNG. */
export function pngBase64(image: string): string | null {
  const data = image.startsWith("data:") ? image.slice(image.indexOf(",") + 1) : image;
  if (!data.startsWith(PNG_MAGIC)) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  return data;
}

const tidyList = (items: string[]) =>
  items
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, LIMITS.itemChars))
    .filter((item) => item !== "")
    .slice(0, LIMITS.listItems);

/** Bounds everything the model said before it reaches the page. */
export function tidyCritique(
  wire: Pick<CritiqueWire, "matches" | "gaps" | "score" | "done">,
): Critique {
  const score = Number.isFinite(wire.score) ? Math.min(10, Math.max(0, Math.round(wire.score))) : 0;
  return { matches: tidyList(wire.matches), gaps: tidyList(wire.gaps), score, done: wire.done };
}

export async function critiqueLive(ctx: {
  body: CritiqueBody;
  client: Anthropic;
  signal?: AbortSignal;
}): Promise<LiveResult<CritiqueData>> {
  const { body, client } = ctx;

  // The program under review came from the browser, so it is checked like any other input.
  const current = validateProgram(body.program);
  if (!current.ok) {
    throw new PipelineError(`The program to review is not valid: ${current.errors[0]}`, 400);
  }
  const image = body.image ? pngBase64(body.image) : null;
  if (!image) throw new PipelineError("A PNG render of the program is required for a review.", 400);

  const last = body.iteration >= MAX_REVIEWS;
  const messages: Msg[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            untrusted("request", body.prompt),
            "",
            `Review ${body.iteration} of ${MAX_REVIEWS}. This program:`,
            untrusted("program", JSON.stringify(current.program)),
            "draws the image below.",
          ].join("\n"),
        },
        { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
        {
          type: "text",
          text: last
            ? "Compare the image with the request and reply in the required format. This is the last review of the session, so the revision you return will not be reviewed again: keep it conservative."
            : "Compare the image with the request and reply in the required format.",
        },
      ],
    },
  ];

  const result = await askWithCorrection({
    messages,
    programOf: (wire: CritiqueWire) => wire.revisedProgram,
    // "Done" means "change nothing", so there is no revision to validate.
    skipValidation: (wire) => wire.done,
    fallbackProgram: current.program,
    call: (history) =>
      callClaude({
        client,
        model: MODELS.opus,
        effort: body.effort,
        system: CRITIQUE_SYSTEM,
        cacheSystem: true,
        messages: history,
        schema: CritiqueWire,
        maxTokens: MAX_TOKENS,
        signal: ctx.signal,
      }),
  });

  const spend = { model: result.model, usage: result.usage, costUsd: result.costUsd };
  if (result.kind === "refusal") return { refusal: result.refusal, ...spend };
  return {
    data: {
      ...tidyCritique(result.parsed),
      revisedProgram: result.program,
      corrected: result.corrected,
      warnings: result.warnings,
    },
    ...spend,
  };
}
