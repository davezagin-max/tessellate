/**
 * The twelve gallery presets. Each one is an ordinary program in the geometry
 * language, written by hand, plus the plain-English prompt that describes it.
 * They render with no model call at all.
 *
 * Presets with `session: true` also have a recorded refinement session in
 * `fixtures/`, so "Watch Claude refine this" works without a key.
 */
import { defaultLayer as layer, type Program } from "./geometry/dsl";

export interface Preset {
  id: string;
  title: string;
  /** What a visitor would type to ask for this pattern. */
  prompt: string;
  /** One line for the gallery label: what the program is made of. */
  note: string;
  session: boolean;
  program: Program;
}

const INK = "#141414";
const VERMILION = "#e2401c";
const WHITE = "#ffffff";

/** Scale between nested regular n-gons so each copy's corners touch the previous copy's sides. */
const pursuit = (sides: number, degrees: number) => {
  const half = Math.PI / sides;
  return Number((Math.cos(half) / Math.cos(half - (degrees * Math.PI) / 180)).toFixed(4));
};

export const PRESETS: Preset[] = [
  {
    id: "star-and-cross",
    title: "Star and Cross",
    prompt:
      "An Islamic star-and-cross tiling: eight-point stars in fine ink lines that meet tip to tip, with a small vermilion star set inside each one.",
    note: "p4m · three polygon layers",
    session: true,
    program: {
      title: "Star and Cross",
      seed: 8,
      background: WHITE,
      palette: [INK, VERMILION, WHITE],
      layers: [
        layer({
          symmetry: "p4m",
          cell: 0.5,
          sides: 8,
          inset: 0.2346,
          size: 0.5,
          stroke: 0,
          strokeWidth: 2.5,
        }),
        layer({
          symmetry: "p4m",
          cell: 0.5,
          sides: 8,
          inset: 0.2346,
          size: 0.27,
          rotation: 22.5,
          stroke: 0,
          strokeWidth: 1.5,
          fill: 1,
        }),
        layer({
          symmetry: "p4m",
          cell: 0.5,
          x: 0.5,
          y: 0.5,
          sides: 4,
          size: 0.1,
          stroke: 0,
          strokeWidth: 1.5,
          fill: 0,
        }),
      ],
    },
  },
  {
    id: "penrose-sun",
    title: "Penrose Sun",
    prompt:
      "A Penrose rhomb tiling radiating from a five-fold centre, full bleed, with the thin rhombs in vermilion and fine ink outlines.",
    note: "Penrose P3 · depth 5",
    session: true,
    program: {
      title: "Penrose Sun",
      seed: 5,
      background: WHITE,
      palette: [INK, VERMILION, WHITE],
      layers: [
        layer({
          generator: "penrose",
          depth: 5,
          size: 1.5,
          rotation: 18,
          stroke: 0,
          strokeWidth: 1.75,
          fill: -1,
          altFill: 1,
        }),
      ],
    },
  },
  {
    id: "leaded-glass",
    title: "Leaded Glass",
    prompt:
      "A leaded-glass window: evenly sized irregular panes with dark gaps between them, most panes white and a scattering in vermilion.",
    note: "Voronoi · 90 relaxed cells",
    session: true,
    program: {
      title: "Leaded Glass",
      seed: 21,
      background: INK,
      palette: [INK, VERMILION, WHITE],
      layers: [
        layer({
          generator: "voronoi",
          count: 90,
          jitter: 0.25,
          inset: 0.09,
          size: 1.02,
          stroke: -1,
          fill: 2,
          altFill: 1,
        }),
      ],
    },
  },
  {
    id: "koch-field",
    title: "Koch Field",
    prompt:
      "Koch snowflakes tiling the plane: large ones filled vermilion on a hexagonal lattice, with small white ones locking into the gaps.",
    note: "L-system · p6m",
    session: false,
    program: {
      title: "Koch Field",
      seed: 6,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({
          generator: "lsystem",
          symmetry: "p6m",
          cell: 0.7,
          axiom: "F--F--F",
          rules: "F=F+F--F+F",
          angle: 60,
          depth: 3,
          size: 0.5,
          stroke: 0,
          strokeWidth: 1.5,
          fill: 1,
        }),
        layer({
          generator: "lsystem",
          symmetry: "p6m",
          cell: 0.7,
          x: 0.5,
          y: 0.2887,
          axiom: "F--F--F",
          rules: "F=F+F--F+F",
          angle: 60,
          depth: 3,
          size: 0.2887,
          rotation: 30,
          stroke: 0,
          strokeWidth: 1.5,
        }),
      ],
    },
  },
  {
    id: "pursuit",
    title: "Pursuit",
    prompt:
      "Whirling nested squares tiling the plane, with neighbouring whirls turning in opposite directions.",
    note: "p4g · nested squares",
    session: false,
    program: {
      title: "Pursuit",
      seed: 4,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({
          symmetry: "p4g",
          cell: 1,
          sides: 4,
          size: 0.5,
          repeat: 18,
          rotateStep: 7,
          scaleStep: pursuit(4, 7),
          stroke: 0,
          strokeWidth: 1.5,
        }),
      ],
    },
  },
  {
    id: "flower-of-life",
    title: "Flower of Life",
    prompt:
      "The flower of life: overlapping circles on a hexagonal lattice in thin ink, with one bold vermilion ring around the centre.",
    note: "p6m · circles",
    session: false,
    program: {
      title: "Flower of Life",
      seed: 1,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({ symmetry: "p6m", cell: 0.34, sides: 64, size: 1, stroke: 0, strokeWidth: 1.5 }),
        layer({ sides: 64, size: 0.68, stroke: 1, strokeWidth: 7 }),
        layer({ sides: 64, size: 0.045, stroke: -1, fill: 1 }),
      ],
    },
  },
  {
    id: "composition",
    title: "Composition",
    prompt:
      "A Mondrian-style composition: bold black grid lines dividing uneven rectangles, a few filled vermilion.",
    note: "Recursive subdivision · depth 6",
    session: false,
    program: {
      title: "Composition",
      seed: 3,
      background: WHITE,
      palette: [INK, VERMILION, WHITE],
      layers: [
        layer({
          generator: "subdivision",
          sides: 4,
          depth: 6,
          jitter: 0.9,
          size: 1.3,
          rotation: 45,
          stroke: 0,
          strokeWidth: 9,
          fill: 2,
          altFill: 1,
        }),
      ],
    },
  },
  {
    id: "triangle-whirl",
    title: "Triangle Whirl",
    prompt:
      "A triangular grid where every triangle holds a whirl of nested triangles, alternating direction between neighbours.",
    note: "p31m · nested triangles",
    session: false,
    program: {
      title: "Triangle Whirl",
      seed: 3,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({
          symmetry: "p31m",
          cell: 0.8,
          x: 0.5,
          y: 0.2887,
          sides: 3,
          size: 0.5774,
          rotation: 180,
          repeat: 14,
          rotateStep: 8,
          scaleStep: pursuit(3, 8),
          stroke: 0,
          strokeWidth: 1.5,
        }),
      ],
    },
  },
  {
    id: "dahlia",
    title: "Dahlia",
    prompt:
      "A dahlia made of rings of discs that shrink and twist toward the centre, alternating vermilion and white.",
    note: "Spiral nesting · C16",
    session: false,
    program: {
      title: "Dahlia",
      seed: 9,
      background: WHITE,
      palette: [INK, VERMILION, WHITE],
      layers: [
        layer({
          symmetry: "radial",
          order: 16,
          y: -0.78,
          sides: 64,
          size: 0.15,
          repeat: 9,
          spiral: true,
          scaleStep: 0.8,
          rotateStep: 11.25,
          stroke: 0,
          strokeWidth: 1.25,
          fill: 2,
          altFill: 1,
        }),
      ],
    },
  },
  {
    id: "dragon",
    title: "Heighway Dragon",
    prompt: "A Heighway dragon curve drawn as one unbroken white line on black.",
    note: "L-system · 4,096 segments",
    session: false,
    program: {
      title: "Heighway Dragon",
      seed: 12,
      background: INK,
      palette: [WHITE, VERMILION],
      layers: [
        layer({
          generator: "lsystem",
          axiom: "FX",
          rules: "X=X+YF+;Y=-FX-Y",
          angle: 90,
          depth: 12,
          size: 0.86,
          stroke: 0,
          strokeWidth: 1.75,
        }),
      ],
    },
  },
  {
    id: "rose-window",
    title: "Rose Window",
    prompt:
      "A twelve-fold rose window: twelve large circles through the centre, a ring of vermilion dots, and a small star in the middle.",
    note: "C12 · four layers",
    session: false,
    program: {
      title: "Rose Window",
      seed: 2,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({
          symmetry: "radial",
          order: 12,
          y: -0.44,
          sides: 64,
          size: 0.44,
          stroke: 0,
          strokeWidth: 1.25,
        }),
        layer({
          symmetry: "radial",
          order: 12,
          y: -0.66,
          sides: 64,
          size: 0.045,
          stroke: -1,
          fill: 1,
        }),
        layer({ sides: 12, inset: 0.5, size: 0.22, stroke: 0, strokeWidth: 1.5, fill: 1 }),
        layer({ sides: 64, size: 0.9, repeat: 2, scaleStep: 1.04, stroke: 0, strokeWidth: 2 }),
      ],
    },
  },
  {
    id: "fern-wreath",
    title: "Fern Wreath",
    prompt:
      "Seven fern fronds growing outward in a ring, drawn in hairline ink around a vermilion dot.",
    note: "Branching L-system · C7",
    session: false,
    program: {
      title: "Fern Wreath",
      seed: 7,
      background: WHITE,
      palette: [INK, VERMILION],
      layers: [
        layer({
          generator: "lsystem",
          symmetry: "radial",
          order: 7,
          y: -0.5,
          axiom: "X",
          rules: "X=F+[[X]-X]-F[-FX]+X;F=FF",
          angle: 25,
          depth: 5,
          size: 0.42,
          stroke: 0,
          strokeWidth: 1.25,
        }),
        layer({ sides: 64, size: 0.08, stroke: -1, fill: 1 }),
      ],
    },
  },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
);

export const DEFAULT_PRESET = PRESETS[0];
