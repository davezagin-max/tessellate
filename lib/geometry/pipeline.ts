/**
 * program -> scene.
 *
 * The one pure pipeline every output shares:
 *
 *   validated program
 *     -> generator      (motif paths in their own frame, seeded)
 *     -> placement      (size, rotation, offset, nested copies)
 *     -> symmetry       (radial maps, or wallpaper maps x lattice translations)
 *     -> cull + dedupe  (drop off-canvas copies and exact duplicates)
 *     -> batches        (what to fill and stroke, in paint order)
 *
 * A `Scene` is plain data. The SVG writer, the Canvas painter, and the
 * plotter exporter all read the same scene, so they cannot disagree about
 * what the artwork is.
 */
import { applyFlat, compose, rotate, scale, translate, type Affine } from "./affine";
import { LIMITS, isWallpaper, type Layer, type Program } from "./dsl";
import { generateMotif } from "./generators";
import { signedArea } from "./generators/types";
import { createRng } from "./rng";
import {
  VIEW,
  coveringTranslations,
  radialMaps,
  wallpaperMaps,
  type Box,
  type Lattice,
} from "./symmetry";

export interface ScenePath {
  /** Flat `[x0, y0, x1, y1, ...]` in canvas units (-1 to 1). */
  pts: number[];
  closed: boolean;
}

export interface Batch {
  layer: number;
  kind: "fill" | "stroke";
  /** Palette index, which doubles as the pen number for plotting. */
  pen: number;
  color: string;
  opacity: number;
  /** Stroke width in thousandths of the canvas width. 0 for fills. */
  width: number;
  paths: ScenePath[];
}

export interface LayerStats {
  paths: number;
  vertices: number;
  /** Copies removed because symmetry placed them exactly on top of another copy. */
  duplicates: number;
}

export interface Scene {
  title: string;
  background: string;
  palette: string[];
  batches: Batch[];
  stats: { paths: number; vertices: number; layers: LayerStats[] };
}

/** Thrown if a scene outgrows the limits. Validation should make this unreachable. */
export class ShapeCapError extends Error {
  constructor() {
    super(`The artwork exceeds ${LIMITS.maxPaths} shapes or ${LIMITS.maxVertices} points.`);
    this.name = "ShapeCapError";
  }
}

/**
 * Duplicate detection snaps to a grid of about 1/20000 of the canvas width.
 * The factor is a prime rather than 10000 so that "nice" coordinates (0.125,
 * 1/32, 0.05) never sit on a rounding boundary, where two copies that differ
 * by floating-point noise would snap to different cells.
 */
const SNAP = 9973;

function bounds(pts: readonly number[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  return { minX, minY, maxX, maxY };
}

const touchesView = (b: Box) =>
  b.maxX >= VIEW.minX && b.minX <= VIEW.maxX && b.maxY >= VIEW.minY && b.minY <= VIEW.maxY;

function reversed(pts: readonly number[]): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0, j = pts.length - 2; i < pts.length; i += 2, j -= 2) {
    out[i] = pts[j];
    out[i + 1] = pts[j + 1];
  }
  return out;
}

/**
 * A key that is equal for two paths exactly when they trace the same shape:
 * independent of which vertex comes first and, for open paths, of direction.
 * Closed paths must already share an orientation. Two 32-bit hashes are
 * combined so an accidental collision is out of the question at this scale.
 */
export function pathKey(pts: readonly number[], closed: boolean, tag: number): string {
  const n = pts.length / 2;
  const xs = new Int32Array(n);
  const ys = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = Math.round(pts[2 * i] * SNAP);
    ys[i] = Math.round(pts[2 * i + 1] * SNAP);
  }
  let start = 0;
  let step = 1;
  if (closed) {
    for (let i = 1; i < n; i++) {
      if (xs[i] < xs[start] || (xs[i] === xs[start] && ys[i] < ys[start])) start = i;
    }
  } else if (xs[n - 1] < xs[0] || (xs[n - 1] === xs[0] && ys[n - 1] < ys[0])) {
    start = n - 1;
    step = -1;
  }
  let h1 = 0x811c9dc5 ^ tag;
  let h2 = 0x9e3779b9 ^ (closed ? 1 : 0);
  for (let k = 0, i = start; k < n; k++, i = (i + step + n) % n) {
    h1 = Math.imul(h1 ^ xs[i], 0x01000193);
    h1 = Math.imul(h1 ^ ys[i], 0x01000193);
    h2 = Math.imul(h2 ^ ys[i], 0x85ebca6b) + xs[i];
    h2 = (h2 << 13) | (h2 >>> 19);
  }
  return `${n}:${h1 >>> 0}:${h2 >>> 0}`;
}

interface Emitted {
  pts: number[];
  closed: boolean;
  tag: number;
}

