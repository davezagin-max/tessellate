/**
 * The Tessellate geometry language.
 *
 * A program is plain JSON: a seed, a palette, and a short list of layers.
 * Each layer picks one generator (what to draw) and one symmetry (how to
 * repeat it), then sets a flat list of parameters.
 *
 * The shape is flat on purpose. Claude writes programs through structured
 * outputs, which reject recursive schemas and numeric bounds, so every layer
 * carries every parameter and the bounds live in `PARAMS` below. That one
 * table drives three things: the validator's clamps, the slider panel, and
 * the language reference in the model's system prompt.
 */
import { z } from "zod";

export const GENERATORS = ["polygon", "lsystem", "voronoi", "penrose", "subdivision"] as const;
export type Generator = (typeof GENERATORS)[number];

export const WALLPAPER_GROUPS = [
  "p1",
  "p2",
  "pm",
  "pg",
  "cm",
  "pmm",
  "pmg",
  "pgg",
  "cmm",
  "p4",
  "p4m",
  "p4g",
  "p3",
  "p3m1",
  "p31m",
  "p6",
  "p6m",
] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];

export const SYMMETRIES = ["none", "radial", ...WALLPAPER_GROUPS] as const;
export type Symmetry = (typeof SYMMETRIES)[number];

export function isWallpaper(symmetry: Symmetry): symmetry is WallpaperGroup {
  return symmetry !== "none" && symmetry !== "radial";
}

/** Groups whose cell is a free rectangle, so `cellAspect` applies. */
export const RECTANGULAR_GROUPS: readonly Symmetry[] = [
  "p1",
  "p2",
  "pm",
  "pg",
  "cm",
  "pmm",
  "pmg",
  "pgg",
  "cmm",
];

/** Hard limits. The validator enforces them before anything is drawn. */
export const LIMITS = {
  maxLayers: 8,
  maxPalette: 6,
  /** Closed or open paths in the final artwork, after symmetry. */
  maxPaths: 20_000,
  /** Total vertices across all paths. */
  maxVertices: 200_000,
  maxTitle: 80,
  maxSeed: 999_999,
  maxAxiom: 40,
  maxRules: 240,
  /** Symbols in an expanded L-system string. */
  maxSymbols: 60_000,
} as const;

/** The wire shape of one layer. Every field is required; bounds are checked by the validator. */
export const LayerSchema = z.object({
  generator: z.enum(GENERATORS),
  symmetry: z.enum(SYMMETRIES),
  x: z.number(),
  y: z.number(),
  size: z.number(),
  rotation: z.number(),
  repeat: z.number(),
  scaleStep: z.number(),
  rotateStep: z.number(),
  spiral: z.boolean(),
  order: z.number(),
  mirror: z.boolean(),
  cell: z.number(),
  cellAspect: z.number(),
  sides: z.number(),
  inset: z.number(),
  depth: z.number(),
  count: z.number(),
  jitter: z.number(),
  angle: z.number(),
  axiom: z.string(),
  rules: z.string(),
  stroke: z.number(),
  strokeWidth: z.number(),
  fill: z.number(),
  altFill: z.number(),
  opacity: z.number(),
});

export const ProgramSchema = z.object({
  title: z.string(),
  seed: z.number(),
  background: z.string(),
  palette: z.array(z.string()),
  layers: z.array(LayerSchema),
});

export type Layer = z.infer<typeof LayerSchema>;
export type Program = z.infer<typeof ProgramSchema>;

export type NumericKey = {
  [K in keyof Layer]: Layer[K] extends number ? K : never;
}[keyof Layer];

export interface ParamSpec {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  /** Slider step. Integer parameters use 1. */
  step: number;
  integer: boolean;
  group: "placement" | "repeat" | "symmetry" | "shape" | "style";
  /** One line for the model and for the slider tooltip. */
  doc: string;
  /** Generators that read this parameter. Omitted means all of them. */
  generators?: readonly Generator[];
  /** Symmetry classes that read this parameter. Omitted means all of them. */
  symmetry?: "radial" | "wallpaper" | "rectangular";
  /** Tighter upper bounds for specific generators. */
  maxFor?: Partial<Record<Generator, number>>;
  minFor?: Partial<Record<Generator, number>>;
}

