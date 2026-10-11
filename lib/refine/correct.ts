/**
 * Ask Claude for something that contains a program, validate the program in
 * code, and give Claude exactly one chance to fix it if validation fails.
 *
 * Structured outputs guarantee the JSON shape but cannot express numeric
 * limits or the shape cap, so a well-formed answer can still be a program we
 * refuse to draw. When that happens the validator's own error messages are
 * sent back as the next user turn. The conversation is append-only: the
 * retry sends the first call's messages back untouched (thinking blocks
 * included) with the correction request added at the end.
 */
import type { CallResult, Msg, Refusal } from "../claude";
import { PipelineError } from "../claude";
import { ZERO_USAGE, type Usage } from "../config";
import type { Program } from "../geometry/dsl";
import { validateProgram } from "../geometry/validate";

export interface Spend {
  model: string;
  usage: Usage;
  costUsd: number;
}

export type Corrected<T> =
  | ({ kind: "ok"; parsed: T; program: Program; warnings: string[]; corrected: boolean } & Spend)
  | ({ kind: "refusal"; refusal: Refusal } & Spend);

function add(total: Spend, result: CallResult<unknown>): Spend {
  return {
    model: result.model,
    usage: {
      input_tokens: total.usage.input_tokens + result.usage.input_tokens,
      output_tokens: total.usage.output_tokens + result.usage.output_tokens,
      cache_creation_input_tokens:
        total.usage.cache_creation_input_tokens + result.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        total.usage.cache_read_input_tokens + result.usage.cache_read_input_tokens,
    },
    costUsd: total.costUsd + result.costUsd,
  };
}

export function correctionRequest(errors: string[]): string {
  return [
    "That program failed validation and was not drawn. The validator reported:",
    ...errors.slice(0, 8).map((error) => `- ${error}`),
    "Return the complete answer again in the same format, with the program corrected. Keep everything that was already valid.",
  ].join("\n");
}

function unusable(result: CallResult<unknown>): PipelineError {
  return new PipelineError(
    result.stopReason === "max_tokens"
      ? "Claude ran out of room before finishing the program. Try a lower effort or a simpler request."
      : "Claude's answer did not match the expected format. Try again.",
  );
}

export async function askWithCorrection<T>(options: {
  /** Makes one model call with the given conversation. */
  call: (messages: Msg[]) => Promise<CallResult<T>>;
  messages: Msg[];
  /** Picks the program out of the parsed answer. */
  programOf: (parsed: T) => unknown;
  /** Return true to accept the answer without validating its program (a "nothing to change" review). */
  skipValidation?: (parsed: T) => boolean;
  fallbackProgram?: Program;
}): Promise<Corrected<T>> {
  let spend: Spend = { model: "none", usage: ZERO_USAGE, costUsd: 0 };

  const first = await options.call(options.messages);
  spend = add(spend, first);
  if (first.refusal) return { kind: "refusal", refusal: first.refusal, ...spend };
  if (!first.ok || first.parsed === null) throw unusable(first);

  if (options.skipValidation?.(first.parsed) && options.fallbackProgram) {
    return {
      kind: "ok",
      parsed: first.parsed,
      program: options.fallbackProgram,
      warnings: [],
      corrected: false,
      ...spend,
    };
  }

  const checked = validateProgram(options.programOf(first.parsed));
  if (checked.ok) {
    return {
      kind: "ok",
      parsed: first.parsed,
      program: checked.program,
      warnings: checked.warnings,
      corrected: false,
      ...spend,
    };
  }

  // One self-correction pass, driven by the validator's messages.
  const second = await options.call([
    ...first.messages,
    { role: "user", content: correctionRequest(checked.errors) },
  ]);
  spend = add(spend, second);
  if (second.refusal) return { kind: "refusal", refusal: second.refusal, ...spend };
  if (!second.ok || second.parsed === null) throw unusable(second);

  const rechecked = validateProgram(options.programOf(second.parsed));
  if (!rechecked.ok) {
    throw new PipelineError(
      `Claude's program failed validation twice and was not drawn (${rechecked.errors[0]}). Try rephrasing the request.`,
    );
  }
  return {
    kind: "ok",
    parsed: second.parsed,
    program: rechecked.program,
    warnings: rechecked.warnings,
    corrected: true,
    ...spend,
  };
}
