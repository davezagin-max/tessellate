/**
 * Browser-only helpers: rasterize a scene and hand files to the visitor.
 * Nothing here is imported by the geometry pipeline or by server code.
 */
import { paintScene } from "./geometry/canvas";
import type { Scene } from "./geometry/pipeline";

/** Largest side, in pixels, of the PNG sent to Claude for review. */
export const REVIEW_PIXELS = 1024;

function rasterize(scene: Scene, pixels: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create a 2D canvas.");
  paintScene(ctx, scene, pixels);
  return canvas;
}

/** Renders a scene to a PNG data URL. */
export function renderPngDataUrl(scene: Scene, pixels: number = REVIEW_PIXELS): string {
  return rasterize(scene, pixels).toDataURL("image/png");
}

/**
 * The PNG Claude reviews: 1024 pixels wide, stepping down if an unusually
 * dense artwork would not fit in the request. Typical renders are 0.3 to
 * 0.7 MB; the cap is about 1.9 MB.
 */
export function renderForReview(scene: Scene, maxChars: number): string {
  let image = "";
  for (const pixels of [REVIEW_PIXELS, 768, 512]) {
    image = renderPngDataUrl(scene, pixels);
    if (image.length <= maxChars) break;
  }
  return image;
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a moment to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(filename: string, text: string, type: string): void {
  save(new Blob([text], { type }), filename);
}

export function downloadPng(scene: Scene, pixels: number, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rasterize(scene, pixels).toBlob((blob) => {
      if (!blob) return reject(new Error("Could not encode the PNG."));
      save(blob, filename);
      resolve();
    }, "image/png");
  });
}

/** `"Star and Cross"` -> `"star-and-cross"`. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tessellate";
}

/** A fresh seed for the "new seed" button. UI-only; the pipeline itself never draws entropy. */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % 1_000_000;
}
