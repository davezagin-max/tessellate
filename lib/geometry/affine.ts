/**
 * 2D affine maps in the same order Canvas and SVG use:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];
export type Vec = readonly [x: number, y: number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

const RAD = Math.PI / 180;

export function translate(x: number, y: number): Affine {
  return [1, 0, 0, 1, x, y];
}

export function scale(s: number): Affine {
  return [s, 0, 0, s, 0, 0];
}

export function rotate(degrees: number): Affine {
  const cos = Math.cos(degrees * RAD);
  const sin = Math.sin(degrees * RAD);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Mirror across the line through the origin at `degrees` from the x axis. */
export function mirror(degrees: number): Affine {
  const cos = Math.cos(2 * degrees * RAD);
  const sin = Math.sin(2 * degrees * RAD);
  return [cos, sin, sin, -cos, 0, 0];
}

/** `compose(m, n)` applies `n` first, then `m`. */
export function compose(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Affine, x: number, y: number): Vec {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Maps a flat `[x0, y0, x1, y1, ...]` array into a new array. */
export function applyFlat(m: Affine, pts: readonly number[]): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    out[i] = m[0] * x + m[2] * y + m[4];
    out[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return out;
}

export function determinant(m: Affine): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** True when the linear part is orthogonal, so the map preserves every distance. */
export function isIsometry(m: Affine, eps = 1e-9): boolean {
  const [a, b, c, d] = m;
  return (
    Math.abs(a * a + b * b - 1) < eps &&
    Math.abs(c * c + d * d - 1) < eps &&
    Math.abs(a * c + b * d) < eps
  );
}
