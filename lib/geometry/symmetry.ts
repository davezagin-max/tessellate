/**
 * Symmetry groups as sets of isometries.
 *
 * A wallpaper group is described the way crystallographers do it: a lattice
 * plus a finite set of affine maps of one cell. The full group is every one
 * of those maps followed by every lattice translation.
 *
 * The maps are stored in *fractional* coordinates (multiples of the two
 * lattice vectors), where each one is an integer matrix plus a translation
 * that is a multiple of 1/2. That keeps the group theory exact: closure and
 * composition are integer arithmetic, with no floating-point tolerance.
 * Floating point only appears at the end, when a map is converted to canvas
 * coordinates for a lattice of a given size.
 *
 * Each group is defined by a couple of generators (taken from the
 * International Tables for Crystallography) and closed under composition
 * modulo the lattice. Tests check the order of every group, that every map is
 * an isometry, and that the set really is closed.
 */
import type { Affine, Vec } from "./affine";
import type { WallpaperGroup } from "./dsl";

/**
 * x' = m[0]*x + m[1]*y + t[0]/2
 * y' = m[2]*x + m[3]*y + t[1]/2
 * with x and y in lattice units and t stored as integers modulo 2.
 */
export interface FracOp {
  m: readonly [number, number, number, number];
  t: readonly [number, number];
}

export type LatticeKind = "rectangular" | "square" | "hexagonal";

type Matrix = FracOp["m"];

const I: Matrix = [1, 0, 0, 1];
/** Half-turn: (-x, -y). */
const R2: Matrix = [-1, 0, 0, -1];
/** Quarter-turn on a square lattice: (-y, x). */
const R4: Matrix = [0, -1, 1, 0];
/** Third-turn on a hexagonal lattice: (-y, x - y). */
const R3: Matrix = [0, -1, 1, -1];
/** Sixth-turn on a hexagonal lattice: (x - y, x). */
const R6: Matrix = [1, -1, 1, 0];
/** Mirror (-x, y). */
const MX: Matrix = [-1, 0, 0, 1];
/** Mirror (x, -y). */
const MY: Matrix = [1, 0, 0, -1];
/** Mirror (y, x). */
const MD: Matrix = [0, 1, 1, 0];
/** Mirror (-y, -x). */
const MA: Matrix = [0, -1, -1, 0];

const op = (m: Matrix, tx = 0, ty = 0): FracOp => ({ m, t: [tx, ty] });

interface GroupSpec {
  lattice: LatticeKind;
  generators: FracOp[];
  /** Maps per cell, including centring translations. */
  order: number;
  /** Size of the point group (distinct linear parts). */
  pointOrder: number;
}

/** Translations are given in halves: `op(MX, 1, 1)` is (-x + 1/2, y + 1/2). */
export const GROUP_SPECS: Record<WallpaperGroup, GroupSpec> = {
  p1: { lattice: "rectangular", generators: [], order: 1, pointOrder: 1 },
  p2: { lattice: "rectangular", generators: [op(R2)], order: 2, pointOrder: 2 },
  pm: { lattice: "rectangular", generators: [op(MX)], order: 2, pointOrder: 2 },
  pg: { lattice: "rectangular", generators: [op(MX, 0, 1)], order: 2, pointOrder: 2 },
  cm: { lattice: "rectangular", generators: [op(MX), op(I, 1, 1)], order: 4, pointOrder: 2 },
  pmm: { lattice: "rectangular", generators: [op(MX), op(MY)], order: 4, pointOrder: 4 },
  pmg: { lattice: "rectangular", generators: [op(R2), op(MX, 1, 0)], order: 4, pointOrder: 4 },
  pgg: { lattice: "rectangular", generators: [op(R2), op(MX, 1, 1)], order: 4, pointOrder: 4 },
  cmm: {
    lattice: "rectangular",
    generators: [op(MX), op(MY), op(I, 1, 1)],
    order: 8,
    pointOrder: 4,
  },
  p4: { lattice: "square", generators: [op(R4)], order: 4, pointOrder: 4 },
  p4m: { lattice: "square", generators: [op(R4), op(MX)], order: 8, pointOrder: 8 },
  p4g: { lattice: "square", generators: [op(R4), op(MX, 1, 1)], order: 8, pointOrder: 8 },
  p3: { lattice: "hexagonal", generators: [op(R3)], order: 3, pointOrder: 3 },
  p3m1: { lattice: "hexagonal", generators: [op(R3), op(MA)], order: 6, pointOrder: 6 },
  p31m: { lattice: "hexagonal", generators: [op(R3), op(MD)], order: 6, pointOrder: 6 },
  p6: { lattice: "hexagonal", generators: [op(R6)], order: 6, pointOrder: 6 },
  p6m: { lattice: "hexagonal", generators: [op(R6), op(MD)], order: 12, pointOrder: 12 },
};

