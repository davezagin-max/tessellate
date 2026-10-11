"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Program } from "@/lib/geometry/dsl";
import { buildScene, type Scene } from "@/lib/geometry/pipeline";
import { sceneToSvg } from "@/lib/geometry/svg";
import { validateProgram } from "@/lib/geometry/validate";
import { DEFAULT_PRESET, PRESET_BY_ID, type Preset } from "@/lib/presets";
import { ArtCanvas } from "./ArtCanvas";
import { Controls } from "./Controls";
import { ExportPanel } from "./ExportPanel";
import { PresetStrip } from "./PresetStrip";
import { ProgramPanel } from "./ProgramPanel";

/**
 * The query string as it was when the page loaded. Read once and cached, so
 * later `history.replaceState` calls (made when a preset is picked) do not
 * feed back into React and remount the studio.
 */
let loadedSearch: string | null = null;
const readSearch = () => (loadedSearch ??= window.location.search);
const noSearch = () => "";
const neverChanges = () => () => {};

interface Good {
  program: Program;
  scene: Scene;
}

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, noun: string) => `${count.format(n)} ${noun}${n === 1 ? "" : "s"}`;

function describe(program: Program): string {
  const symmetries = [
    ...new Set(program.layers.map((l) => l.symmetry).filter((s) => s !== "none")),
  ];
  const generators = [...new Set(program.layers.map((l) => l.generator))];
  const layers = `${program.layers.length} ${program.layers.length === 1 ? "layer" : "layers"}`;
  return [generators.join(" + "), symmetries.join(" + "), layers].filter(Boolean).join(" · ");
}

function StudioInner({ initialPreset }: { initialPreset: Preset }) {
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
    setPreset(next);
    setLayerIndex(0);
    edit(next.program);
    window.history.replaceState(null, "", `?preset=${next.id}`);
  };

  const editProgram = (next: Program) => {
    edit(next);
  };

  // Until the canvas paints, show the same artwork as an inline SVG so the
  // server-rendered page is not an empty frame.
  const poster = useMemo(
    () =>
      draft === initialPreset.program
        ? `data:image/svg+xml;utf8,${encodeURIComponent(sceneToSvg(good.scene))}`
        : null,
    [draft, initialPreset, good.scene],
  );

  const edited = preset !== null && draft !== preset.program;
  const title = good.program.title;

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-12">
        <figure className="flex min-w-0 flex-col items-center justify-center bg-wall px-4 py-6 sm:px-10 sm:py-10">
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

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="label">{preset && !edited ? "Preset" : "Your edit"}</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-sm text-muted">{describe(good.program)}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {plural(good.scene.stats.paths, "shape")} · seed {good.program.seed}
            </p>
          </div>
          {preset && (
            <div>
              <p className="label">Prompt</p>
              <p className="mt-1.5 text-[15px] leading-6">{preset.prompt}</p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="gallery-heading" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="gallery-heading" className="label">
            Gallery
          </h2>
          <p className="text-xs text-muted">Twelve programs, drawn live in your browser.</p>
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
            onChange={editProgram}
          />
          <div className="flex flex-col gap-8">
            <ProgramPanel
              program={draft}
              scene={good.scene}
              errors={issues.errors}
              warnings={issues.warnings}
              onChange={editProgram}
            />
            <div className="border-t border-border pt-6">
              <ExportPanel program={good.program} scene={good.scene} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** Reads `?preset=` once, then hands over to the studio proper. */
export function Studio() {
  const search = useSyncExternalStore(neverChanges, readSearch, noSearch);
  const requested = new URLSearchParams(search).get("preset");
  const preset = (requested && PRESET_BY_ID[requested]) || DEFAULT_PRESET;
  return <StudioInner key={preset.id} initialPreset={preset} />;
}
