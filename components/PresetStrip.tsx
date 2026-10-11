"use client";

import { useEffect, useRef } from "react";
import { paintScene } from "@/lib/geometry/canvas";
import { buildScene } from "@/lib/geometry/pipeline";
import { PRESETS, type Preset } from "@/lib/presets";

const THUMB_PIXELS = 208;

function Thumb({ preset, index }: { preset: Preset; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Build and paint after hydration, one thumbnail per frame, so twelve
    // scenes never block the first paint of the page.
    const timer = setTimeout(() => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) paintScene(ctx, buildScene(preset.program), THUMB_PIXELS);
    }, index * 24);
    return () => clearTimeout(timer);
  }, [preset, index]);

  return (
    <canvas
      ref={ref}
      width={THUMB_PIXELS}
      height={THUMB_PIXELS}
      aria-hidden
      className="block aspect-square w-full"
      style={{ background: preset.program.background }}
    />
  );
}

interface PresetStripProps {
  selectedId: string | null;
  onSelect: (preset: Preset) => void;
}

/** The gallery wall: twelve presets, each a real program rendered live. */
export function PresetStrip({ selectedId, onSelect }: PresetStripProps) {
  return (
    <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 lg:mx-0 lg:grid lg:grid-cols-12 lg:overflow-visible lg:px-0 lg:pb-0">
      {PRESETS.map((preset, index) => {
        const selected = preset.id === selectedId;
        return (
          <li key={preset.id} className="w-24 shrink-0 snap-start lg:w-auto">
            <button
              type="button"
              onClick={() => onSelect(preset)}
              aria-pressed={selected}
              title={
                preset.session ? `${preset.title} (recorded refinement session)` : preset.title
              }
              className="group block w-full text-left"
            >
              <span
                className={`relative block border bg-white p-1 transition-shadow ${
                  selected
                    ? "border-fg shadow-frame"
                    : "border-border group-hover:border-muted group-hover:shadow-frame"
                }`}
              >
                <Thumb preset={preset} index={index} />
                {preset.session && (
                  <span
                    aria-hidden
                    className="absolute right-0 top-0 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-bg bg-accent"
                  />
                )}
              </span>
              <span
                className={`mt-1.5 block truncate text-[11px] leading-4 ${selected ? "font-medium text-fg" : "text-muted group-hover:text-fg"}`}
              >
                {preset.title}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
