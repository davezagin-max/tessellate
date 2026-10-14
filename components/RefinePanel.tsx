"use client";

import { useId } from "react";
import { CostMeter } from "@/components/kit/CostMeter";
import type { SessionState } from "@/lib/refine/session";
import { RECORDED_SESSIONS } from "@/lib/refine/sessions";
import { EFFORTS, LIMITS, MAX_REVIEWS, type RefineEffort } from "@/lib/refine/types";

/** How many gallery presets ship with a session to replay. */
const SESSION_PRESETS = new Set(RECORDED_SESSIONS.map((session) => session.preset)).size;

/** One plain line per effort level; the trade-off itself is explained above the selector. */
const EFFORT_NOTE: Record<RefineEffort, string> = {
  low: "Low: fastest and cheapest.",
  medium: "Medium: a middle ground.",
  high: "High: the most thinking, so the slowest and most expensive.",
};

interface RefinePanelProps {
  prompt: string;
  onPrompt: (prompt: string) => void;
  /** True when the visitor can type a prompt: a key is set (or fixtures are being recorded). */
  canWrite: boolean;
  /** True when the session on screen replays hand-written fixtures, not a model run. */
  sample: boolean;
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

/** What is happening right now, in plain words. A replay describes the step; it does not claim a live call. */
function narrate(session: SessionState, replay: boolean, sample: boolean): string | null {
  const round = `round ${session.review} of ${MAX_REVIEWS}`;
  if (!replay) {
    switch (session.phase) {
      case "writing":
        return "Claude is writing a first drawing program from the request…";
      case "drawing":
        return "Your browser is drawing Claude's program…";
      case "reviewing":
        return `Claude is looking at its own drawing to critique and improve it (${round})…`;
      default:
        return null;
    }
  }
  // A sample was written by hand, so its narration never says Claude did it.
  const lead = sample ? "Sample replay" : "Replay";
  switch (session.phase) {
    case "writing":
      return sample
        ? `${lead}: the first draft of the drawing program…`
        : `${lead}: Claude writes a first drawing program…`;
    case "drawing":
      return `${lead}: your browser draws the program…`;
    case "reviewing":
      return sample
        ? `${lead}, ${round}: a critique of the drawing, then a revision…`
        : `${lead}, ${round}: Claude critiques its own drawing and revises it…`;
    default:
      return null;
  }
}

/** The one big button, what is happening, the request, and how hard Claude thinks. */
export function RefinePanel({
  prompt,
  onPrompt,
  canWrite,
  sample,
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
  const status = narrate(session, !canWrite, sample);
  const replayKind = sampleData ? "sample replay" : "recorded session";

  const hint = canWrite
    ? `Claude writes a first draft, then critiques and revises it up to ${MAX_REVIEWS} times. The cost shows here.`
    : replayable
      ? `Replays a ${sampleData ? "sample " : ""}session step by step: a first draft, then up to ${MAX_REVIEWS} rounds of critique. No key needed.`
      : null;

  const action = (
    <div className="flex flex-col gap-2">
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
          {ran ? "Run it again" : "Draw and refine it"}
        </button>
      ) : replayable ? (
        <button
          type="button"
          data-testid="refine"
          onClick={onStart}
          className="bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg hover:opacity-90"
        >
          {ran ? "Watch it again" : "Watch Claude draw and refine this"}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onAddKey}
            className="border border-fg px-4 py-3 text-[15px] font-semibold hover:bg-surface"
          >
            Add your API key to refine this one
          </button>
          <p className="text-xs leading-5 text-muted">
            There is no {replayKind} for this pattern. The {SESSION_PRESETS} patterns marked with a
            dot in the gallery have one.
          </p>
        </>
      )}
      <div className="min-h-5" aria-live="polite">
        {status ? (
          <p className="flex items-start gap-2 text-[13px] leading-5 text-muted">
            <span
              aria-hidden
              className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-accent"
            />
            {status}
          </p>
        ) : session.meta ? (
          <CostMeter meta={session.meta} />
        ) : hint ? (
          <p className="text-xs leading-5 text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );

  const request = canWrite ? (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${ids}-prompt`} className="label">
        Describe a pattern
      </label>
      <textarea
        id={`${ids}-prompt`}
        value={prompt}
        onChange={(event) => onPrompt(event.target.value)}
        maxLength={LIMITS.promptChars}
        rows={4}
        disabled={busy}
        placeholder="Its shapes, symmetry, colours, and line weight."
        className="w-full resize-y border border-border bg-bg px-3 py-2.5 text-[15px] leading-6 disabled:opacity-60"
      />
      <p className="text-right font-mono text-[11px] text-muted">
        {prompt.length}/{LIMITS.promptChars}
      </p>
    </div>
  ) : (
    <div className="flex flex-col gap-1.5">
      <h3 className="label">The request</h3>
      <p className="text-[15px] leading-6">{prompt}</p>
      <p className="text-xs leading-5 text-muted">
        Replays use a fixed request.{" "}
        <button type="button" onClick={onAddKey} className="text-fg underline underline-offset-2">
          Add your key
        </button>{" "}
        to write your own.
      </p>
    </div>
  );

  const effortPicker = (
    <fieldset
      className="flex flex-col gap-2"
      disabled={busy}
      aria-describedby={`${ids}-effort-what`}
    >
      <legend className="label mb-1">Thinking effort</legend>
      <p id={`${ids}-effort-what`} className="text-xs leading-5 text-muted">
        How long Claude thinks before each answer. More thinking can catch more problems, but it is
        slower and costs more.
      </p>
      <div className="grid grid-cols-3 border border-border">
        {EFFORTS.map((level) => {
          const available = canWrite || recorded.includes(level);
          return (
            <label
              key={level}
              title={
                available
                  ? EFFORT_NOTE[level]
                  : `There is no ${replayKind} at this effort. Add a key to use it.`
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
            ? " Effort applies once you run this with your own key."
            : recorded.length === 1
              ? ` This pattern's ${replayKind} is at ${recorded[0]} effort; add a key for the others.`
              : recorded.length < EFFORTS.length &&
                ` ${sampleData ? "Sample replays" : "Recorded sessions"} for this pattern: ${recorded.join(" and ")}.`)}
      </p>
    </fieldset>
  );

  // With a key you write the request, pick an effort, then run. Without one the
  // button comes first, so it stays on the first screen of a phone.
  return (
    <div className="flex flex-col gap-5">
      {canWrite ? (
        <>
          {request}
          {effortPicker}
          {action}
        </>
      ) : (
        <>
          {action}
          {request}
          {effortPicker}
        </>
      )}
    </div>
  );
}
