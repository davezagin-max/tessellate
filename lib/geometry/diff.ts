/**
 * What changed between two programs, as short readable lines.
 *
 * Used by the refinement view to show what Claude's revision actually did.
 * The model also describes its changes in prose, but this list is computed
 * from the two programs, so it cannot leave anything out or claim a change
 * that did not happen.
 */
import { PARAMS, paramApplies, type Layer, type Program } from "./dsl";

const num = (n: number) => String(Number(n.toFixed(4)));

const LABEL: Partial<Record<keyof Layer, string>> = {
  x: "offset x",
  y: "offset y",
  repeat: "nested copies",
  scaleStep: "scale per copy",
  rotateStep: "turn per copy",
  cell: "cell size",
  cellAspect: "cell aspect",
  strokeWidth: "line width",
  stroke: "line colour",
  altFill: "alternate fill",
};

const name = (key: keyof Layer) => LABEL[key] ?? key;

const pen = (index: number) => (index < 0 ? "none" : `colour ${index + 1}`);

function describeLayer(layer: Layer): string {
  return layer.symmetry === "none" ? layer.generator : `${layer.generator}, ${layer.symmetry}`;
}

function diffLayer(before: Layer, after: Layer, label: string, out: string[]): void {
  if (before.generator !== after.generator) {
    out.push(`${label}: generator ${before.generator} → ${after.generator}`);
  }
  if (before.symmetry !== after.symmetry) {
    out.push(`${label}: symmetry ${before.symmetry} → ${after.symmetry}`);
  }
  for (const spec of PARAMS) {
    // Report a parameter only if the new layer reads it.
    if (!paramApplies(spec, after)) continue;
    const a = before[spec.key];
    const b = after[spec.key];
    if (a === b) continue;
    const isPen = spec.key === "stroke" || spec.key === "fill" || spec.key === "altFill";
    out.push(`${label}: ${name(spec.key)} ${isPen ? pen(a) : num(a)} → ${isPen ? pen(b) : num(b)}`);
  }
  if (after.symmetry === "radial" && before.mirror !== after.mirror) {
    out.push(`${label}: mirror ${before.mirror ? "on" : "off"} → ${after.mirror ? "on" : "off"}`);
  }
  if (after.repeat > 1 && before.spiral !== after.spiral) {
    out.push(
      `${label}: nesting ${before.spiral ? "spiral" : "in place"} → ${after.spiral ? "spiral" : "in place"}`,
    );
  }
  if (after.generator === "lsystem") {
    if (before.axiom !== after.axiom)
      out.push(`${label}: axiom ${before.axiom || "(empty)"} → ${after.axiom}`);
    if (before.rules !== after.rules)
      out.push(`${label}: rules ${before.rules || "(empty)"} → ${after.rules}`);
  }
}

/** Every difference between two programs, in reading order. Empty when they are equal. */
export function diffPrograms(before: Program, after: Program): string[] {
  const out: string[] = [];
  if (before.background !== after.background) {
    out.push(`Background ${before.background} → ${after.background}`);
  }
  const colours = Math.max(before.palette.length, after.palette.length);
  for (let i = 0; i < colours; i++) {
    const a = before.palette[i];
    const b = after.palette[i];
    if (a === b) continue;
    if (a === undefined) out.push(`Palette: added colour ${i + 1} (${b})`);
    else if (b === undefined) out.push(`Palette: removed colour ${i + 1} (${a})`);
    else out.push(`Palette: colour ${i + 1} ${a} → ${b}`);
  }
  if (before.seed !== after.seed) out.push(`Seed ${before.seed} → ${after.seed}`);

  const layers = Math.max(before.layers.length, after.layers.length);
  for (let i = 0; i < layers; i++) {
    const a = before.layers[i];
    const b = after.layers[i];
    const label = `Layer ${i + 1}`;
    if (!a) out.push(`${label}: added (${describeLayer(b)})`);
    else if (!b) out.push(`${label}: removed (${describeLayer(a)})`);
    else diffLayer(a, b, label, out);
  }
  return out;
}
