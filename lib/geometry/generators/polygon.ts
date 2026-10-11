import type { Layer } from "../dsl";
import type { MotifPath } from "./types";

/** Vertices of a regular n-gon of radius 1 with the first vertex pointing up. */
export function regularPolygon(sides: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < sides; k++) {
    const theta = -Math.PI / 2 + (2 * Math.PI * k) / sides;
    pts.push(Math.cos(theta), Math.sin(theta));
  }
  return pts;
}

/**
 * A regular polygon, a star, or (with two sides) a line segment.
 * `inset` above 0 adds an inner vertex between each pair of corners, at
 * radius `1 - inset`, which turns the polygon into a star.
 */
export function polygon(layer: Pick<Layer, "sides" | "inset">): MotifPath[] {
  const { sides, inset } = layer;
  if (sides === 2) return [{ pts: [-1, 0, 1, 0], closed: false, tag: 0 }];
  if (inset <= 0) return [{ pts: regularPolygon(sides), closed: true, tag: 0 }];
  const inner = 1 - inset;
  const pts: number[] = [];
  for (let k = 0; k < sides; k++) {
    const outerAngle = -Math.PI / 2 + (2 * Math.PI * k) / sides;
    const innerAngle = outerAngle + Math.PI / sides;
    pts.push(Math.cos(outerAngle), Math.sin(outerAngle));
    pts.push(inner * Math.cos(innerAngle), inner * Math.sin(innerAngle));
  }
  return [{ pts, closed: true, tag: 0 }];
}
