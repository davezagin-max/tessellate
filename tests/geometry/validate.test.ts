import { describe, expect, it } from "vitest";
import {
  GENERATORS,
  LIMITS,
  PARAMS,
  SYMMETRIES,
  defaultLayer,
  paramApplies,
  rangeFor,
  type Layer,
  type Program,
} from "@/lib/geometry/dsl";
import { buildScene } from "@/lib/geometry/pipeline";
import { createRng } from "@/lib/geometry/rng";
import { estimateLayer, normalizeColor, validateProgram } from "@/lib/geometry/validate";
import { PRESETS } from "@/lib/presets";

const program = (layers: Partial<Layer>[], extra: Partial<Program> = {}): Program => ({
  title: "Test",
  seed: 1,
  background: "#ffffff",
  palette: ["#111111", "#e2401c"],
  layers: layers.map((l) => defaultLayer(l)),
  ...extra,
});

const errorsOf = (input: unknown): string[] => {
  const result = validateProgram(input);
  return result.ok ? [] : result.errors;
};

describe("validateProgram", () => {
  it("accepts a clean program unchanged, with no warnings", () => {
    const input = program([{}]);
    const result = validateProgram(input);
    expect(result).toMatchObject({ ok: true, warnings: [] });
    expect(result.ok && result.program).toEqual(input);
  });

  it("rejects anything that is not shaped like a program", () => {
    expect(errorsOf(null)).not.toEqual([]);
    expect(errorsOf({ title: "x" })).not.toEqual([]);
    expect(errorsOf(program([{ generator: "spirograph" as Layer["generator"] }]))[0]).toContain(
      "generator",
    );
    expect(errorsOf(program([{ size: Number.NaN }]))).not.toEqual([]);
    expect(errorsOf(program([{ size: "big" as unknown as number }]))).not.toEqual([]);
  });

  it("drops fields the language does not define", () => {
    const input = {
      ...program([{}]),
      onload: "alert(1)",
      layers: [{ ...defaultLayer(), script: "x" }],
    };
    const result = validateProgram(input);
    expect(result.ok && Object.keys(result.program)).toEqual([
      "title",
      "seed",
      "background",
      "palette",
      "layers",
    ]);
    expect(result.ok && "script" in result.program.layers[0]).toBe(false);
  });

  it("clamps out-of-range numbers and says what it changed", () => {
    const result = validateProgram(
      program([{ symmetry: "p4m", cell: 0.001, size: 99, sides: 6.4, strokeWidth: -3 }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [layer] = result.program.layers;
    expect(layer.cell).toBe(0.08);
    expect(layer.size).toBe(2);
    expect(layer.sides).toBe(6);
    expect(layer.strokeWidth).toBe(0.25);
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings.join("\n")).toContain("layers[0].cell: 0.001 adjusted to 0.08");
  });

  it("clamps parameters a layer ignores without warning about them", () => {
    // A polygon never reads depth or count, and "none" never reads cell.
    const result = validateProgram(program([{ depth: 500, count: -4, cell: 1000 }]));
    expect(result).toMatchObject({ ok: true, warnings: [] });
    expect(result.ok && result.program.layers[0]).toMatchObject({ depth: 14, count: 2, cell: 2 });
  });

  it("applies per-generator limits", () => {
    const result = validateProgram(program([{ generator: "penrose", depth: 12 }]));
    expect(result.ok && result.program.layers[0].depth).toBe(7);
    const sub = validateProgram(program([{ generator: "subdivision", sides: 40, depth: 3 }]));
    expect(sub.ok && sub.program.layers[0].sides).toBe(8);
  });

  it("normalizes colours and rejects ones it cannot read", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor(" #E2401C ")).toBe("#e2401c");
    expect(normalizeColor("red")).toBeNull();
    expect(normalizeColor("url(javascript:alert(1))")).toBeNull();
    const ok = validateProgram(program([{}], { background: "#FFF", palette: ["#000"] }));
    expect(ok.ok && ok.program.background).toBe("#ffffff");
    expect(ok.ok && ok.program.palette).toEqual(["#000000"]);
    expect(errorsOf(program([{}], { background: "white" }))[0]).toContain("background");
    expect(errorsOf(program([{}], { palette: ["#111111", "tomato"] }))[0]).toContain("palette[1]");
  });

  it("rejects palette indexes past the end and layers that draw nothing", () => {
    expect(errorsOf(program([{ fill: 4 }]))[0]).toContain("palette index 4");
    expect(errorsOf(program([{ stroke: -1, fill: -1, altFill: -1 }]))[0]).toContain(
      "draws nothing",
    );
  });

  it("rejects an empty program and too many layers or colours", () => {
    expect(errorsOf(program([]))[0]).toContain("layers");
    expect(
      errorsOf(program(Array.from({ length: LIMITS.maxLayers + 1 }, () => ({}))))[0],
    ).toContain("layers");
    expect(errorsOf(program([{}], { palette: [] }))[0]).toContain("palette");
    expect(errorsOf(program([{}], { palette: Array(7).fill("#000000") }))[0]).toContain("palette");
  });

  it("tidies the title and the seed", () => {
    const result = validateProgram(program([{}], { title: "  \n ", seed: -12.6 }));
    expect(result.ok && result.program.title).toBe("Untitled");
    expect(result.ok && result.program.seed).toBe(13);
    const long = validateProgram(program([{}], { title: "x".repeat(300) }));
    expect(long.ok && long.program.title).toHaveLength(LIMITS.maxTitle);
  });

  it("explains L-system mistakes in words the model can act on", () => {
    const base = { generator: "lsystem" as const, angle: 60, depth: 2 };
    expect(errorsOf(program([{ ...base, axiom: "", rules: "F=FF" }]))[0]).toContain("axiom");
    expect(errorsOf(program([{ ...base, axiom: "F", rules: "F->FF" }]))[0]).toContain(
      "must look like F=F+F",
    );
    expect(errorsOf(program([{ ...base, axiom: "X", rules: "X=XX" }]))[0]).toContain("never draws");
    expect(errorsOf(program([{ ...base, axiom: "F", rules: "F=FFFF", depth: 14 }]))[0]).toContain(
      "lower depth",
    );
    expect(errorsOf(program([{ ...base, axiom: "F".repeat(41), rules: "" }]))[0]).toContain(
      "axiom",
    );
  });

  it("is idempotent: validating its own output changes nothing", () => {
    const first = validateProgram(
      program([{ symmetry: "p6m", cell: 0.3333333333, size: 1.23456789, rotation: 400 }], {
        seed: 3.2,
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = validateProgram(first.program);
    expect(second).toMatchObject({ ok: true, warnings: [] });
    expect(second.ok && second.program).toEqual(first.program);
  });
});

describe("shape cap", () => {
  it("rejects a program that would draw too much, before drawing any of it", () => {
    const started = performance.now();
    const errors = errorsOf(
      program([{ symmetry: "p6m", cell: 0.08, sides: 64, size: 2, repeat: 40, scaleStep: 1.5 }]),
    );
    expect(performance.now() - started).toBeLessThan(200);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("the limit is 20,000 shapes");
    expect(errors[0]).toContain("raise cell");
  });

  it("names the cheapest fix for each kind of layer", () => {
    expect(
      errorsOf(program([{ generator: "penrose", depth: 7, symmetry: "radial", order: 48 }]))[0],
    ).toContain("lower order");
    expect(
      errorsOf(
        program([{ generator: "voronoi", count: 400, symmetry: "p4m", cell: 0.1, size: 0.5 }]),
      )[0],
    ).toContain("lower count");
  });

  it("adds layers up: each can fit while the total does not", () => {
    const heavy = { generator: "penrose" as const, depth: 7 };
    expect(validateProgram(program([heavy])).ok).toBe(true);
    const errors = errorsOf(program([heavy, heavy, heavy, heavy]));
    expect(errors[0]).toContain("all layers together");
  });

  it("is a true upper bound: no valid program renders more than its estimate", () => {
    const rng = createRng(2026);
    const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)];
    let rendered = 0;
    for (let trial = 0; trial < 400; trial++) {
      const generator = pick(GENERATORS);
      const layer = defaultLayer({
        generator,
        symmetry: pick(SYMMETRIES),
        mirror: rng() < 0.5,
        spiral: rng() < 0.5,
      });
      for (const spec of PARAMS) {
        const { min, max } = rangeFor(spec, generator);
        const value = min + rng() * (max - min);
        layer[spec.key] = spec.integer ? Math.round(value) : value;
      }
      layer.stroke = 0;
      layer.fill = Math.min(layer.fill, 1);
      layer.altFill = Math.min(layer.altFill, 1);
      layer.repeat = 1 + Math.floor(rng() * 4);
      if (generator === "lsystem") {
        layer.axiom = "F--F--F";
        layer.rules = pick(["F=F+F--F+F", "F=F[+F]F[-F]F", "F=FfF"]);
        layer.depth = Math.floor(rng() * 5);
      }
      const result = validateProgram(program([layer], { seed: trial }));
      if (!result.ok) {
        // The only acceptable reason to reject a random in-range layer is its size.
        expect(result.errors.join(" ")).toMatch(/limit|grows past/);
        continue;
      }
      const scene = buildScene(result.program);
      const estimate = estimateLayer(result.program.layers[0]);
      expect(scene.stats.paths).toBeLessThanOrEqual(estimate.paths);
      expect(scene.stats.vertices).toBeLessThanOrEqual(estimate.vertices);
      expect(scene.stats.paths).toBeLessThanOrEqual(LIMITS.maxPaths);
      rendered++;
    }
    // The fuzz should exercise both outcomes, not reject everything.
    expect(rendered).toBeGreaterThan(100);
  });
});

describe("parameter table", () => {
  it("covers every numeric field of a layer exactly once", () => {
    const numeric = Object.entries(defaultLayer())
      .filter(([, value]) => typeof value === "number")
      .map(([key]) => key)
      .sort();
    expect(PARAMS.map((spec) => spec.key).sort()).toEqual(numeric);
  });

  it("hides parameters a layer does not read", () => {
    const names = (layer: Partial<Layer>) =>
      PARAMS.filter((spec) => paramApplies(spec, defaultLayer(layer))).map((spec) => spec.key);
    expect(names({ generator: "polygon", symmetry: "none" })).not.toContain("cell");
    expect(names({ generator: "polygon", symmetry: "none" })).not.toContain("depth");
    expect(names({ generator: "polygon", symmetry: "p4m" })).toContain("cell");
    expect(names({ generator: "polygon", symmetry: "p4m" })).not.toContain("cellAspect");
    expect(names({ generator: "polygon", symmetry: "pmm" })).toContain("cellAspect");
    expect(names({ generator: "voronoi", symmetry: "radial" })).toEqual(
      expect.arrayContaining(["count", "jitter", "order"]),
    );
    expect(names({ repeat: 1 })).not.toContain("scaleStep");
    expect(names({ repeat: 3 })).toContain("scaleStep");
  });
});

describe("gallery presets", () => {
  it("has twelve presets with unique ids", () => {
    expect(PRESETS).toHaveLength(12);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(12);
    expect(PRESETS.filter((p) => p.session)).toHaveLength(3);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))(
    "%s is already in normal form and renders",
    (_id, preset) => {
      const result = validateProgram(preset.program);
      expect(result).toMatchObject({ ok: true, warnings: [] });
      if (!result.ok) return;
      expect(result.program).toEqual(preset.program);
      const scene = buildScene(result.program);
      expect(scene.stats.paths).toBeGreaterThan(0);
      expect(scene.batches.length).toBeGreaterThan(0);
      expect(preset.prompt.length).toBeGreaterThan(20);
    },
  );

  it("covers every generator and the five wallpaper groups the brief names, between presets and tests", () => {
    const used = new Set(PRESETS.flatMap((p) => p.program.layers.map((l) => l.generator)));
    expect([...used].sort()).toEqual([...GENERATORS].sort());
    const groups = new Set(PRESETS.flatMap((p) => p.program.layers.map((l) => l.symmetry)));
    for (const group of ["p4m", "p6m", "p4g", "radial"])
      expect(groups.has(group as Layer["symmetry"])).toBe(true);
  });
});
