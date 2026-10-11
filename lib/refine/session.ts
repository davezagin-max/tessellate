/**
 * The refinement loop, as the browser runs it.
 *
 *   write    POST /api/generate   prompt -> first program
 *   draw     render the program to a PNG, here in the browser
 *   review   POST /api/critique   prompt + program + PNG -> critique + revision
 *   ...repeat draw and review, at most three reviews
 *
 * Each call is independent and stateless on the server, so there is no
 * conversation to keep alive between steps. Demo mode and live mode run this
 * same function; the only difference is that a demo request carries a
 * `demoId` and the server answers from a fixture.
 *
 * The loop takes its network and rendering functions as arguments, which is
 * what lets the tests drive it against the real route handlers with no
 * browser and no key.
 */
import type { ApiMeta, ApiResponse, ErrorKind } from "../api";
import { diffPrograms } from "../geometry/diff";
import type { Program } from "../geometry/dsl";
import { validateProgram } from "../geometry/validate";
import {
  MAX_REVIEWS,
  demoIdFor,
  type Critique,
  type CritiqueData,
  type GenerateData,
  type RefineEffort,
} from "./types";

export interface Frame {
  /** 0 is the first draft; n is the revision made by review n. */
  index: number;
  program: Program;
  /** PNG data URL of this program's render: exactly what Claude was shown. */
  image: string;
  /** What changed from the previous frame, computed by diffing the two programs. */
  changes: string[];
  /** True if Claude's first attempt at this program failed validation and it corrected itself. */
  corrected: boolean;
  /** Claude's review of this frame, once it has one. */
  critique: Critique | null;
}

export type Phase = "idle" | "writing" | "drawing" | "reviewing" | "done" | "error";

/** Why a finished session stopped. */
export type Outcome = "matched" | "limit" | "unchanged" | "stopped";

export interface SessionState {
  phase: Phase;
  /** The review in progress or most recently finished (1-based); 0 before the first. */
  review: number;
  frames: Frame[];
  outcome: Outcome | null;
  /** The last review's revision, when the session ran out of reviews before Claude was satisfied. */
  proposal: Program | null;
  error: { kind: ErrorKind; message: string } | null;
  /** Running totals for every call in the session. */
  meta: ApiMeta | null;
}

export const IDLE: SessionState = {
  phase: "idle",
  review: 0,
  frames: [],
  outcome: null,
  proposal: null,
  error: null,
  meta: null,
};

export type ApiCall = <D>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) => Promise<ApiResponse<D>>;

export interface SessionOptions {
  prompt: string;
  effort: RefineEffort;
  /** Session id for fixture keys, or null for a live request with no recording. */
  demo: string | null;
  /** Upload the PNG with each review. False in demo mode, where the server never reads it. */
  includeImage: boolean;
  api: ApiCall;
  render: (program: Program) => string | Promise<string>;
  onState: (state: SessionState) => void;
  /** Called before each step; demo replay uses it to pace the steps so they can be followed. */
  pause?: (phase: Phase) => Promise<void>;
  signal?: AbortSignal;
}

/** Adds one call's usage and cost to the session total. */
export function addMeta(total: ApiMeta | null, next: ApiMeta | undefined): ApiMeta | null {
  if (!next) return total;
  if (!total) return next;
  return {
    mode: next.mode,
    placeholder: total.placeholder || next.placeholder,
    recordedAt: total.recordedAt ?? next.recordedAt,
    model: next.model ?? total.model,
    usage: {
      input_tokens: total.usage.input_tokens + next.usage.input_tokens,
      output_tokens: total.usage.output_tokens + next.usage.output_tokens,
      cache_creation_input_tokens:
        total.usage.cache_creation_input_tokens + next.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        total.usage.cache_read_input_tokens + next.usage.cache_read_input_tokens,
    },
    costUsd: total.costUsd + next.costUsd,
  };
}

const sameProgram = (a: Program, b: Program) => JSON.stringify(a) === JSON.stringify(b);

export async function runSession(options: SessionOptions): Promise<SessionState> {
  const { prompt, effort, demo, api, render, onState, signal } = options;
  let state: SessionState = { ...IDLE, phase: "writing" };
  const update = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    onState(state);
    return state;
  };
  const fail = (kind: ErrorKind, message: string, meta?: ApiMeta) =>
    update({ phase: "error", error: { kind, message }, meta: addMeta(state.meta, meta) });
  const stopped = () => signal?.aborted === true;
  const stop = () => update({ phase: "done", outcome: "stopped" });
  // Resolves when the visitor presses Stop, so a paced replay step never has to be waited out.
  const aborted = signal
    ? new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      })
    : null;
  const step = async (phase: Phase, patch: Partial<SessionState> = {}) => {
    update({ phase, ...patch });
    const pause = options.pause?.(phase);
    if (pause) await (aborted ? Promise.race([pause, aborted]) : pause);
  };

  /** Validates a program from the server before anything draws it, then renders it. */
  const draw = async (
    program: unknown,
    previous: Program | null,
    corrected: boolean,
  ): Promise<Frame | string> => {
    const checked = validateProgram(program);
    if (!checked.ok) return `The program could not be drawn: ${checked.errors[0]}`;
    await step("drawing");
    const image = await render(checked.program);
    return {
      index: state.frames.length,
      program: checked.program,
      image,
      changes: previous ? diffPrograms(previous, checked.program) : [],
      corrected,
      critique: null,
    };
  };

  await step("writing");
  if (stopped()) return stop();
  const written = await api<GenerateData>(
    "/api/generate",
    { ...(demo ? { demoId: demoIdFor(demo, effort, "generate") } : {}), prompt, effort },
    signal,
  );
  if (stopped()) return stop();
  if (!written.ok) return fail(written.error.kind, written.error.message, written.meta);
  update({ meta: addMeta(state.meta, written.meta) });

  const first = await draw(written.data.program, null, written.data.corrected);
  if (typeof first === "string") return fail("server", first);
  update({ frames: [first] });

  for (let review = 1; review <= MAX_REVIEWS; review++) {
    const frame = state.frames[state.frames.length - 1];
    await step("reviewing", { review });
    if (stopped()) return stop();
    const reviewed = await api<CritiqueData>(
      "/api/critique",
      {
        ...(demo ? { demoId: demoIdFor(demo, effort, review) } : {}),
        prompt,
        program: frame.program,
        ...(options.includeImage ? { image: frame.image } : {}),
        iteration: review,
        effort,
      },
      signal,
    );
    if (stopped()) return stop();
    if (!reviewed.ok) return fail(reviewed.error.kind, reviewed.error.message, reviewed.meta);

    const { matches, gaps, score, done, revisedProgram, corrected } = reviewed.data;
    const frames = state.frames.map((f) =>
      f === frame ? { ...f, critique: { matches, gaps, score, done } } : f,
    );
    update({ frames, meta: addMeta(state.meta, reviewed.meta) });

    if (done) return update({ phase: "done", outcome: "matched" });

    const revision = validateProgram(revisedProgram);
    if (!revision.ok)
      return fail("server", `The revision could not be drawn: ${revision.errors[0]}`);
    if (sameProgram(revision.program, frame.program)) {
      return update({ phase: "done", outcome: "unchanged" });
    }
    if (review === MAX_REVIEWS) {
      return update({ phase: "done", outcome: "limit", proposal: revision.program });
    }
    const next = await draw(revision.program, frame.program, corrected);
    if (typeof next === "string") return fail("server", next);
    update({ frames: [...state.frames, next] });
  }
  return update({ phase: "done", outcome: "limit" });
}