const mod2 = (n: number) => ((n % 2) + 2) % 2;

/** `composeOps(p, q)` applies q first, then p, and reduces the translation modulo the lattice. */
export function composeOps(p: FracOp, q: FracOp): FracOp {
  const [a, b, c, d] = p.m;
  const [e, f, g, h] = q.m;
  return {
    m: [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h],
    t: [mod2(a * q.t[0] + b * q.t[1] + p.t[0]), mod2(c * q.t[0] + d * q.t[1] + p.t[1])],
  };
}

export const opKey = (o: FracOp) => `${o.m.join(",")}|${o.t.join(",")}`;

/** Closes a generator set under composition, modulo lattice translations. */
export function closeGroup(generators: readonly FracOp[]): FracOp[] {
  const identity = op(I);
  const seen = new Map<string, FracOp>([[opKey(identity), identity]]);
  const queue: FracOp[] = [identity];
  while (queue.length > 0) {
    const current = queue.shift() as FracOp;
    for (const generator of generators) {
      const next = composeOps(generator, current);
      const key = opKey(next);
      if (!seen.has(key)) {
        // A finite wallpaper group has at most 12 maps per primitive cell (24 with centring).
        if (seen.size >= 48) throw new Error("Generators do not close into a wallpaper group.");
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
}

const cache = new Map<WallpaperGroup, FracOp[]>();

/** Every map of one cell for a group, identity first. */
export function groupOps(name: WallpaperGroup): FracOp[] {
  let ops = cache.get(name);
  if (!ops) {
    ops = closeGroup(GROUP_SPECS[name].generators);
    cache.set(name, ops);
  }
  return ops;
}

export type OpKind = "identity" | "translation" | "rotation" | "mirror" | "glide";

/**
 * Names what a map does. A reflection is a true mirror only when some lattice
 * translation cancels its slide along the axis; otherwise it is a glide.
 */
export function classifyOp(o: FracOp): OpKind {
  const [a, b, c, d] = o.m;
  const det = a * d - b * c;
  if (det === 1) {
    if (a === 1 && b === 0 && c === 0 && d === 1) {
      return o.t[0] === 0 && o.t[1] === 0 ? "identity" : "translation";
    }
    return "rotation";
  }
  // For a reflection M, (I + M) projects onto the axis (times two). The map is
  // a mirror when (I + M)(t + n) = 0 for some lattice vector n. Work in halves.
  for (let nx = -1; nx <= 1; nx++) {
    for (let ny = -1; ny <= 1; ny++) {
      const tx = o.t[0] + 2 * nx;
      const ty = o.t[1] + 2 * ny;
      if ((1 + a) * tx + b * ty === 0 && c * tx + (1 + d) * ty === 0) return "mirror";
    }
  }
  return "glide";
}

export interface Lattice {
  /** First lattice vector, in canvas units. */
  a: Vec;
  /** Second lattice vector. */
  b: Vec;
}

const SQRT3_2 = Math.sqrt(3) / 2;

export function latticeFor(kind: LatticeKind, cell: number, aspect: number): Lattice {
  if (kind === "hexagonal") return { a: [cell, 0], b: [-cell / 2, cell * SQRT3_2] };
  if (kind === "square") return { a: [cell, 0], b: [0, cell] };
  return { a: [cell, 0], b: [0, cell * aspect] };
}

/** Converts a fractional map to canvas coordinates for a concrete lattice: B * M * B^-1, B * t. */
export function toAffine(o: FracOp, lattice: Lattice): Affine {
  const [ax, ay] = lattice.a;
  const [bx, by] = lattice.b;
  const det = ax * by - bx * ay;
  // B^-1
  const ia = by / det;
  const ib = -bx / det;
  const ic = -ay / det;
  const id = ax / det;
  const [m0, m1, m2, m3] = o.m;
  // B * M
  const p0 = ax * m0 + bx * m2;
  const p1 = ax * m1 + bx * m3;
  const p2 = ay * m0 + by * m2;
  const p3 = ay * m1 + by * m3;
  const tx = o.t[0] / 2;
  const ty = o.t[1] / 2;
  return [
    p0 * ia + p1 * ic,
    p2 * ia + p3 * ic,
    p0 * ib + p1 * id,
    p2 * ib + p3 * id,
    ax * tx + bx * ty,
    ay * tx + by * ty,
  ];
}

export interface WallpaperMaps {
  lattice: Lattice;
  /** One isometry per coset of the translation subgroup, in canvas coordinates. */
  maps: Affine[];
}

export function wallpaperMaps(name: WallpaperGroup, cell: number, aspect: number): WallpaperMaps {
  const lattice = latticeFor(GROUP_SPECS[name].lattice, cell, aspect);
  return { lattice, maps: groupOps(name).map((o) => toAffine(o, lattice)) };
}

/** The cyclic group C_n, or the dihedral group D_n when `withMirror` is set, about the origin. */
export function radialMaps(order: number, withMirror: boolean): Affine[] {
  const maps: Affine[] = [];
  for (let k = 0; k < order; k++) {
    const theta = (2 * Math.PI * k) / order;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    maps.push([cos, sin, -sin, cos, 0, 0]);
    // Rotation after a mirror across the vertical axis.
    if (withMirror) maps.push([-cos, -sin, -sin, cos, 0, 0]);
  }
  return maps;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The visible canvas. */
export const VIEW: Box = { minX: -1, minY: -1, maxX: 1, maxY: 1 };

/**
 * Lattice translations `i*a + j*b` that bring `box` into contact with `view`.
 * Returns flat `[tx0, ty0, tx1, ty1, ...]`. Exact, not a padded guess: each
 * candidate is tested, so off-canvas copies are never generated.
 */
export function coveringTranslations(lattice: Lattice, box: Box, view: Box = VIEW): number[] {
  const [ax, ay] = lattice.a;
  const [bx, by] = lattice.b;
  const det = ax * by - bx * ay;
  // A translation (tx, ty) works when it lies in this rectangle.
  const lowX = view.minX - box.maxX;
  const highX = view.maxX - box.minX;
  const lowY = view.minY - box.maxY;
  const highY = view.maxY - box.minY;
  // Bound i and j by mapping the rectangle's corners into lattice coordinates.
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (const tx of [lowX, highX]) {
    for (const ty of [lowY, highY]) {
      const i = (by * tx - bx * ty) / det;
      const j = (-ay * tx + ax * ty) / det;
      iMin = Math.min(iMin, i);
      iMax = Math.max(iMax, i);
      jMin = Math.min(jMin, j);
      jMax = Math.max(jMax, j);
    }
  }
  const out: number[] = [];
  for (let j = Math.ceil(jMin - 1e-9); j <= Math.floor(jMax + 1e-9); j++) {
    for (let i = Math.ceil(iMin - 1e-9); i <= Math.floor(iMax + 1e-9); i++) {
      const tx = i * ax + j * bx;
      const ty = i * ay + j * by;
      if (tx >= lowX && tx <= highX && ty >= lowY && ty <= highY) out.push(tx, ty);
    }
  }
  return out;
}

/** Upper bound on `coveringTranslations(...).length / 2` without enumerating, for very large boxes. */
export function coveringCountBound(lattice: Lattice, box: Box, view: Box = VIEW): number {
  const [ax, ay] = lattice.a;
  const [bx, by] = lattice.b;
  const cellArea = Math.abs(ax * by - bx * ay);
  const w = view.maxX - view.minX + (box.maxX - box.minX);
  const h = view.maxY - view.minY + (box.maxY - box.minY);
  const reach = Math.hypot(ax, ay) + Math.hypot(bx, by);
  return ((w + reach) * (h + reach)) / cellArea;
}
