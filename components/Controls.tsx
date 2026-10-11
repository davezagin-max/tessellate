"use client";

import { useId } from "react";
import {
  FLAG_DOCS,
  GENERATORS,
  GENERATOR_DOCS,
  LIMITS,
  PARAMS,
  SYMMETRIES,
  SYMMETRY_DOCS,
  paramApplies,
  rangeFor,
  type Generator,
  type Layer,
  type ParamSpec,
  type Program,
  type Symmetry,
} from "@/lib/geometry/dsl";

const GROUPS: { id: ParamSpec["group"]; title: string }[] = [
  { id: "shape", title: "Shape" },
  { id: "placement", title: "Placement" },
  { id: "repeat", title: "Nested copies" },
  { id: "symmetry", title: "Lattice and order" },
  { id: "style", title: "Style" },
];

const PEN_KEYS = ["stroke", "fill", "altFill"] as const;
type PenKey = (typeof PEN_KEYS)[number];
const isPen = (key: string): key is PenKey => (PEN_KEYS as readonly string[]).includes(key);

const show = (value: number, spec: ParamSpec) =>
  spec.integer ? String(value) : value.toFixed(spec.step < 0.01 ? 3 : 2);

/** Sensible starting values when a layer switches to a generator it was not set up for. */
function withGenerator(layer: Layer, generator: Generator): Layer {
  const next = { ...layer, generator };
  if (generator === "lsystem" && layer.axiom === "") {
    return { ...next, axiom: "F--F--F", rules: "F=F+F--F+F", angle: 60, depth: 3 };
  }
  if (generator === "penrose") return { ...next, depth: Math.min(layer.depth, 5) };
  if (generator === "subdivision") {
    return {
      ...next,
      sides: Math.min(Math.max(layer.sides, 3), 8),
      depth: Math.min(layer.depth, 6),
    };
  }
  return next;
}

