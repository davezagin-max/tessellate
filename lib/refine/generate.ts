/** Prompt -> first program. Server-side only. */
import type Anthropic from "@anthropic-ai/sdk";
import type { LiveResult } from "../api";
import { callClaude, untrusted } from "../claude";
import { MODELS } from "../config";
import { ProgramSchema } from "../geometry/dsl";
import { askWithCorrection } from "./correct";
import { GENERATE_SYSTEM } from "./prompts";
import type { GenerateBody, GenerateData } from "./types";

/** Thinking counts toward the limit, so leave far more room than the ~2K-token program needs. */
const MAX_TOKENS = 16_000;

export async function generateLive(ctx: {
  body: GenerateBody;
  client: Anthropic;
  signal?: AbortSignal;
}): Promise<LiveResult<GenerateData>> {
  const { body, client } = ctx;
  const result = await askWithCorrection({
    messages: [
      {
        role: "user",
        content: `${untrusted("request", body.prompt)}\n\nWrite the program for this request.`,
      },
    ],
    programOf: (program) => program,
    call: (messages) =>
      callClaude({
        client,
        model: MODELS.opus,
        effort: body.effort,
        system: GENERATE_SYSTEM,
        cacheSystem: true,
        messages,
        schema: ProgramSchema,
        maxTokens: MAX_TOKENS,
        signal: ctx.signal,
      }),
  });

  const spend = { model: result.model, usage: result.usage, costUsd: result.costUsd };
  if (result.kind === "refusal") return { refusal: result.refusal, ...spend };
  return {
    data: { program: result.program, corrected: result.corrected, warnings: result.warnings },
    ...spend,
  };
}
