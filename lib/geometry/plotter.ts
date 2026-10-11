/**
 * Scene -> SVG for a pen plotter or laser cutter.
 *
 * A plotter does not want the picture; it wants a short list of strokes.
 * This exporter turns the scene into exactly that:
 *
 *  1. Stroke-only. Fills are dropped; a filled shape with no outline is
 *     outlined in its fill colour so it does not vanish.
 *  2. Real units. The page is sized in millimetres and every coordinate is
 *     in mm, rounded to 0.01 mm.
 *  3. Clipped to the page, so the pen never runs off the paper.
 *  4. Shared edges drawn once. Tilings repeat every interior edge (each tile
 *     has its own copy), which doubles plot time and blots the paper.
 *     Segments are de-duplicated on a 0.01 mm grid.
 *  5. Segments are chained back into long polylines, and the polylines are
 *     ordered nearest-neighbour to cut pen-up travel.
 *  6. One <g> per pen colour, labelled as an Inkscape layer so plotter
 *     tools (AxiDraw, vpype) can pause for a pen change.
 */
import type { Scene } from "./pipeline";

export interface PlotOptions {
  /** Page width and height in millimetres. */
  sizeMm?: number;
  /** Blank border in millimetres. */
  marginMm?: number;
  /** Nominal pen width in millimetres, for the on-screen preview only. */
  penMm?: number;
}

export interface PlotStats {
  pens: number;
  /** Continuous pen-down strokes. */
  strokes: number;
  segments: number;
  /** Segments removed because another shape already drew that edge. */
  duplicateSegments: number;
  drawMm: number;
  /** Pen-up travel between strokes, after ordering. */
  travelMm: number;
  /** Pen-up travel if the shapes were plotted in the order they were generated. */
  naiveTravelMm: number;
}

export interface Plot {
  svg: string;
  stats: PlotStats;
}

/** Coordinates snap to 1/100 mm. */
const GRID = 100;

