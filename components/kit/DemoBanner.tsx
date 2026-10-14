"use client";

import { useKey } from "./KeyProvider";

interface DemoBannerProps {
  /**
   * True while the fixtures are hand-written samples rather than recorded
   * model runs. The banner says so plainly instead of implying a real run.
   */
  placeholder?: boolean;
  /** Set to false for projects whose core features need no key at all. */
  aiRequired?: boolean;
  /**
   * Demo-mode wording for this app, one sentence each. `placeholder` still
   * decides which one is shown.
   */
  demoLabels?: { sample: string; recorded: string };
}

/**
 * One calm line at the top of the page: what the visitor is looking at
 * (pre-written examples, or recorded runs) and how to run it live.
 */
export function DemoBanner({
  placeholder = false,
  aiRequired = true,
  demoLabels,
}: DemoBannerProps) {
  const { isLive, openKeyModal } = useKey();

  if (isLive) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-1.5 text-xs sm:text-[13px]">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-success" />
          Live: each run calls Claude Opus 5.5 with your API key.
        </span>
        <button type="button" onClick={openKeyModal} className="underline underline-offset-2">
          Change key
        </button>
      </div>
    );
  }

  const message = !aiRequired
    ? "Everything here works without a key."
    : placeholder
      ? (demoLabels?.sample ?? "Demo: the AI responses here are pre-written examples.")
      : (demoLabels?.recorded ?? "Demo: the AI responses here are replays of real runs.");

  return (
    <div
      role="status"
      className="border-b border-border bg-surface px-4 py-1.5 text-center text-xs leading-5 text-muted sm:text-[13px]"
    >
      {message}{" "}
      <button
        type="button"
        onClick={openKeyModal}
        className="font-medium text-fg underline underline-offset-2 hover:text-accent"
      >
        Add your Anthropic API key
      </button>{" "}
      {aiRequired ? "to run it live." : "to turn on the Claude Opus 5.5 features."}
    </div>
  );
}
