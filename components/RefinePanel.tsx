"use client";

import { useId } from "react";
import { CostMeter } from "@/components/kit/CostMeter";
import type { SessionState } from "@/lib/refine/session";
import { RECORDED_SESSIONS } from "@/lib/refine/sessions";
import { EFFORTS, LIMITS, MAX_REVIEWS, type RefineEffort } from "@/lib/refine/types";

/** How many gallery presets ship with a session to replay. */
const SESSION_PRESETS = new Set(RECORDED_SESSIONS.map((session) => session.preset)).size;

const EFFORT_NOTE: Record<RefineEffort, string> = {
  low: "Fastest and cheapest. Thinks least before answering.",
  medium: "A balance of cost and care.",
  high: "Thinks longest before answering. Slowest and most expensive.",
};

interface RefinePanelProps {
  prompt: string;
  onPrompt: (prompt: string) => void;
  /** True when the visitor can type a prompt: a key is set (or fixtures are being recorded). */
  canWrite: boolean;
  effort: RefineEffort;
  onEffort: (effort: RefineEffort) => void;
  /** Efforts with a recorded session for the current preset. Only consulted in demo mode. */
  recorded: RefineEffort[];
  /** True while those sessions are hand-written samples, so the copy never calls them recorded. */
  sampleData: boolean;
  session: SessionState;
  onStart: () => void;
  onStop: () => void;
  onAddKey: () => void;
}

/** Prompt, effort, the one big button, and what the run cost. */
export function RefinePanel({
  prompt,
  onPrompt,
  canWrite,
  effort,
  onEffort,
  recorded,
  sampleData,
  session,
  onStart,
  onStop,
  onAddKey,
}: RefinePanelProps) {
  const ids = useId();
  const busy =
    session.phase === "writing" || session.phase === "drawing" || session.phase === "reviewing";
  const replayable = recorded.includes(effort);
  const ran = session.phase === "done" || session.phase === "error";

  const status =
    session.phase === "writing"
      ? "Writing the first program…"
      : session.phase === "drawing"
        ? "Drawing…"
        : session.phase === "reviewing"
          ? `Review ${session.review} of ${MAX_REVIEWS}: looking at the render…`
          : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-prompt`} className="label">
          Prompt
        </label>
        {canWrite ? (
          <>
            <textarea
              id={`${ids}-prompt`}
              value={prompt}
              onChange={(event) => onPrompt(event.target.value)}
              maxLength={LIMITS.promptChars}
              rows={4}
              disabled={busy}
              placeholder="Describe a pattern: its shapes, symmetry, colours, and line weight."
              className="w-full resize-y border border-border bg-bg px-3 py-2.5 text-[15px] leading-6 disabled:opacity-60"
            />
            <p className="text-right font-mono text-[11px] text-muted">
              {prompt.length}/{LIMITS.promptChars}
            </p>
          </>
        ) : (
          <>
            <p id={`${ids}-prompt`} className="text-[15px] leading-6">
              {prompt}
            </p>
            <p className="text-xs leading-5 text-muted">
              Demo mode replays {sampleData ? "sample" : "recorded"} sessions, so the prompt is
              fixed.{" "}
              <button
                type="button"
                onClick={onAddKey}
                className="text-fg underline underline-offset-2"
              >
                Add your key
              </button>{" "}
              to write your own.
            </p>
          </>
        )}
      </div>

      <fieldset className="flex flex-col gap-1.5" disabled={busy}>
        <legend className="label mb-1.5">Effort</legend>
        <div className="grid grid-cols-3 border border-border">
          {EFFORTS.map((level) => {
            const available = canWrite || recorded.includes(level);
            return (
              <label
                key={level}
                title={
                  available
                    ? EFFORT_NOTE[level]
                    : sampleData
                      ? "There is no sample session at this effort. Add a key to use it."
                      : "No session was recorded at this effort. Add a key to use it."
                }
                className={`relative border-l border-border text-center text-[13px] first:border-l-0 ${
                  available ? "cursor-pointer" : "cursor-not-allowed"
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-effort`}
                  value={level}
                  checked={effort === level}
                  disabled={!available}
                  onChange={() => onEffort(level)}
                  className="peer sr-only"
                />
                <span className="block px-2 py-2 capitalize text-muted peer-checked:bg-fg peer-checked:font-medium peer-checked:text-bg peer-disabled:opacity-40 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {level}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs leading-5 text-muted">
          {EFFORT_NOTE[effort]}
          {!canWrite &&
            (recorded.length === 0
              ? " Effort applies once you run this with a key."
              : recorded.length < EFFORTS.length &&
                ` ${sampleData ? "Sample sessions" : "Recorded"} for this preset: ${recorded.join(" and ")}.`)}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2.5">
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="border border-fg px-4 py-3 text-[15px] font-semibold hover:bg-surface"
          >
            Stop
          </button>
        ) : canWrite ? (
          <button
            type="button"
            data-testid="refine"
            onClick={onStart}
            disabled={prompt.trim() === ""}
            className="bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {ran ? "Run it again" : "Generate and refine"}
          </button>
        ) : replayable ? (
          <button
            type="button"
            data-testid="refine"
            onClick={onStart}
            className="bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg hover:opacity-90"
          >
            {ran ? "Replay the session" : "Watch Claude refine this"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onAddKey}
              className="border border-fg px-4 py-3 text-[15px] font-semibold hover:bg-surface"
            >
              Add a key to refine this
            </button>
            <p className="text-xs leading-5 text-muted">
              There is no session to replay for this one. The {SESSION_PRESETS} presets marked with
              a dot in the gallery have one.
            </p>
          </>
        )}
        <div className="min-h-5" aria-live="polite">
          {status ? (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
              {status}
            </p>
          ) : (
            <CostMeter meta={session.meta} />
          )}
        </div>
      </div>
    </div>
  );
}