/** Liang-Barsky: clips a segment to [lo, hi]^2. Returns null when nothing is left. */
export function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lo: number,
  hi: number,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [
    [-dx, x0 - lo],
    [dx, hi - x0],
    [-dy, y0 - lo],
    [dy, hi - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/** Largest page side, in mm. Keeps grid coordinates under 16 bits. */
export const MAX_PAGE_MM = 600;

/** Packs a grid point into one number so it can key a Map without string building. */
const pointKey = (x: number, y: number) => x * 65536 + y;

/**
 * Joins loose segments into polylines by walking shared endpoints.
 * `segs` is flat `[x0, y0, x1, y1, ...]` in grid units.
 */
export function chainSegments(segs: readonly number[]): number[][] {
  const count = segs.length / 4;
  const byPoint = new Map<number, number[]>();
  const link = (key: number, id: number) => {
    const list = byPoint.get(key);
    if (list) list.push(id);
    else byPoint.set(key, [id]);
  };
  for (let id = 0; id < count; id++) {
    link(pointKey(segs[4 * id], segs[4 * id + 1]), id);
    link(pointKey(segs[4 * id + 2], segs[4 * id + 3]), id);
  }
  const used = new Uint8Array(count);

  /**
   * Extends `line` from its last point for as long as an unused segment
   * continues it. Where several do (a vertex where lines cross), it prefers
   * the neighbour in generation order, so a curve that touches itself, like
   * a dragon curve, comes out as the one long stroke it was drawn as instead
   * of being cut into loops.
   */
  const extend = (line: number[], from: number) => {
    let last = from;
    for (;;) {
      const x = line[line.length - 2];
      const y = line[line.length - 1];
      const options = byPoint.get(pointKey(x, y));
      if (!options) return;
      let next = -1;
      for (const candidate of options) {
        if (used[candidate]) continue;
        if (candidate === last + 1 || candidate === last - 1) {
          next = candidate;
          break;
        }
        if (next < 0) next = candidate;
      }
      if (next < 0) return;
      used[next] = 1;
      last = next;
      const startsHere = segs[4 * next] === x && segs[4 * next + 1] === y;
      if (startsHere) line.push(segs[4 * next + 2], segs[4 * next + 3]);
      else line.push(segs[4 * next], segs[4 * next + 1]);
    }
  };

  const lines: number[][] = [];
  for (let id = 0; id < count; id++) {
    if (used[id]) continue;
    used[id] = 1;
    const line = [segs[4 * id], segs[4 * id + 1], segs[4 * id + 2], segs[4 * id + 3]];
    extend(line, id);
    // Then grow the other end.
    const flipped: number[] = [];
    for (let i = line.length - 2; i >= 0; i -= 2) flipped.push(line[i], line[i + 1]);
    extend(flipped, id);
    lines.push(flipped);
  }
  return lines;
}

/**
 * Orders polylines greedily: always plot the stroke whose nearer end is
 * closest to where the pen is, reversing it if that end is its tail.
 * A uniform grid over the endpoints keeps the search local, so ordering
 * 20,000 strokes takes milliseconds instead of the seconds a full scan would.
 */
export function orderLines(
  lines: number[][],
  extent: number,
  from: [number, number] = [0, 0],
): number[][] {
  const n = lines.length;
  if (n <= 1) return lines.slice();
  const cells = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(n / 2))));
  const cellSize = extent / cells || 1;
  const buckets: number[][] = Array.from({ length: cells * cells }, () => []);
  const cellOf = (v: number) => Math.max(0, Math.min(cells - 1, Math.floor(v / cellSize)));
  // Endpoint e = 2*line (head) or 2*line + 1 (tail).
  const endX = (e: number) => (e & 1 ? lines[e >> 1][lines[e >> 1].length - 2] : lines[e >> 1][0]);
  const endY = (e: number) => (e & 1 ? lines[e >> 1][lines[e >> 1].length - 1] : lines[e >> 1][1]);
  for (let e = 0; e < 2 * n; e++) buckets[cellOf(endY(e)) * cells + cellOf(endX(e))].push(e);

  const done = new Uint8Array(n);
  const out: number[][] = [];
  let px = from[0];
  let py = from[1];

  for (let placed = 0; placed < n; placed++) {
    const cx = cellOf(px);
    const cy = cellOf(py);
    let best = -1;
    let bestD = Infinity;
    for (let ring = 0; ring < cells; ring++) {
      // Anything in a farther ring is at least (ring - 1) cells away.
      if (best >= 0 && bestD <= ((ring - 1) * cellSize) ** 2) break;
      for (let gy = cy - ring; gy <= cy + ring; gy++) {
        if (gy < 0 || gy >= cells) continue;
        const edgeRow = gy === cy - ring || gy === cy + ring;
        for (let gx = cx - ring; gx <= cx + ring; gx += edgeRow ? 1 : 2 * ring || 1) {
          if (gx < 0 || gx >= cells) continue;
          const bucket = buckets[gy * cells + gx];
          let keep = 0;
          for (let i = 0; i < bucket.length; i++) {
            const e = bucket[i];
            if (done[e >> 1]) continue;
            bucket[keep++] = e;
            const d = (endX(e) - px) ** 2 + (endY(e) - py) ** 2;
            if (d < bestD || (d === bestD && e < best)) {
              bestD = d;
              best = e;
            }
          }
          bucket.length = keep;
        }
      }
    }
    const line = lines[best >> 1];
    done[best >> 1] = 1;
    let chosen = line;
    if (best & 1) {
      chosen = [];
      for (let i = line.length - 2; i >= 0; i -= 2) chosen.push(line[i], line[i + 1]);
    }
    out.push(chosen);
    px = chosen[chosen.length - 2];
    py = chosen[chosen.length - 1];
  }
  return out;
}

function travel(lines: readonly number[][], from: [number, number] = [0, 0]): number {
  let total = 0;
  let px = from[0];
  let py = from[1];
  for (const line of lines) {
    total += Math.hypot(line[0] - px, line[1] - py);
    px = line[line.length - 2];
    py = line[line.length - 1];
  }
  return total;
}

function drawLength(lines: readonly number[][]): number {
  let total = 0;
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      total += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
    }
  }
  return total;
}

const mm = (gridUnits: number) => String(gridUnits / GRID);

