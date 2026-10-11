/**
 * The deterministic gate between "some JSON" and "a program we will draw".
 *
 * Structured outputs guarantee the *shape* of what Claude returns, but not
 * that the numbers are sensible: the wire schema cannot carry bounds. So this
 * validator does the rest, and it is the same code for model output, preset
 * fixtures, and slider edits:
 *
 *  - numbers out of range are clamped and reported as warnings
 *  - structural problems (bad colour, palette index past the end, a broken
 *    L-system rule, a layer that draws nothing) are errors
 *  - the size of the finished artwork is bounded *before* any geometry is
 *    built, so a hostile or careless program cannot freeze the tab
 *
 * Error text is written for the model as much as for people: when a
 * generated program fails, these messages are sent back for one
 * self-correction pass.
 */
import {
  LIMITS,
  PARAMS,
  ProgramSchema,
  isWallpaper,
  paramApplies,
  rangeFor,
  type Layer,
  type Program,
} from "./dsl";
import {
  countDraws,
  countStrokes,
  expandLSystem,
  isValidAxiom,
  parseRules,
} from "./generators/lsystem";
import { penroseTriangleCounts } from "./generators/penrose";
import {
  GROUP_SPECS,
  VIEW,
  coveringCountBound,
  coveringTranslations,
  groupOps,
  latticeFor,
  toAffine,
} from "./symmetry";

export interface SizeEstimate {
  paths: number;
  vertices: number;
}

export type Validation =
  | { ok: true; program: Program; warnings: string[]; estimate: SizeEstimate }
  | { ok: false; errors: string[] };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalizes `#abc` and `#AABBCC` to lower-case six-digit hex, or returns null. */
export function normalizeColor(value: string): string | null {
  const text = value.trim();
  if (!HEX.test(text)) return null;
  const digits = text.slice(1).toLowerCase();
  return digits.length === 3 ? `#${[...digits].map((d) => d + d).join("")}` : `#${digits}`;
}

const tidy = (n: number) => Number(n.toFixed(6));

/** Upper bound on the paths and vertices one copy of a layer's motif produces. */
function motifSize(layer: Layer, errors: string[], at: string): SizeEstimate {
  switch (layer.generator) {
    case "polygon":
      return {
        paths: 1,
        vertices: layer.sides === 2 ? 2 : layer.sides * (layer.inset > 0 ? 2 : 1),
      };
    case "voronoi":
      // Euler's formula caps the average cell at six sides; eight leaves room for the border.
      return { paths: layer.count, vertices: layer.count * 8 + 8 };
    case "penrose": {
      const [acute, obtuse] = penroseTriangleCounts(layer.depth);
      const triangles = acute + obtuse;
      return { paths: triangles, vertices: triangles * 3 };
    }
    case "subdivision": {
      const leaves = 2 ** layer.depth;
      return { paths: leaves, vertices: leaves * Math.max(layer.sides, 5) };
    }
    case "lsystem": {
      if (!isValidAxiom(layer.axiom)) {
        errors.push(`${at}.axiom: must be 1 to ${LIMITS.maxAxiom} symbols from A-Z a-z + - [ ] |`);
        return { paths: 0, vertices: 0 };
      }
      const parsed = parseRules(layer.rules);
      if (!parsed.ok) {
        errors.push(`${at}.rules: ${parsed.error}`);
        return { paths: 0, vertices: 0 };
      }
      const expanded = expandLSystem(layer.axiom, parsed.rules, layer.depth);
      if (expanded === null) {
        errors.push(
          `${at}: the L-system grows past ${LIMITS.maxSymbols} symbols at depth ${layer.depth}; lower depth`,
        );
        return { paths: 0, vertices: 0 };
      }
      const draws = countDraws(expanded);
      if (draws === 0) {
        errors.push(`${at}: the L-system never draws (it needs F or G in the axiom or rules)`);
        return { paths: 0, vertices: 0 };
      }
      // Exact: every draw adds one vertex, and every stroke one more for its start.
      const strokes = countStrokes(expanded);
      return { paths: strokes, vertices: draws + strokes };
    }
  }
}

