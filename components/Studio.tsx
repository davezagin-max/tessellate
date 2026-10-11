"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useKey } from "@/components/kit/KeyProvider";
import { renderForReview } from "@/lib/browser";
import { callApi } from "@/lib/client";
import type { Program } from "@/lib/geometry/dsl";
import { buildScene, type Scene } from "@/lib/geometry/pipeline";
import { sceneToSvg } from "@/lib/geometry/svg";
import { validateProgram } from "@/lib/geometry/validate";
import { DEFAULT_PRESET, PRESET_BY_ID, type Preset } from "@/lib/presets";
import { IDLE, runSession, type Phase, type SessionState } from "@/lib/refine/session";
import { recordedEfforts } from "@/lib/refine/sessions";
import { EFFORTS, LIMITS, type RefineEffort } from "@/lib/refine/types";
import { ArtCanvas } from "./ArtCanvas";
import { Controls } from "./Controls";
import { ExportPanel } from "./ExportPanel";
import { HowItWorks } from "./HowItWorks";
import { PresetStrip } from "./PresetStrip";
import { ProgramPanel } from "./ProgramPanel";
import { RefinePanel } from "./RefinePanel";
import { SessionView } from "./SessionView";

/**
 * The query string as it was when the page loaded. Read once and cached, so
 * later `history.replaceState` calls (made when a preset is picked) do not
 * feed back into React and remount the studio.
 */
let loadedSearch: string | null = null;
const readSearch = () => (loadedSearch ??= window.location.search);
const noSearch = () => "";
const neverChanges = () => () => {};

/** How long each step of a demo replay is held on screen, in milliseconds. */
const REPLAY_PACE: Partial<Record<Phase, number>> = {
  writing: 1100,
  drawing: 450,
  reviewing: 1500,
};

interface Good {
  program: Program;
  scene: Scene;
}

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, noun: string) => `${count.format(n)} ${noun}${n === 1 ? "" : "s"}`;
const sameProgram = (a: Program, b: Program) => a === b || JSON.stringify(a) === JSON.stringify(b);

function describe(program: Program): string {
  const symmetries = [
    ...new Set(program.layers.map((l) => l.symmetry).filter((s) => s !== "none")),
  ];
  const generators = [...new Set(program.layers.map((l) => l.generator))];
  const layers = `${program.layers.length} ${program.layers.length === 1 ? "layer" : "layers"}`;
  return [generators.join(" + "), symmetries.join(" + "), layers].filter(Boolean).join(" · ");
}

interface StudioInnerProps {
  initialPreset: Preset;
  initialEffort: RefineEffort | null;
  /** Set by `pnpm record` (`?record=1`): send fixture ids and the PNG even without a browser key. */
  recording: boolean;
}