function Slider({
  spec,
  layer,
  onChange,
}: {
  spec: ParamSpec;
  layer: Layer;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const { min, max } = rangeFor(spec, layer.generator);
  const value = layer[spec.key];
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.25rem] items-center gap-x-3">
      <label htmlFor={id} className="truncate text-[13px]" title={spec.doc}>
        {spec.label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={spec.step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-5 w-full min-w-0"
      />
      <output htmlFor={id} className="text-right font-mono text-xs tabular-nums text-muted">
        {show(value, spec)}
      </output>
    </div>
  );
}

function PenPicker({
  spec,
  value,
  palette,
  onChange,
}: {
  spec: ParamSpec;
  value: number;
  palette: string[];
  onChange: (value: number) => void;
}) {
  const name = useId();
  const options = [-1, ...palette.map((_, i) => i)];
  return (
    <fieldset className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3">
      <legend className="float-left text-[13px]" title={spec.doc}>
        {spec.label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const label = option < 0 ? "None" : `Colour ${option + 1}`;
          return (
            <label key={option} className="cursor-pointer" title={label}>
              <input
                type="radio"
                name={name}
                checked={value === option}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              <span
                className="block size-6 border border-border peer-checked:ring-2 peer-checked:ring-fg peer-checked:ring-offset-2 peer-checked:ring-offset-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent"
                style={
                  option < 0
                    ? {
                        background:
                          "linear-gradient(to top right, transparent calc(50% - 1px), var(--muted) calc(50% - 1px), var(--muted) calc(50% + 1px), transparent calc(50% + 1px))",
                      }
                    : { background: palette[option] }
                }
              />
              <span className="sr-only">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface ControlsProps {
  program: Program;
  layerIndex: number;
  onLayerIndex: (index: number) => void;
  onChange: (program: Program) => void;
}

/**
 * The parameter panel. It is generated from the same `PARAMS` table the
 * validator uses, and only shows the controls the selected layer reads.
 */
export function Controls({ program, layerIndex, onLayerIndex, onChange }: ControlsProps) {
  const ids = useId();
  const index = Math.min(layerIndex, program.layers.length - 1);
  const layer = program.layers[index];

  const setLayer = (next: Layer) =>
    onChange({ ...program, layers: program.layers.map((l, i) => (i === index ? next : l)) });
  const set = <K extends keyof Layer>(key: K, value: Layer[K]) =>
    setLayer({ ...layer, [key]: value });

  const duplicate = () => {
    const layers = [...program.layers];
    layers.splice(index + 1, 0, { ...layer });
    onChange({ ...program, layers });
    onLayerIndex(index + 1);
  };
  const remove = () => {
    onChange({ ...program, layers: program.layers.filter((_, i) => i !== index) });
    onLayerIndex(Math.max(0, index - 1));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Layers" className="flex flex-wrap gap-1.5">
          {program.layers.map((l, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => onLayerIndex(i)}
              className={`border px-2.5 py-1.5 text-[13px] ${
                i === index
                  ? "border-fg bg-fg text-bg"
                  : "border-border text-muted hover:border-muted hover:text-fg"
              }`}
            >
              <span className="font-mono text-xs">{i + 1}</span> {l.generator}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={duplicate}
            disabled={program.layers.length >= LIMITS.maxLayers}
            className="border border-border px-2.5 py-1.5 text-[13px] hover:border-muted disabled:opacity-40"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={program.layers.length <= 1}
            className="border border-border px-2.5 py-1.5 text-[13px] hover:border-muted disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-generator`} className="label">
            Generator
          </label>
          <select
            id={`${ids}-generator`}
            value={layer.generator}
            onChange={(event) => setLayer(withGenerator(layer, event.target.value as Generator))}
            className="border border-border bg-bg px-2.5 py-2 text-sm"
          >
            {GENERATORS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-muted">
            {GENERATOR_DOCS[layer.generator].split(". ")[0]}.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-symmetry`} className="label">
            Symmetry
          </label>
          <select
            id={`${ids}-symmetry`}
            value={layer.symmetry}
            onChange={(event) => set("symmetry", event.target.value as Symmetry)}
            className="border border-border bg-bg px-2.5 py-2 text-sm"
          >
            {SYMMETRIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-muted">{SYMMETRY_DOCS[layer.symmetry]}</p>
        </div>
      </div>

      {layer.generator === "lsystem" && (
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-axiom`} className="label">
              Axiom
            </label>
            <input
              id={`${ids}-axiom`}
              value={layer.axiom}
              maxLength={LIMITS.maxAxiom}
              spellCheck={false}
              onChange={(event) => set("axiom", event.target.value)}
              className="border border-border bg-bg px-2.5 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-rules`} className="label">
              Rules
            </label>
            <input
              id={`${ids}-rules`}
              value={layer.rules}
              maxLength={LIMITS.maxRules}
              spellCheck={false}
              onChange={(event) => set("rules", event.target.value)}
              className="border border-border bg-bg px-2.5 py-2 font-mono text-sm"
            />
          </div>
        </div>
      )}

      <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
        {GROUPS.map((group) => {
          const specs = PARAMS.filter(
            (spec) => spec.group === group.id && paramApplies(spec, layer),
          );
          const flags =
            (group.id === "repeat" && layer.repeat > 1) ||
            (group.id === "symmetry" && layer.symmetry === "radial");
          if (specs.length === 0 && !flags) return null;
          return (
            <section key={group.id} className="flex flex-col gap-2.5">
              <h3 className="label">{group.title}</h3>
              {specs.map((spec) =>
                isPen(spec.key) ? (
                  <PenPicker
                    key={spec.key}
                    spec={spec}
                    value={layer[spec.key]}
                    palette={program.palette}
                    onChange={(value) => set(spec.key, value)}
                  />
                ) : (
                  <Slider
                    key={spec.key}
                    spec={spec}
                    layer={layer}
                    onChange={(value) => set(spec.key, value)}
                  />
                ),
              )}
              {group.id === "repeat" && layer.repeat > 1 && (
                <label className="flex items-center gap-2 text-[13px]" title={FLAG_DOCS.spiral}>
                  <input
                    type="checkbox"
                    checked={layer.spiral}
                    onChange={(event) => set("spiral", event.target.checked)}
                    className="size-4 accent-(--accent)"
                  />
                  Sweep copies along a spiral
                </label>
              )}
              {group.id === "symmetry" && layer.symmetry === "radial" && (
                <label className="flex items-center gap-2 text-[13px]" title={FLAG_DOCS.mirror}>
                  <input
                    type="checkbox"
                    checked={layer.mirror}
                    onChange={(event) => set("mirror", event.target.checked)}
                    className="size-4 accent-(--accent)"
                  />
                  Add mirror images
                </label>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