export function sceneToPlot(scene: Scene, options: PlotOptions = {}): Plot {
  const size = Math.min(MAX_PAGE_MM, Math.max(20, options.sizeMm ?? 200));
  const margin = Math.min(size / 4, Math.max(0, options.marginMm ?? 10));
  const penMm = options.penMm ?? 0.3;
  const lo = margin;
  const hi = size - margin;
  const span = (hi - lo) / 2;

  // Which paths each pen draws. A path is outlined by its stroke if it has
  // one; otherwise by the colour that fills it.
  const byPen = new Map<number, { pts: number[]; closed: boolean }[]>();
  const strokedLayers = new Set(
    scene.batches.filter((b) => b.kind === "stroke").map((b) => b.layer),
  );
  for (const batch of scene.batches) {
    if (batch.kind === "fill" && strokedLayers.has(batch.layer)) continue;
    const list = byPen.get(batch.pen) ?? [];
    list.push(...batch.paths);
    byPen.set(batch.pen, list);
  }

  const stats: PlotStats = {
    pens: 0,
    strokes: 0,
    segments: 0,
    duplicateSegments: 0,
    drawMm: 0,
    travelMm: 0,
    naiveTravelMm: 0,
  };
  const groups: string[] = [];

  for (const pen of [...byPen.keys()].sort((a, b) => a - b)) {
    const paths = byPen.get(pen) ?? [];
    const segs: number[] = [];
    const seen = new Set<string>();
    const naive: number[][] = [];

    for (const { pts, closed } of paths) {
      const n = pts.length / 2;
      const last = closed ? n : n - 1;
      let current: number[] | null = null;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n;
        const clipped = clipSegment(
          lo + (pts[2 * i] + 1) * span,
          lo + (pts[2 * i + 1] + 1) * span,
          lo + (pts[2 * j] + 1) * span,
          lo + (pts[2 * j + 1] + 1) * span,
          lo,
          hi,
        );
        if (!clipped) {
          current = null;
          continue;
        }
        const x0 = Math.round(clipped[0] * GRID);
        const y0 = Math.round(clipped[1] * GRID);
        const x1 = Math.round(clipped[2] * GRID);
        const y1 = Math.round(clipped[3] * GRID);
        if (x0 === x1 && y0 === y1) continue;

        // The un-optimized plot, for comparison: every shape as generated.
        if (current && current[current.length - 2] === x0 && current[current.length - 1] === y0) {
          current.push(x1, y1);
        } else {
          current = [x0, y0, x1, y1];
          naive.push(current);
        }

        const a = pointKey(x0, y0);
        const b = pointKey(x1, y1);
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (seen.has(key)) {
          stats.duplicateSegments++;
          continue;
        }
        seen.add(key);
        segs.push(x0, y0, x1, y1);
      }
    }
    if (segs.length === 0) continue;

    const lines = orderLines(chainSegments(segs), size * GRID);
    stats.pens += 1;
    stats.strokes += lines.length;
    stats.segments += segs.length / 4;
    stats.drawMm += drawLength(lines) / GRID;
    stats.travelMm += travel(lines) / GRID;
    stats.naiveTravelMm += travel(naive) / GRID;

    const color = scene.palette[pen] ?? "#000000";
    const body = lines
      .map((line) => {
        let d = `M${mm(line[0])} ${mm(line[1])}`;
        for (let i = 2; i < line.length; i += 2) d += `L${mm(line[i])} ${mm(line[i + 1])}`;
        return `<path d="${d}"/>`;
      })
      .join("\n");
    groups.push(
      `<g id="pen-${pen + 1}" inkscape:groupmode="layer" inkscape:label="${pen + 1} ${color}" fill="none" stroke="${color}" stroke-width="${penMm}" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</g>`,
    );
  }

  const title = scene.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">`,
    `<title>${title}</title>`,
    ...groups,
    "</svg>",
  ].join("\n");

  for (const key of ["drawMm", "travelMm", "naiveTravelMm"] as const) {
    stats[key] = Math.round(stats[key] * 10) / 10;
  }
  return { svg, stats };
}
