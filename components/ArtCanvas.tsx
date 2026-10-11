"use client";

import { useEffect, useRef } from "react";
import { paintScene } from "@/lib/geometry/canvas";
import type { Scene } from "@/lib/geometry/pipeline";

interface ArtCanvasProps {
  scene: Scene;
  /** Read by screen readers in place of the picture. */
  label: string;
  className?: string;
}

/**
 * Paints a scene onto a square canvas and repaints when the scene or the
 * element's size changes. The backing store follows the device pixel ratio
 * (capped at 2) so lines stay crisp without burning memory on 3x phones.
 */
export function ArtCanvas({ scene, label, className = "" }: ArtCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const side = canvas.clientWidth;
      if (side === 0) return;
      const pixels = Math.round(side * Math.min(window.devicePixelRatio || 1, 2));
      if (canvas.width !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) paintScene(ctx, scene, pixels);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scene]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={`block aspect-square w-full ${className}`}
    />
  );
}
