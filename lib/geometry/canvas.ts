/**
 * Scene -> Canvas 2D. The second back end; it paints the same batches the
 * SVG writer serializes, in the same order, with the same join and fill rules.
 */
import type { Scene } from "./pipeline";

/** The subset of CanvasRenderingContext2D the painter uses (also satisfied by OffscreenCanvas). */
export type PaintContext = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "fillRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "lineCap"
  | "globalAlpha"
>;

/** Paints `scene` onto a square canvas that is `pixels` wide. */
export function paintScene(ctx: PaintContext, scene: Scene, pixels: number): void {
  const half = pixels / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, pixels, pixels);
  // Map canvas units (-1..1) onto the pixel grid.
  ctx.setTransform(half, 0, 0, half, half, half);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const batch of scene.batches) {
    ctx.beginPath();
    for (const { pts, closed } of batch.paths) {
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      if (closed) ctx.closePath();
    }
    ctx.globalAlpha = batch.opacity;
    if (batch.kind === "fill") {
      ctx.fillStyle = batch.color;
      ctx.fill();
    } else {
      ctx.strokeStyle = batch.color;
      // Widths are in thousandths of the canvas width, and the canvas is 2 units wide.
      ctx.lineWidth = batch.width * 0.002;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