/** Upper bound on how many symmetric copies of the motif can touch the canvas. */
function copyCount(layer: Layer): number {
  if (layer.symmetry === "none") return 1;
  if (layer.symmetry === "radial") return layer.order * (layer.mirror ? 2 : 1);
  if (!isWallpaper(layer.symmetry)) return 1;
  const growth = layer.repeat > 1 ? Math.max(1, layer.scaleStep ** (layer.repeat - 1)) : 1;
  // A disc around the cell origin that contains every nested copy of the motif.
  const radius = (Math.hypot(layer.x, layer.y) + layer.size * Math.SQRT2) * growth * layer.cell;
  const lattice = latticeFor(GROUP_SPECS[layer.symmetry].lattice, layer.cell, layer.cellAspect);
  const ops = groupOps(layer.symmetry);
  const box = { minX: -radius, minY: -radius, maxX: radius, maxY: radius };
  // Do not enumerate a lattice that is obviously far too dense.
  if (coveringCountBound(lattice, box) * ops.length > LIMITS.maxPaths * 4) {
    return Math.ceil(coveringCountBound(lattice, box) * ops.length);
  }
  let copies = 0;
  for (const o of ops) {
    const map = toAffine(o, lattice);
    const cx = map[4];
    const cy = map[5];
    copies +=
      coveringTranslations(
        lattice,
        { minX: cx - radius, minY: cy - radius, maxX: cx + radius, maxY: cy + radius },
        VIEW,
      ).length / 2;
  }
  return copies;
}

/** Upper bound on the finished size of one layer. Exposed for tests. */
export function estimateLayer(layer: Layer): SizeEstimate {
  const motif = motifSize(layer, [], "layer");
  const copies = copyCount(layer) * layer.repeat;
  return { paths: motif.paths * copies, vertices: motif.vertices * copies };
}

function checkLayer(
  raw: Layer,
  index: number,
  paletteSize: number,
  errors: string[],
  warnings: string[],
): Layer {
  const at = `layers[${index}]`;
  const layer: Layer = { ...raw };

  for (const spec of PARAMS) {
    const value = layer[spec.key];
    if (!Number.isFinite(value)) {
      errors.push(`${at}.${spec.key}: must be a finite number`);
      continue;
    }
    const { min, max } = rangeFor(spec, layer.generator);
    const rounded = spec.integer ? Math.round(value) : tidy(value);
    const next = Math.min(max, Math.max(min, rounded));
    // Only mention an adjustment when the layer actually reads this parameter.
    if ((next !== rounded || (spec.integer && rounded !== value)) && paramApplies(spec, layer)) {
      warnings.push(`${at}.${spec.key}: ${value} adjusted to ${next} (allowed ${min} to ${max})`);
    }
    layer[spec.key] = next;
  }

  for (const key of ["stroke", "fill", "altFill"] as const) {
    if (layer[key] >= paletteSize) {
      errors.push(
        `${at}.${key}: palette index ${layer[key]} is past the end of a ${paletteSize}-colour palette`,
      );
    }
  }
  if (layer.stroke < 0 && layer.fill < 0 && layer.altFill < 0) {
    errors.push(`${at}: draws nothing because stroke, fill, and altFill are all -1`);
  }

  if (layer.generator === "lsystem") {
    layer.axiom = layer.axiom.replace(/\s+/g, "");
    layer.rules = layer.rules.replace(/\s+/g, "");
    if (layer.axiom.length > LIMITS.maxAxiom) {
      errors.push(`${at}.axiom: longer than ${LIMITS.maxAxiom} symbols`);
    }
    if (layer.rules.length > LIMITS.maxRules) {
      errors.push(`${at}.rules: longer than ${LIMITS.maxRules} characters`);
    }
  } else {
    // Text fields are ignored by other generators; keep them from carrying junk.
    if (layer.axiom.length > LIMITS.maxAxiom) layer.axiom = "";
    if (layer.rules.length > LIMITS.maxRules) layer.rules = "";
  }
  return layer;
}

/**
 * Validates any value as a program. On success the returned program is
 * normalized (clamped, rounded, colours lower-cased) and safe to render.
 */
