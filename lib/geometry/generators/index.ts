import type { Layer } from "../dsl";
import type { Rng } from "../rng";
import { lsystem } from "./lsystem";
import { penrose } from "./penrose";
import { polygon } from "./polygon";
import { subdivision } from "./subdivision";
import type { MotifPath } from "./types";
import { voronoi } from "./voronoi";

/** Runs a layer's generator. Output is in the motif's own frame (radius about 1). */
export function generateMotif(layer: Layer, rng: Rng): MotifPath[] {
  switch (layer.generator) {
    case "polygon":
      return polygon(layer);
    case "lsystem":
      return lsystem(layer);
    case "voronoi":
      return voronoi(layer, rng);
    case "penrose":
      return penrose(layer);
    case "subdivision":
      return subdivision(layer, rng);
  }
}

export type { MotifPath };
