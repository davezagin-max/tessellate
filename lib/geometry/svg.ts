/**
 * Scene -> SVG string. Pure string building, so it runs anywhere (browser,
 * server, tests) and its output can be hashed for the determinism snapshot.
 *
 * Each batch becomes one compound <path>. That mirrors the Canvas painter
 * exactly: a batch is filled or stroked once, so overlapping copies inside a
 * batch blend the same way on both back ends.
 */
import type { Scene, ScenePath } from "./pipeline";

/** The drawing is written in a 1000-unit box, so a stroke width of 2 is 2/1000 of the canvas. */
export const SVG_BOX = 1000;

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Canvas units (-1..1) to box units, rounded to 0.01 so the text is stable and compact. */
export function fmt(v: number): string {
  const n = Math.round((v + 1) * (SVG_BOX / 2) * 100) / 100;
  return String(n === 0 ? 0 : n);
}

export function pathData(paths: readonly ScenePath[]): string {
  let d = "";
  for (const { pts, closed } of paths) {
    d += `M${fmt(pts[0])} ${fmt(pts[1])}`;
    for (let i = 2; i < pts.length; i += 2) d += `L${fmt(pts[i])} ${fmt(pts[i + 1])}`;
    if (closed) d += "Z";
  }
  return d;
}

const attr = (name: string, value: number) =>
  value < 1 ? ` ${name}="${Number(value.toFixed(3))}"` : "";

export function sceneToSvg(scene: Scene, options: { size?: number } = {}): string {
  const size = options.size ?? SVG_BOX;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SVG_BOX} ${SVG_BOX}">`,
    `<title>${escapeXml(scene.title)}</title>`,
    `<rect width="${SVG_BOX}" height="${SVG_BOX}" fill="${scene.background}"/>`,
  ];
  for (const batch of scene.batches) {
    const d = pathData(batch.paths);
    if (batch.kind === "fill") {
      parts.push(`<path d="${d}" fill="${batch.color}"${attr("fill-opacity", batch.opacity)}/>`);
    } else {
      parts.push(
        `<path d="${d}" fill="none" stroke="${batch.color}" stroke-width="${batch.width}"${attr(
          "stroke-opacity",
          batch.opacity,
        )} stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}
