/**
 * Seeded pseudo-random numbers. Nothing in the geometry pipeline may call
 * `Math.random`: the same program must always produce the same artwork.
 */

/** Mixes a seed and a stream index into one 32-bit state (splitmix-style finalizer). */
export function mixSeed(seed: number, stream: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((stream + 1) | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export type Rng = () => number;

/** mulberry32: small, fast, and good enough for layout jitter. Returns floats in [0, 1). */
export function createRng(seed: number, stream = 0): Rng {
  let state = mixSeed(seed, stream);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, as 8 hex characters. Used for render snapshots. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
