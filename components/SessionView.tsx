"use client";

import type { ErrorKind } from "@/lib/api";
import type { Program } from "@/lib/geometry/dsl";
import type { Frame, SessionState } from "@/lib/refine/session";
import { MAX_REVIEWS } from "@/lib/refine/types";

const frameName = (index: number) => (index === 0 ? "First draft" : `Revision ${index}`);

const ERROR_TITLE: Record<ErrorKind, string> = {
  demo_miss: "Nothing recorded for that request",
  auth: "That key did not work",
  rate_limit: "Slow down a moment",
  refusal: "Request declined",
  invalid: "Request not accepted",
  too_large: "Render too large to send",
  server: "The session stopped",
};

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-1 size-3 shrink-0 text-success">
      <path d="M2.5 8.5 6.2 12 13.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Gap() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-1 size-3 shrink-0 text-accent">
      <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Ten cells, filled up to the score. */
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div aria-hidden className="grid flex-1 grid-cols-10 gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-1.5 ${i < score ? "bg-fg" : "bg-border"}`} />
        ))}
      </div>
      <p className="font-mono text-sm tabular-nums">
        <span className="sr-only">Score </span>
        <span className="font-semibold">{score}</span>
        <span className="text-muted">/10</span>
      </p>
    </div>
  );
}

function FrameCard({
  frame,
  reviewing,
  onOpen,
}: {
  frame: Frame;
  reviewing: boolean;
  onOpen: (program: Program) => void;
}) {
  const { critique } = frame;
  return (
    <li className="rise flex min-w-0 flex-col gap-3" data-frame={frame.index}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{frameName(frame.index)}</h3>
        <button
          type="button"
          onClick={() => onOpen(frame.program)}
          className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Open in studio
        </button>
      </div>
      <div className="border border-black/80 bg-white p-1.5 shadow-frame">
        {/* A data URL made in this browser; next/image has nothing to optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.image}
          alt={`${frameName(frame.index)}: the render Claude reviewed`}
          className="block aspect-square w-full"
        />
      </div>

      {critique ? (
        <div className="rise flex flex-col gap-3">
          <ScoreBar score={critique.score} />
          {critique.matches.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-[13px] leading-5">
              {critique.matches.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check />
                  <span>
                    <span className="sr-only">Matches: </span>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {critique.gaps.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-[13px] leading-5">
              {critique.gaps.map((item) => (
                <li key={item} className="flex gap-2">
                  <Gap />
                  <span>
                    <span className="sr-only">Gap: </span>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {critique.done && (
            <p className="border-l-2 border-success pl-2.5 text-[13px] leading-5 text-muted">
              Claude judged this a match and stopped.
            </p>
          )}
        </div>
      ) : reviewing ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
          Claude is looking at this render…
        </p>
      ) : null}

      {frame.changes.length > 0 && (
        <details className="text-[13px] leading-5">
          <summary className="cursor-pointer text-muted hover:text-fg">
            {frame.changes.length} {frame.changes.length === 1 ? "change" : "changes"} to the
            program
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 font-mono text-[11px] leading-4 text-muted">
            {frame.changes.slice(0, 12).map((change) => (
              <li key={change}>{change}</li>
            ))}
            {frame.changes.length > 12 && <li>and {frame.changes.length - 12} more</li>}
          </ul>
        </details>
      )}
      {frame.corrected && (
        <p className="text-xs leading-5 text-muted">
          Claude&apos;s first attempt at this program failed validation; it fixed it from the
          validator&apos;s error messages.
        </p>
      )}
    </li>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-3" aria-hidden>
      <div className="h-5" />
      <div className="border border-dashed border-border p-1.5">
        <div className="flex aspect-square w-full items-center justify-center bg-bg/60 p-4 text-center text-[13px] text-muted">
          <span className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            {label}
          </span>
        </div>
      </div>
    </li>
  );
}

function summary(session: SessionState): string | null {
  const last = session.frames.at(-1);
  const score = last?.critique?.score;
  const reviews = session.frames.filter((f) => f.critique).length;
  switch (session.outcome) {
    case "matched":
      return `Matched after ${reviews} ${reviews === 1 ? "review" : "reviews"}, at ${score}/10.`;
    case "limit":
      return `Stopped at the limit of ${MAX_REVIEWS} reviews, at ${score}/10.`;
    case "unchanged":
      return `Claude had nothing more to change, at ${score}/10.`;
    case "stopped":
      return "Stopped.";
    default:
      return null;
  }
}

interface SessionViewProps {
  session: SessionState;
  onOpen: (program: Program) => void;
  onAddKey: () => void;
}

/** Iterations side by side: each render, Claude's critique of it, and its score. */
export function SessionView({ session, onOpen, onAddKey }: SessionViewProps) {
  const { phase, frames } = session;
  const busy = phase === "writing" || phase === "drawing" || phase === "reviewing";
  const pending =
    phase === "writing"
      ? "Claude is writing the first program…"
      : phase === "drawing"
        ? frames.length === 0
          ? "Drawing the first draft…"
          : "Drawing the revision…"
        : null;
  const reviewed = frames.at(-1);
  const text = summary(session);

  return (
    <div
      className="flex flex-col gap-5"
      data-refine-phase={phase}
      data-refine-outcome={session.outcome ?? ""}
    >
      {phase === "error" && session.error && (
        <div role="alert" className="border-l-2 border-danger bg-bg px-4 py-3 text-sm leading-6">
          <p className="font-semibold text-danger">{ERROR_TITLE[session.error.kind]}</p>
          <p className="text-muted">{session.error.message}</p>
          {frames.length > 0 && (
            <p className="text-muted">The steps that finished before the error are kept below.</p>
          )}
          {(session.error.kind === "auth" || session.error.kind === "demo_miss") && (
            <button
              type="button"
              onClick={onAddKey}
              className="mt-1 font-medium underline underline-offset-4"
            >
              {session.error.kind === "auth" ? "Change key" : "Add your key"}
            </button>
          )}
        </div>
      )}

      <ol className="grid gap-x-5 gap-y-8 sm:grid-cols-3">
        {frames.map((frame) => (
          <FrameCard
            key={frame.index}
            frame={frame}
            reviewing={phase === "reviewing" && frame === reviewed}
            onOpen={onOpen}
          />
        ))}
        {pending && <Pending label={pending} />}
      </ol>

      <div aria-live="polite" className="text-sm leading-6">
        {busy && (
          <p className="sr-only">
            {phase === "writing"
              ? "Claude is writing the first program."
              : phase === "drawing"
                ? "Drawing."
                : `Review ${session.review} of ${MAX_REVIEWS}: Claude is looking at the render.`}
          </p>
        )}
        {phase === "done" && text && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
            <p className="font-medium">{text}</p>
            {session.proposal && (
              <p className="text-muted">
                Its last review proposed one more revision, which no one has checked.{" "}
                <button
                  type="button"
                  onClick={() => onOpen(session.proposal as Program)}
                  className="font-medium text-fg underline underline-offset-4"
                >
                  Open the unreviewed revision
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
