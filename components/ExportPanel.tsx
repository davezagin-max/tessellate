"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { downloadPng, downloadText, slugify } from "@/lib/browser";
import type { Program } from "@/lib/geometry/dsl";
import type { Scene } from "@/lib/geometry/pipeline";
import { sceneToPlot } from "@/lib/geometry/plotter";
import { sceneToSvg } from "@/lib/geometry/svg";

const PNG_SIZES = [1024, 2048, 4096];
const PAGE_SIZES = [100, 150, 200, 300];

const metres = (mm: number) =>
  mm >= 1000 ? `${(mm / 1000).toFixed(1)} m` : `${Math.round(mm)} mm`;
const count = new Intl.NumberFormat("en-US");

const button =
  "border border-border px-3 py-2 text-[13px] font-medium hover:border-fg disabled:opacity-40";

/** PNG, SVG, plotter SVG, and the program itself as JSON. */
export function ExportPanel({ program, scene }: { program: Program; scene: Scene }) {
  const ids = useId();
  const [pngSize, setPngSize] = useState(2048);
  const [pageMm, setPageMm] = useState(200);
  const [copied, setCopied] = useState(false);
  const name = `${slugify(program.title)}-${program.seed}`;

  // Plot planning (dedupe, chaining, ordering) is the only export step with real
  // cost, so it follows slider drags at low priority instead of blocking them.
  const settled = useDeferredValue(scene);
  const plot = useMemo(() => sceneToPlot(settled, { sizeMm: pageMm }), [settled, pageMm]);
  const { stats } = plot;
  const saved =
    stats.naiveTravelMm > 0 ? Math.round((1 - stats.travelMm / stats.naiveTravelMm) * 100) : 0;
  const json = useMemo(() => JSON.stringify(program, null, 2), [program]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="label">Image</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${ids}-png`} className="sr-only">
            PNG size
          </label>
          <select
            id={`${ids}-png`}
            value={pngSize}
            onChange={(event) => setPngSize(Number(event.target.value))}
            className="border border-border bg-bg px-2 py-2 text-[13px]"
          >
            {PNG_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            onClick={() => downloadPng(scene, pngSize, `${name}.png`)}
          >
            Download PNG
          </button>
          <button
            type="button"
            className={button}
            onClick={() => downloadText(`${name}.svg`, sceneToSvg(scene), "image/svg+xml")}
          >
            Download SVG
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="label">Pen plotter / laser cutter</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${ids}-page`} className="sr-only">
            Page size
          </label>
          <select
            id={`${ids}-page`}
            value={pageMm}
            onChange={(event) => setPageMm(Number(event.target.value))}
            className="border border-border bg-bg px-2 py-2 text-[13px]"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} mm page
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            disabled={stats.strokes === 0}
            onClick={() => downloadText(`${name}-plot.svg`, plot.svg, "image/svg+xml")}
          >
            Download plotter SVG
          </button>
        </div>
        <p className="text-xs leading-5 text-muted" data-testid="plot-stats">
          {stats.strokes === 0 ? (
            "Nothing to plot inside the page."
          ) : (
            <>
              Stroke-only, in millimetres, one layer per pen.{" "}
              <span className="text-fg">
                {stats.pens} {stats.pens === 1 ? "pen" : "pens"}, {count.format(stats.strokes)}{" "}
                {stats.strokes === 1 ? "stroke" : "strokes"}, {metres(stats.drawMm)} of line.
              </span>{" "}
              {stats.duplicateSegments > 0 &&
                `${count.format(stats.duplicateSegments)} shared edges are drawn once instead of twice. `}
              {saved > 0 &&
                `Stroke ordering cuts pen-up travel by ${saved}% (to ${metres(stats.travelMm)}).`}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="label">Program</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={copy}>
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => downloadText(`${name}.json`, `${json}\n`, "application/json")}
          >
            Download JSON
          </button>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">
            Show the program ({program.layers.length}{" "}
            {program.layers.length === 1 ? "layer" : "layers"})
          </summary>
          <pre
            tabIndex={0}
            className="mt-2 max-h-72 overflow-auto border border-border bg-surface p-3 font-mono text-[11px] leading-4"
          >
            {json}
          </pre>
        </details>
      </div>
    </div>
  );
}