function symmetryMaps(layer: Layer): { maps: Affine[]; lattice: Lattice | null } {
  if (layer.symmetry === "none") return { maps: [[1, 0, 0, 1, 0, 0]], lattice: null };
  if (layer.symmetry === "radial")
    return { maps: radialMaps(layer.order, layer.mirror), lattice: null };
  if (isWallpaper(layer.symmetry)) {
    const { maps, lattice } = wallpaperMaps(layer.symmetry, layer.cell, layer.cellAspect);
    return { maps, lattice };
  }
  return { maps: [[1, 0, 0, 1, 0, 0]], lattice: null };
}

/**
 * Where nested copy `k` of the motif sits, in motif units.
 * In place: the copy shrinks and turns about the motif's own centre.
 * Spiral: the whole placed motif is turned and scaled about the layer origin.
 */
export function nestedPlacement(
  layer: Pick<Layer, "x" | "y" | "size" | "rotation" | "scaleStep" | "rotateStep" | "spiral">,
  k: number,
): Affine {
  const grow = layer.scaleStep ** k;
  const turn = k * layer.rotateStep;
  if (layer.spiral) {
    return compose(
      compose(rotate(turn), scale(grow)),
      compose(translate(layer.x, layer.y), compose(rotate(layer.rotation), scale(layer.size))),
    );
  }
  return compose(
    translate(layer.x, layer.y),
    compose(rotate(layer.rotation + turn), scale(layer.size * grow)),
  );
}

/** Expands one layer into its final, de-duplicated paths. */
export function expandLayer(
  layer: Layer,
  seed: number,
  index: number,
  budget: { paths: number; vertices: number },
) {
  const motif = generateMotif(layer, createRng(seed, index));
  // Wallpaper motifs are authored in cell lengths, so the whole pattern scales with the cell.
  const unit = isWallpaper(layer.symmetry) ? layer.cell : 1;
  const { maps, lattice } = symmetryMaps(layer);

  const seen = new Set<string>();
  const out: Emitted[] = [];
  let duplicates = 0;

  const emit = (pts: number[], closed: boolean, tag: number) => {
    // Mirrors flip winding. Give every closed path the same orientation so
    // overlapping copies fill as a union instead of punching holes.
    const oriented = closed && signedArea(pts) < 0 ? reversed(pts) : pts;
    const key = pathKey(oriented, closed, tag);
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    budget.paths += 1;
    budget.vertices += oriented.length / 2;
    if (budget.paths > LIMITS.maxPaths || budget.vertices > LIMITS.maxVertices)
      throw new ShapeCapError();
    out.push({ pts: oriented, closed, tag });
  };

  for (let k = 0; k < layer.repeat; k++) {
    const nested = compose(scale(unit), nestedPlacement(layer, k));
    for (const path of motif) {
      const base = applyFlat(nested, path.pts);
      const tag = layer.generator === "polygon" ? k % 2 : path.tag;
      for (const map of maps) {
        const copy = applyFlat(map, base);
        const box = bounds(copy);
        if (!lattice) {
          if (touchesView(box)) emit(copy, path.closed, tag);
          continue;
        }
        const shifts = coveringTranslations(lattice, box);
        for (let s = 0; s < shifts.length; s += 2) {
          const moved = new Array<number>(copy.length);
          for (let i = 0; i < copy.length; i += 2) {
            moved[i] = copy[i] + shifts[s];
            moved[i + 1] = copy[i + 1] + shifts[s + 1];
          }
          emit(moved, path.closed, tag);
        }
      }
    }
  }
  return { paths: out, duplicates };
}

/** Builds the scene for a validated program. Pure and deterministic. */
export function buildScene(program: Program): Scene {
  const batches: Batch[] = [];
  const budget = { paths: 0, vertices: 0 };
  const layerStats: LayerStats[] = [];

  program.layers.forEach((layer, index) => {
    const before = { ...budget };
    const { paths, duplicates } = expandLayer(layer, program.seed, index, budget);
    layerStats.push({
      paths: budget.paths - before.paths,
      vertices: budget.vertices - before.vertices,
      duplicates,
    });

    // Paint order inside a layer: fills first, then one stroke pass on top,
    // so an outline is never half-covered by a neighbouring tile's fill.
    const fills: [number, number][] = [
      [0, layer.fill],
      [1, layer.altFill],
    ];
    for (const [tag, pen] of fills) {
      if (pen < 0) continue;
      const filled = paths.filter((p) => p.closed && p.tag === tag);
      if (filled.length === 0) continue;
      batches.push({
        layer: index,
        kind: "fill",
        pen,
        color: program.palette[pen],
        opacity: layer.opacity,
        width: 0,
        paths: filled.map(({ pts, closed }) => ({ pts, closed })),
      });
    }
    if (layer.stroke >= 0 && paths.length > 0) {
      batches.push({
        layer: index,
        kind: "stroke",
        pen: layer.stroke,
        color: program.palette[layer.stroke],
        opacity: layer.opacity,
        width: layer.strokeWidth,
        paths: paths.map(({ pts, closed }) => ({ pts, closed })),
      });
    }
  });

  return {
    title: program.title,
    background: program.background,
    palette: program.palette,
    batches,
    stats: { paths: budget.paths, vertices: budget.vertices, layers: layerStats },
  };
}
