/**
 * Recursive subdivision of a convex polygon.
 *
 * Every cell is split by a chord from a point on its longest edge:
 * triangles are cut to the opposite vertex (so they stay triangles), and
 * everything else is cut across to the opposite edge (so rectangles stay
 * rectangles). With jitter 0 every cut is at a midpoint and the result is a
 * regular mesh. With jitter up, cuts slide off-centre and some cells stop
 * early, which gives the uneven, Mondrian-like compositions.
 */
import type { Layer } from "../dsl";
import type { Rng } from "../rng";
import { regularPolygon } from "./polygon";
import { insetPolygon, type MotifPath } from "./types";

function longestEdge(poly: number[]): number {
  const n = poly.length / 2;
  let best = 0;
  let bestLength = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const length = Math.hypot(poly[2 * j] - poly[2 * i], poly[2 * j + 1] - poly[2 * i + 1]);
    // Strictly greater, with a tolerance, so ties always resolve to the first edge.
    if (length > bestLength + 1e-9) {
      best = i;
      bestLength = length;
    }
  }
  return best;
}

const lerp = (poly: number[], i: number, j: number, t: number): [number, number] => [
  poly[2 * i] + (poly[2 * j] - poly[2 * i]) * t,
  poly[2 * i + 1] + (poly[2 * j + 1] - poly[2 * i + 1]) * t,
];

/**
 * Splits a convex polygon into two. `t` places the cut along the longest edge
 * and, mirrored, along the opposite edge, so a rectangle is cut parallel to
 * its short sides and stays a pair of rectangles.
 */
export function splitPolygon(poly: number[], t: number): [number[], number[]] {
  const n = poly.length / 2;
  const i = longestEdge(poly);
  const p = lerp(poly, i, (i + 1) % n, t);
  const first: number[] = [...p];
  const second: number[] = [...p];

  if (n === 3) {
    // Cut to the opposite vertex.
    const far = (i + 2) % n;
    first.push(
      poly[2 * ((i + 1) % n)],
      poly[2 * ((i + 1) % n) + 1],
      poly[2 * far],
      poly[2 * far + 1],
    );
    second.push(poly[2 * far], poly[2 * far + 1], poly[2 * i], poly[2 * i + 1]);
    return [first, second];
  }

  // Cut to a point on the opposite edge, from vertex k to vertex k + 1.
  const k = (i + Math.floor(n / 2)) % n;
  const q = lerp(poly, k, (k + 1) % n, 1 - t);
  for (let v = (i + 1) % n; ; v = (v + 1) % n) {
    first.push(poly[2 * v], poly[2 * v + 1]);
    if (v === k) break;
  }
  first.push(...q);
  second.push(...q);
  for (let v = (k + 1) % n; ; v = (v + 1) % n) {
    second.push(poly[2 * v], poly[2 * v + 1]);
    if (v === i) break;
  }
  return [first, second];
}

export function subdivision(
  layer: Pick<Layer, "sides" | "depth" | "jitter" | "inset">,
  rng: Rng,
): MotifPath[] {
  const { depth, jitter } = layer;
  const leaves: number[][] = [];
  const spread = 0.3 * jitter;
  const stopChance = 0.3 * jitter;

  const recurse = (poly: number[], level: number) => {
    // Always draw from the generator in the same order, so the layout is a pure function of the seed.
    const t = 0.5 + (rng() * 2 - 1) * spread;
    const stop = rng() < stopChance;
    if (level >= depth || (stop && level >= 2)) {
      leaves.push(poly);
      return;
    }
    const [first, second] = splitPolygon(poly, t);
    recurse(first, level + 1);
    recurse(second, level + 1);
  };
  recurse(regularPolygon(layer.sides), 0);

  return leaves.map((poly) => ({
    pts: insetPolygon(poly, layer.inset),
    closed: true,
    tag: rng() < 0.25 ? 1 : 0,
  }));
}
