/**
 * Voronoi cells by half-plane clipping, with Lloyd relaxation.
 *
 * Each cell starts as the whole square and is clipped by the perpendicular
 * bisector between its site and every other site, nearest first. Once the
 * next site is more than twice as far away as the cell's farthest corner, no
 * later bisector can touch the cell, so the loop stops early. This is exact
 * (no Delaunay triangulation, no numerical epsilon games) and is fast enough
 * for the few hundred cells the language allows.
 */
import type { Layer } from "../dsl";
import type { Rng } from "../rng";
import { insetPolygon, type MotifPath } from "./types";

const SQUARE = [-1, -1, 1, -1, 1, 1, -1, 1];

/** Keeps the part of a convex polygon where `nx*x + ny*y <= limit`. */
export function clipHalfPlane(poly: number[], nx: number, ny: number, limit: number): number[] {
  const out: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const x0 = poly[i];
    const y0 = poly[i + 1];
    const x1 = poly[(i + 2) % n];
    const y1 = poly[(i + 3) % n];
    const d0 = nx * x0 + ny * y0 - limit;
    const d1 = nx * x1 + ny * y1 - limit;
    if (d0 <= 0) out.push(x0, y0);
    if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
      const t = d0 / (d0 - d1);
      out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }
  return out;
}

/** Voronoi cells of `sites` (flat x,y pairs) inside the square [-1, 1]^2, one polygon per site. */
export function voronoiCells(sites: readonly number[]): number[][] {
  const n = sites.length / 2;
  const cells: number[][] = [];
  const order = new Array<number>(n);
  const dist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const sx = sites[2 * i];
    const sy = sites[2 * i + 1];
    for (let j = 0; j < n; j++) {
      order[j] = j;
      const dx = sites[2 * j] - sx;
      const dy = sites[2 * j + 1] - sy;
      dist[j] = dx * dx + dy * dy;
    }
    order.sort((p, q) => dist[p] - dist[q] || p - q);

    let cell = SQUARE;
    let reach = 0;
    const measure = () => {
      reach = 0;
      for (let k = 0; k < cell.length; k += 2) {
        const dx = cell[k] - sx;
        const dy = cell[k + 1] - sy;
        reach = Math.max(reach, dx * dx + dy * dy);
      }
    };
    measure();
    for (const j of order) {
      if (j === i || dist[j] === 0) continue;
      // The bisector with j is dist/2 away; it cannot cut a cell whose corners are all closer.
      if (dist[j] > 4 * reach) break;
      const jx = sites[2 * j];
      const jy = sites[2 * j + 1];
      const clipped = clipHalfPlane(
        cell,
        jx - sx,
        jy - sy,
        (jx * jx + jy * jy - sx * sx - sy * sy) / 2,
      );
      if (clipped.length !== cell.length || clipped.some((v, k) => v !== cell[k])) {
        cell = clipped;
        measure();
      }
      if (cell.length < 6) break;
    }
    cells.push(cell);
  }
  return cells;
}

/** Area centroid of a polygon, or its first vertex if the polygon is degenerate. */
export function centroid(poly: readonly number[]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const cross = poly[i] * poly[j + 1] - poly[j] * poly[i + 1];
    area += cross;
    cx += (poly[i] + poly[j]) * cross;
    cy += (poly[i + 1] + poly[j + 1]) * cross;
  }
  if (Math.abs(area) < 1e-14) return [poly[0] ?? 0, poly[1] ?? 0];
  return [cx / (3 * area), cy / (3 * area)];
}

/** Number of Lloyd relaxation passes for a jitter value: 1 is raw noise, 0 is fully relaxed. */
export function relaxPasses(jitter: number): number {
  return Math.round((1 - jitter) * 8);
}

export function voronoi(layer: Pick<Layer, "count" | "jitter" | "inset">, rng: Rng): MotifPath[] {
  let sites: number[] = [];
  for (let i = 0; i < layer.count; i++) sites.push(rng() * 2 - 1, rng() * 2 - 1);
  let cells = voronoiCells(sites);
  for (let pass = 0; pass < relaxPasses(layer.jitter); pass++) {
    sites = cells.flatMap((cell, i) =>
      cell.length >= 6 ? centroid(cell) : [sites[2 * i], sites[2 * i + 1]],
    );
    cells = voronoiCells(sites);
  }
  const paths: MotifPath[] = [];
  for (const cell of cells) {
    // Draw the tag for every cell so an empty cell does not shift later ones.
    const tag = rng() < 0.25 ? 1 : 0;
    if (cell.length >= 6) paths.push({ pts: insetPolygon(cell, layer.inset), closed: true, tag });
  }
  return paths;
}