export const PARAMS: readonly ParamSpec[] = [
  {
    key: "x",
    label: "Offset X",
    min: -2,
    max: 2,
    step: 0.01,
    integer: false,
    group: "placement",
    doc: "Motif centre, horizontal. Canvas units (the canvas spans -1 to 1) for none and radial; cell lengths for wallpaper groups.",
  },
  {
    key: "y",
    label: "Offset Y",
    min: -2,
    max: 2,
    step: 0.01,
    integer: false,
    group: "placement",
    doc: "Motif centre, vertical (positive is down). Same units as x.",
  },
  {
    key: "size",
    label: "Size",
    min: 0.01,
    max: 2,
    step: 0.01,
    integer: false,
    group: "placement",
    doc: "Motif radius, in the same units as x and y.",
  },
  {
    key: "rotation",
    label: "Rotation",
    min: -360,
    max: 360,
    step: 1,
    integer: false,
    group: "placement",
    doc: "Motif rotation in degrees about its own centre.",
  },
  {
    key: "repeat",
    label: "Nested copies",
    min: 1,
    max: 40,
    step: 1,
    integer: true,
    group: "repeat",
    doc: "Number of nested copies. Copy k is scaled by scaleStep^k and turned by k*rotateStep. 1 draws the motif once.",
  },
  {
    key: "scaleStep",
    label: "Scale per copy",
    min: 0.5,
    max: 1.5,
    step: 0.005,
    integer: false,
    group: "repeat",
    doc: "Scale factor between nested copies. Ignored when repeat is 1.",
  },
  {
    key: "rotateStep",
    label: "Turn per copy",
    min: -180,
    max: 180,
    step: 0.5,
    integer: false,
    group: "repeat",
    doc: "Degrees turned between nested copies. Ignored when repeat is 1.",
  },
  {
    key: "order",
    label: "Rotational order",
    min: 1,
    max: 48,
    step: 1,
    integer: true,
    group: "symmetry",
    symmetry: "radial",
    doc: "Radial symmetry only: number of rotated copies around the canvas centre.",
  },
  {
    key: "cell",
    label: "Cell size",
    min: 0.08,
    max: 2,
    step: 0.01,
    integer: false,
    group: "symmetry",
    symmetry: "wallpaper",
    doc: "Wallpaper groups only: length of the lattice cell in canvas units. 0.5 puts four cells across the canvas.",
  },
  {
    key: "cellAspect",
    label: "Cell aspect",
    min: 0.4,
    max: 2.5,
    step: 0.01,
    integer: false,
    group: "symmetry",
    symmetry: "rectangular",
    doc: "Height over width of the cell, for groups with a rectangular cell (p1, p2, pm, pg, cm, pmm, pmg, pgg, cmm). Ignored by square and hexagonal groups.",
  },
  {
    key: "sides",
    label: "Sides",
    min: 2,
    max: 64,
    step: 1,
    integer: true,
    group: "shape",
    generators: ["polygon", "subdivision"],
    minFor: { subdivision: 3 },
    maxFor: { subdivision: 8 },
    doc: "polygon: number of sides (2 is a line segment, 64 reads as a circle). subdivision: sides of the starting shape, 3 to 8.",
  },
  {
    key: "inset",
    label: "Inset",
    min: 0,
    max: 0.95,
    step: 0.01,
    integer: false,
    group: "shape",
    generators: ["polygon", "voronoi", "penrose", "subdivision"],
    doc: "polygon: 0 is a regular polygon, above 0 pulls every second vertex inward to make a star. voronoi, penrose, subdivision: shrinks each tile toward its centre to leave gaps.",
  },
  {
    key: "depth",
    label: "Depth",
    min: 0,
    max: 14,
    step: 1,
    integer: true,
    group: "shape",
    generators: ["lsystem", "penrose", "subdivision"],
    maxFor: { lsystem: 14, penrose: 7, subdivision: 10 },
    doc: "lsystem: rewriting iterations (0 to 14, and the expanded string must stay under 60,000 symbols). penrose: deflation steps (0 to 7). subdivision: recursion depth (0 to 10).",
  },
  {
    key: "count",
    label: "Cells",
    min: 2,
    max: 400,
    step: 1,
    integer: true,
    group: "shape",
    generators: ["voronoi"],
    doc: "voronoi: number of cells.",
  },
  {
    key: "jitter",
    label: "Randomness",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
    group: "shape",
    generators: ["voronoi", "subdivision"],
    doc: "voronoi: 1 is raw random cells, 0 is fully relaxed and even. subdivision: 0 splits at exact midpoints, 1 splits unevenly and stops early at random.",
  },
  {
    key: "angle",
    label: "Turn angle",
    min: 0,
    max: 180,
    step: 0.5,
    integer: false,
    group: "shape",
    generators: ["lsystem"],
    doc: "lsystem: degrees turned by + and -.",
  },
  {
    key: "stroke",
    label: "Line colour",
    min: -1,
    max: LIMITS.maxPalette - 1,
    step: 1,
    integer: true,
    group: "style",
    doc: "Palette index for the outline, or -1 for no outline.",
  },
  {
    key: "strokeWidth",
    label: "Line width",
    min: 0.25,
    max: 24,
    step: 0.25,
    integer: false,
    group: "style",
    doc: "Outline width in thousandths of the canvas width. 2 is a fine line, 8 is bold.",
  },
  {
    key: "fill",
    label: "Fill",
    min: -1,
    max: LIMITS.maxPalette - 1,
    step: 1,
    integer: true,
    group: "style",
    doc: "Palette index for the fill of closed shapes, or -1 for none.",
  },
  {
    key: "altFill",
    label: "Alternate fill",
    min: -1,
    max: LIMITS.maxPalette - 1,
    step: 1,
    integer: true,
    group: "style",
    doc: "Fill for alternate tiles: Penrose thin rhombs, a random quarter of Voronoi and subdivision cells, every second nested copy. -1 leaves them unfilled; set equal to fill for one flat colour.",
  },
  {
    key: "opacity",
    label: "Opacity",
    min: 0.05,
    max: 1,
    step: 0.01,
    integer: false,
    group: "style",
    doc: "Layer opacity from 0.05 to 1.",
  },
];

