"use client";

import { useId } from "react";
import { randomSeed } from "@/lib/browser";
import { LIMITS, type Program } from "@/lib/geometry/dsl";
import type { Scene } from "@/lib/geometry/pipeline";

const count = new Intl.NumberFormat("en-US");

interface ProgramPanelProps {
  program: Program;
  scene: Scene;
  errors: string[];
  warnings: string[];
  onChange: (program: Program) => void;
}

/** Seed, colours, and what the validator has to say about the current program. */
export function ProgramPanel({ program, scene, errors, warnings, onChange }: ProgramPanelProps) {
  const ids = useId();
  const usesSeed = program.layers.some(
    (l) => l.generator === "voronoi" || l.generator === "subdivision",
  );
  const duplicates = scene.stats.layers.reduce((sum, layer) => sum + layer.duplicates, 0);

  const setColor = (index: number, color: string) =>
    onChange({ ...program, palette: program.palette.map((c, i) => (i === index ? color : c)) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="label">Colours</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col items-center gap-1 text-[11px] text-muted">
            <input
              type="color"
              value={program.background}
              onChange={(event) => onChange({ ...program, background: event.target.value })}
              className="size-9 cursor-pointer border border-border bg-bg p-0.5"
            />
            Paper
          </label>
          {program.palette.map((color, index) => (
            <label key={index} className="flex flex-col items-center gap-1 text-[11px] text-muted">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(index, event.target.value)}
                className="size-9 cursor-pointer border border-border bg-bg p-0.5"
              />
              {index + 1}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-seed`} className="label">
          Seed
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${ids}-seed`}
            type="number"
            min={0}
            max={LIMITS.maxSeed}
            value={program.seed}
            onChange={(event) => onChange({ ...program, seed: Number(event.target.value) || 0 })}
            className="w-28 border border-border bg-bg px-2.5 py-2 font-mono text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={() => onChange({ ...program, seed: randomSeed() })}
            className="border border-border px-3 py-2 text-[13px] font-medium hover:border-fg"
          >
            New seed
          </button>
        </div>
        <p className="text-xs leading-5 text-muted">
          {usesSeed
            ? "Same seed, same artwork. A new seed reshuffles the random layers."
            : "This program has no random layers, so the seed changes nothing."}
        </p>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <h3 className="label">Validator</h3>
        {errors.length > 0 ? (
          <div className="border-l-2 border-danger pl-3 text-[13px] leading-5">
            <p className="font-medium text-danger">Not drawn. Showing the last valid version.</p>
            <ul className="mt-1 list-disc pl-4 text-muted">
              {errors.slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[13px] leading-5 text-muted">
            <span className="text-fg">
              {count.format(scene.stats.paths)} {scene.stats.paths === 1 ? "shape" : "shapes"},{" "}
              {count.format(scene.stats.vertices)} points.
            </span>{" "}
            The cap is {count.format(LIMITS.maxPaths)} shapes, checked before anything is drawn.
            {duplicates > 0 &&
              ` ${count.format(duplicates)} copies that symmetry stacked exactly on top of another were dropped.`}
          </p>
        )}
        {warnings.length > 0 && errors.length === 0 && (
          <ul className="list-disc pl-4 text-xs leading-5 text-muted">
            {warnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
