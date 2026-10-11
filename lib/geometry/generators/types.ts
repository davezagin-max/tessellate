/** One path in the motif's own frame, where the motif roughly fills the unit circle. */
export interface MotifPath {
  /** Flat `[x0, y0, x1, y1, ...]`. */
  pts: number[];
  closed: boolean;
  /** 0 for regular tiles, 1 for "alternate" tiles that take the layer's `altFill`. */
  tag: 0 | 1;
}

/** Shrinks a polygon toward its vertex centroid by `inset` (0 leaves it unchanged). */
export function insetPolygon(pts: number[], inset: number): number[] {
  if (inset <= 0) return pts;
  const n = pts.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    cx += pts[i];
    cy += pts[i + 1];
  }
  cx /= n;
  cy /= n;
  const k = 1 - inset;
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = cx + (pts[i] - cx) * k;
    out[i + 1] = cy + (pts[i + 1] - cy) * k;
  }
  return out;
}

/** Signed area of a closed polygon (shoelace formula). */
export function signedArea(pts: readonly number[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return sum / 2;
}