/** The numeric range that applies to `key` for a given generator. */
export function rangeFor(spec: ParamSpec, generator: Generator): { min: number; max: number } {
  return {
    min: spec.minFor?.[generator] ?? spec.min,
    max: spec.maxFor?.[generator] ?? spec.max,
  };
}

/** Whether a layer actually reads `key`. Ignored parameters are hidden in the UI. */
export function paramApplies(
  spec: ParamSpec,
  layer: Pick<Layer, "generator" | "symmetry" | "repeat">,
): boolean {
  if (spec.generators && !spec.generators.includes(layer.generator)) return false;
  if (spec.symmetry === "radial" && layer.symmetry !== "radial") return false;
  if (spec.symmetry === "wallpaper" && !isWallpaper(layer.symmetry)) return false;
  if (spec.symmetry === "rectangular" && !RECTANGULAR_GROUPS.includes(layer.symmetry)) return false;
  if ((spec.key === "scaleStep" || spec.key === "rotateStep") && layer.repeat <= 1) return false;
  return true;
}

export const GENERATOR_DOCS: Record<Generator, string> = {
  polygon:
    "A regular polygon or star. Uses sides and inset. With repeat above 1 it draws nested, turning copies (whirls, concentric rings).",
  lsystem:
    "An L-system drawn by a turtle and scaled to fit the motif size. Uses axiom, rules, angle, depth. Symbols: F and G draw forward, f moves without drawing, + and - turn by angle, | turns 180, [ and ] push and pop the turtle. Any other letter is a placeholder. Rules are written as 'F=F+F--F+F;X=FX' separated by semicolons.",
  voronoi:
    "Voronoi cells of seeded random points inside a square of half-width size. Uses count, jitter, inset.",
  penrose:
    "A Penrose P3 rhomb tiling (thick and thin rhombs) grown from a ten-fold sun by deflation. Uses depth and inset. The patch is a decagon of radius size.",
  subdivision:
    "Recursive subdivision of a regular polygon into smaller cells. Uses sides (3 for triangles, 4 for a Mondrian-like grid), depth, jitter, inset.",
};

export const SYMMETRY_DOCS: Record<Symmetry, string> = {
  none: "No repetition.",
  radial:
    "order rotated copies around the canvas centre; mirror adds reflections (a kaleidoscope).",
  p1: "Translations only. Rectangular cell.",
  p2: "Half-turns. Rectangular cell.",
  pm: "Parallel mirrors. Rectangular cell.",
  pg: "Parallel glide reflections. Rectangular cell.",
  cm: "Mirrors with glides between them. Centred rectangular cell.",
  pmm: "Mirrors in two perpendicular directions. Rectangular cell.",
  pmg: "Mirrors one way, glides the other, with half-turns. Rectangular cell.",
  pgg: "Glides in both directions with half-turns, no mirrors. Rectangular cell.",
  cmm: "Perpendicular mirrors plus extra half-turns. Centred rectangular cell.",
  p4: "Quarter-turns, no mirrors. Square cell.",
  p4m: "Quarter-turns with mirrors through them (square kaleidoscope). Square cell.",
  p4g: "Quarter-turns with mirrors that miss them (pinwheel, basket weave). Square cell.",
  p3: "Third-turns, no mirrors. Hexagonal cell.",
  p3m1: "Third-turns, every centre on a mirror. Hexagonal cell.",
  p31m: "Third-turns, some centres off the mirrors. Hexagonal cell.",
  p6: "Sixth-turns, no mirrors. Hexagonal cell.",
  p6m: "Sixth-turns with mirrors (hexagonal kaleidoscope). Hexagonal cell.",
};

/** The two boolean parameters, documented in the same place as the numeric ones. */
export const FLAG_DOCS = {
  spiral:
    "Only matters when repeat is above 1. false: nested copies shrink and turn in place about the motif's own centre (whirls, concentric rings). true: they turn about the layer origin instead, so an offset motif sweeps out a spiral.",
  mirror:
    "Radial symmetry only: true adds mirror images, which doubles the copies (a kaleidoscope).",
} as const;

/** A neutral layer: one outlined hexagon. The starting point for presets and tests. */
export function defaultLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    generator: "polygon",
    symmetry: "none",
    x: 0,
    y: 0,
    size: 0.5,
    rotation: 0,
    repeat: 1,
    scaleStep: 1,
    rotateStep: 0,
    spiral: false,
    order: 6,
    mirror: false,
    cell: 0.5,
    cellAspect: 1,
    sides: 6,
    inset: 0,
    depth: 3,
    count: 40,
    jitter: 0.5,
    angle: 60,
    axiom: "",
    rules: "",
    stroke: 0,
    strokeWidth: 2,
    fill: -1,
    altFill: -1,
    opacity: 1,
    ...overrides,
  };
}
