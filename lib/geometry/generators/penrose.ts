/**
 * Penrose P3 (rhomb) tiling by deflation of Robinson triangles.
 *
 * Both rhombs are built from two mirror-image isosceles triangles:
 *   thin rhomb  = two acute "golden triangles" (36-72-72), kind 0
 *   thick rhomb = two obtuse "golden gnomons" (108-36-36), kind 1
 * Each triangle is stored as (kind, A, B, C) with A the apex, so BC is the
 * edge it shares with its mirror twin.
 *
 * One deflation step cuts every triangle into smaller ones of the same two
 * shapes, 1/phi the size. Starting from a wheel of ten acute triangles and
 * repeating gives the aperiodic tiling with five-fold symmetry. Afterwards
 * twins are glued back together across BC to recover whole rhombs.
 */
import type { Layer } from "../dsl";
import { insetPolygon, type MotifPath } from "./types";

export const PHI = (1 + Math.sqrt(5)) / 2;

/** [kind, ax, ay, bx, by, cx, cy] */
export type RobinsonTriangle = readonly [0 | 1, number, number, number, number, number, number];

export function penroseSun(): RobinsonTriangle[] {
  const triangles: RobinsonTriangle[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = ((2 * i - 1) * Math.PI) / 10;
    const t1 = ((2 * i + 1) * Math.PI) / 10;
    let b: [number, number] = [Math.cos(t0), Math.sin(t0)];
    let c: [number, number] = [Math.cos(t1), Math.sin(t1)];
    // Mirror every second triangle so neighbours share matching edges.
    if (i % 2 === 0) [b, c] = [c, b];
    triangles.push([0, 0, 0, b[0], b[1], c[0], c[1]]);
  }
  return triangles;
}

export function deflate(triangles: readonly RobinsonTriangle[]): RobinsonTriangle[] {
  const out: RobinsonTriangle[] = [];
  for (const [kind, ax, ay, bx, by, cx, cy] of triangles) {
    if (kind === 0) {
      // Acute: one acute and one obtuse child.
      const px = ax + (bx - ax) / PHI;
      const py = ay + (by - ay) / PHI;
      out.push([0, cx, cy, px, py, bx, by], [1, px, py, cx, cy, ax, ay]);
    } else {
      // Obtuse: two obtuse children and one acute child.
      const qx = bx + (ax - bx) / PHI;
      const qy = by + (ay - by) / PHI;
      const rx = bx + (cx - bx) / PHI;
      const ry = by + (cy - by) / PHI;
      out.push(
        [1, rx, ry, cx, cy, ax, ay],
        [1, qx, qy, rx, ry, bx, by],
        [0, rx, ry, qx, qy, ax, ay],
      );
    }
  }
  return out;
}

/** Triangle counts after `depth` deflations of the sun: [acute, obtuse]. */
export function penroseTriangleCounts(depth: number): [number, number] {
  let acute = 10;
  let obtuse = 0;
  for (let i = 0; i < depth; i++) [acute, obtuse] = [acute + obtuse, acute + 2 * obtuse];
  return [acute, obtuse];
}

export interface PenroseTile {
  /** 0 = thick rhomb, 1 = thin rhomb. */
  tag: 0 | 1;
  pts: number[];
  /** False for a half tile on the rim of the patch, which has no twin to pair with. */
  whole: boolean;
}

/** Glues mirror twins across their shared base into rhombs. Unpaired rim triangles stay as halves. */
export function penroseTiles(depth: number): PenroseTile[] {
  let triangles = penroseSun();
  for (let i = 0; i < depth; i++) triangles = deflate(triangles);

  // Twins share the midpoint of BC and are the same kind.
  const key = (t: RobinsonTriangle) =>
    `${t[0]}:${Math.round((t[3] + t[5]) * 5e5)},${Math.round((t[4] + t[6]) * 5e5)}`;
  const waiting = new Map<string, RobinsonTriangle>();
  const tiles: PenroseTile[] = [];
  for (const t of triangles) {
    const k = key(t);
    const twin = waiting.get(k);
    if (twin) {
      waiting.delete(k);
      tiles.push({
        tag: t[0] === 0 ? 1 : 0,
        pts: [twin[1], twin[2], twin[3], twin[4], t[1], t[2], twin[5], twin[6]],
        whole: true,
      });
    } else {
      waiting.set(k, t);
    }
  }
  for (const t of waiting.values()) {
    tiles.push({
      tag: t[0] === 0 ? 1 : 0,
      pts: [t[1], t[2], t[3], t[4], t[5], t[6]],
      whole: false,
    });
  }
  return tiles;
}

export function penrose(layer: Pick<Layer, "depth" | "inset">): MotifPath[] {
  return penroseTiles(layer.depth).map((tile) => ({
    pts: insetPolygon(tile.pts, layer.inset),
    closed: true,
    tag: tile.tag,
  }));
}