export function validateProgram(input: unknown): Validation {
  const shape = ProgramSchema.safeParse(input);
  if (!shape.success) {
    return {
      ok: false,
      errors: shape.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "program"}: ${issue.message}`),
    };
  }
  const raw = shape.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  let title = raw.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (title === "") title = "Untitled";
  if (title.length > LIMITS.maxTitle) {
    title = title.slice(0, LIMITS.maxTitle).trim();
    warnings.push(`title: shortened to ${LIMITS.maxTitle} characters`);
  }

  let seed = Number.isFinite(raw.seed) ? Math.abs(Math.round(raw.seed)) : 0;
  if (seed > LIMITS.maxSeed) seed %= LIMITS.maxSeed + 1;
  if (seed !== raw.seed) warnings.push(`seed: ${raw.seed} adjusted to ${seed}`);

  const background = normalizeColor(raw.background);
  if (!background)
    errors.push(`background: "${raw.background.slice(0, 20)}" is not a hex colour like #ffffff`);

  if (raw.palette.length < 1 || raw.palette.length > LIMITS.maxPalette) {
    errors.push(`palette: needs 1 to ${LIMITS.maxPalette} colours, got ${raw.palette.length}`);
  }
  const palette = raw.palette.slice(0, LIMITS.maxPalette).map((entry, i) => {
    const color = normalizeColor(entry);
    if (!color)
      errors.push(`palette[${i}]: "${entry.slice(0, 20)}" is not a hex colour like #1a1a1a`);
    return color ?? "#000000";
  });

  if (raw.layers.length < 1 || raw.layers.length > LIMITS.maxLayers) {
    errors.push(`layers: needs 1 to ${LIMITS.maxLayers} layers, got ${raw.layers.length}`);
  }
  const layers = raw.layers
    .slice(0, LIMITS.maxLayers)
    .map((layer, i) => checkLayer(layer, i, palette.length, errors, warnings));

  // Size check, on the clamped values. Skipped if the layer is already broken.
  const estimate: SizeEstimate = { paths: 0, vertices: 0 };
  if (errors.length === 0) {
    layers.forEach((layer, i) => {
      const at = `layers[${i}]`;
      const motif = motifSize(layer, errors, at);
      const copies = copyCount(layer) * layer.repeat;
      const paths = motif.paths * copies;
      const vertices = motif.vertices * copies;
      estimate.paths += paths;
      estimate.vertices += vertices;
      if (paths > LIMITS.maxPaths || vertices > LIMITS.maxVertices) {
        errors.push(
          `${at}: would draw up to ${Math.round(paths).toLocaleString("en-US")} shapes (${Math.round(
            vertices,
          ).toLocaleString("en-US")} points); the limit is ${LIMITS.maxPaths.toLocaleString(
            "en-US",
          )} shapes and ${LIMITS.maxVertices.toLocaleString("en-US")} points. ${sizeHint(layer)}`,
        );
      }
    });
    if (
      errors.length === 0 &&
      (estimate.paths > LIMITS.maxPaths || estimate.vertices > LIMITS.maxVertices)
    ) {
      errors.push(
        `program: all layers together would draw up to ${Math.round(estimate.paths).toLocaleString(
          "en-US",
        )} shapes; the limit is ${LIMITS.maxPaths.toLocaleString("en-US")}. Simplify or remove a layer.`,
      );
    }
  }

  if (errors.length > 0 || !background) return { ok: false, errors };
  return {
    ok: true,
    program: { title, seed, background, palette, layers },
    warnings,
    estimate,
  };
}

function sizeHint(layer: Layer): string {
  const tips: string[] = [];
  if (isWallpaper(layer.symmetry)) tips.push("raise cell");
  if (layer.symmetry === "radial") tips.push("lower order");
  if (layer.repeat > 1) tips.push("lower repeat");
  if (layer.generator === "voronoi") tips.push("lower count");
  if (layer.generator !== "polygon" && layer.generator !== "voronoi") tips.push("lower depth");
  if (isWallpaper(layer.symmetry)) tips.push("or shrink size so fewer copies reach the canvas");
  return `To fix: ${tips.join(", ")}.`;
}