function StudioInner({ initialPreset, initialEffort, recording }: StudioInnerProps) {
  const { apiKey, isLive, openKeyModal } = useKey();
  const canWrite = isLive || recording;

  const [preset, setPreset] = useState<Preset | null>(initialPreset);
  const [draft, setDraft] = useState<Program>(initialPreset.program);
  const [good, setGood] = useState<Good>(() => ({
    program: initialPreset.program,
    scene: buildScene(initialPreset.program),
  }));
  const [issues, setIssues] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const [layerIndex, setLayerIndex] = useState(0);

  const [prompt, setPrompt] = useState(initialPreset.prompt);
  const [chosenEffort, setChosenEffort] = useState<RefineEffort>(
    initialEffort ?? recordedEfforts(initialPreset.id)[0] ?? "medium",
  );
  const [session, setSession] = useState<SessionState>(IDLE);
  const [view, setView] = useState<"art" | "refine">("art");
  const abort = useRef<AbortController | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const recorded = preset && prompt === preset.prompt ? recordedEfforts(preset.id) : [];
  // Without a key only recorded efforts can run, so fall back to one of those.
  const effort =
    canWrite || recorded.includes(chosenEffort) ? chosenEffort : (recorded[0] ?? chosenEffort);

  /**
   * Every edit goes through the validator, exactly like model output does.
   * If the edit is invalid the last good render stays on screen and the
   * validator's message explains why.
   */
  const edit = (next: Program) => {
    setDraft(next);
    const result = validateProgram(next);
    if (!result.ok) {
      setIssues({ errors: result.errors, warnings: [] });
      return;
    }
    setGood({ program: result.program, scene: buildScene(result.program) });
    setIssues({ errors: [], warnings: result.warnings });
  };

  const selectPreset = (next: Preset) => {
    abort.current?.abort();
    abort.current = null;
    setPreset(next);
    setLayerIndex(0);
    setPrompt(next.prompt);
    setChosenEffort(recordedEfforts(next.id)[0] ?? chosenEffort);
    setSession(IDLE);
    setView("art");
    edit(next.program);
    window.history.replaceState(null, "", `?preset=${next.id}`);
  };

  const openInStudio = (program: Program) => {
    setLayerIndex(0);
    edit(program);
    setView("art");
    stage.current?.scrollIntoView({ block: "start" });
  };

  const start = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // A preset's own prompt maps to its recorded session; anything else is a fresh request.
    const demo = preset && prompt === preset.prompt && (!isLive || recording) ? preset.id : null;
    const replay = !canWrite;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setView("refine");
    setSession({ ...IDLE, phase: "writing" });
    // On a phone the button sits below the artwork; bring the stage back into view.
    const top = stage.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.6) {
      stage.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    }

    const final = await runSession({
      prompt: prompt.trim(),
      effort,
      demo,
      includeImage: canWrite,
      api: <D,>(path: string, body: unknown, signal?: AbortSignal) =>
        callApi<D>(path, body, apiKey, signal),
      render: (program) => renderForReview(buildScene(program), LIMITS.imageChars),
      onState: (state) => {
        // Ignore a run that was replaced (a new preset, a new run) rather than stopped.
        if (abort.current === controller) setSession(state);
      },
      pause: replay
        ? (phase) =>
            new Promise((resolve) =>
              setTimeout(resolve, (REPLAY_PACE[phase] ?? 0) / (calm ? 4 : 1)),
            )
        : undefined,
      signal: controller.signal,
    });

    // Put the result on the main canvas so the sliders and exports apply to it.
    const last = final.frames.at(-1);
    if (
      final.phase === "done" &&
      final.outcome !== "stopped" &&
      last &&
      abort.current === controller
    ) {
      if (preset && sameProgram(last.program, preset.program)) edit(preset.program);
      else edit(last.program);
      setLayerIndex(0);
      // A fresh live run replaced the preset on the canvas, so nothing in the gallery is selected.
      if (demo === null) setPreset(null);
    }
  };

  const stop = () => abort.current?.abort();

  // Until the canvas paints, show the same artwork as an inline SVG so the
  // server-rendered page is not an empty frame.
  const poster = useMemo(
    () =>
      draft === initialPreset.program
        ? `data:image/svg+xml;utf8,${encodeURIComponent(sceneToSvg(good.scene))}`
        : null,
    [draft, initialPreset, good.scene],
  );

  const pristine = preset !== null && draft === preset.program;
  const title = good.program.title;
  const hasSession = session.phase !== "idle";
  // Where the program on the canvas came from, for the caption.
  const origin = pristine
    ? "Preset"
    : draft === session.proposal
      ? "Claude's unreviewed revision"
      : session.frames.some((frame) => frame.program === draft)
        ? "Written by Claude"
        : "Edited by hand";

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-12">
        <div ref={stage} className="flex min-w-0 scroll-mt-4 flex-col">
          {hasSession && (
            <div
              role="group"
              aria-label="Stage view"
              className="flex border-b border-border bg-wall px-2 pt-2"
            >
              {(
                [
                  ["art", "Artwork"],
                  ["refine", "Refinement"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={`-mb-px border border-b-0 px-4 py-2 text-[13px] ${
                    view === id
                      ? "border-border bg-bg font-medium text-fg"
                      : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === "refine" && hasSession ? (
            <div className="flex-1 bg-wall px-4 py-6 sm:px-6">
              <SessionView session={session} onOpen={openInStudio} onAddKey={openKeyModal} />
            </div>
          ) : (
            <figure className="flex flex-1 flex-col items-center justify-center bg-wall px-4 py-6 sm:px-10 sm:py-10">
              <div className="relative w-full max-w-[min(100%,36rem,max(18rem,calc(100dvh-23rem)))] border border-black/80 bg-white p-2.5 shadow-frame sm:p-4">
                <div className="relative">
                  {poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" aria-hidden className="absolute inset-0 size-full" />
                  )}
                  <ArtCanvas
                    scene={good.scene}
                    label={`${title}: ${describe(good.program)}`}
                    className="relative"
                  />
                </div>
              </div>
            </figure>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="label">{origin}</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-sm text-muted">{describe(good.program)}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {plural(good.scene.stats.paths, "shape")} · seed {good.program.seed}
            </p>
          </div>
          <RefinePanel
            prompt={prompt}
            onPrompt={setPrompt}
            canWrite={canWrite}
            effort={effort}
            onEffort={setChosenEffort}
            recorded={recorded}
            session={session}
            onStart={start}
            onStop={stop}
            onAddKey={openKeyModal}
          />
        </div>
      </section>

      <section aria-labelledby="gallery-heading" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="gallery-heading" className="label">
            Gallery
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            has a recorded refinement session
          </p>
        </div>
        <PresetStrip selectedId={preset?.id ?? null} onSelect={selectPreset} />
      </section>

      <section aria-labelledby="tune-heading" className="mt-14 border-t border-border pt-10">
        <div className="mb-6 max-w-2xl">
          <h2 id="tune-heading" className="text-xl font-semibold tracking-tight">
            Tune it by hand
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            The artwork is a small program, not an image. Every control below edits that program,
            and each edit passes the same validator that checks what Claude writes.
          </p>
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-12">
          <Controls
            program={draft}
            layerIndex={layerIndex}
            onLayerIndex={setLayerIndex}
            onChange={edit}
          />
          <div className="flex flex-col gap-8">
            <ProgramPanel
              program={draft}
              scene={good.scene}
              errors={issues.errors}
              warnings={issues.warnings}
              onChange={edit}
            />
            <div className="border-t border-border pt-6">
              <ExportPanel program={good.program} scene={good.scene} />
            </div>
          </div>
        </div>
      </section>
      <HowItWorks />
    </>
  );
}

/** Reads `?preset=`, `?effort=`, and `?record=` once, then hands over to the studio proper. */
export function Studio() {
  const search = useSyncExternalStore(neverChanges, readSearch, noSearch);
  const params = new URLSearchParams(search);
  const requested = params.get("preset");
  const preset = (requested && PRESET_BY_ID[requested]) || DEFAULT_PRESET;
  const effort = EFFORTS.find((level) => level === params.get("effort")) ?? null;
  return (
    <StudioInner
      key={`${preset.id}:${effort}`}
      initialPreset={preset}
      initialEffort={effort}
      recording={params.has("record")}
    />
  );
}
