import { describe, expect, it } from "vitest";
import { diffPrograms } from "@/lib/geometry/diff";
import { defaultLayer, type Program } from "@/lib/geometry/dsl";

const base: Program = {
  title: "A",
  seed: 1,
  background: "#ffffff",
  palette: ["#111111", "#e2401c"],
  layers: [defaultLayer({ symmetry: "p4m", cell: 0.5, sides: 8 })],
};

describe("diffPrograms", () => {
  it("is empty for identical programs", () => {
    expect(diffPrograms(base, structuredClone(base))).toEqual([]);
  });

  it("lists parameter, symmetry, palette, and layer changes in plain words", () => {
    const after: Program = {
      ...base,
      palette: ["#111111", "#1f5eff", "#ffffff"],
      layers: [
        { ...base.layers[0], symmetry: "p6m", cell: 0.3333333, fill: 1, strokeWidth: 4 },
        defaultLayer({ generator: "penrose" }),
      ],
    };
    expect(diffPrograms(base, after)).toEqual([
      "Palette: colour 2 #e2401c → #1f5eff",
      "Palette: added colour 3 (#ffffff)",
      "Layer 1: symmetry p4m → p6m",
      "Layer 1: cell size 0.5 → 0.3333",
      "Layer 1: line width 2 → 4",
      "Layer 1: fill none → colour 2",
      "Layer 2: added (penrose)",
    ]);
    expect(diffPrograms(after, base).at(-1)).toBe("Layer 2: removed (penrose)");
  });

  it("ignores parameters the new layer does not read", () => {
    const after: Program = {
      ...base,
      // depth and count mean nothing to a polygon; order means nothing outside radial symmetry.
      layers: [{ ...base.layers[0], depth: 9, count: 300, order: 11, axiom: "F", scaleStep: 0.7 }],
    };
    expect(diffPrograms(base, after)).toEqual([]);
  });

  it("reports the flags and L-system text when they apply", () => {
    const before: Program = { ...base, layers: [defaultLayer({ symmetry: "radial", repeat: 3 })] };
    const after: Program = {
      ...base,
      layers: [defaultLayer({ symmetry: "radial", repeat: 3, mirror: true, spiral: true })],
    };
    expect(diffPrograms(before, after)).toEqual([
      "Layer 1: mirror off → on",
      "Layer 1: nesting in place → spiral",
    ]);
    const lsys = (rules: string): Program => ({
      ...base,
      layers: [defaultLayer({ generator: "lsystem", axiom: "F", rules })],
    });
    expect(diffPrograms(lsys("F=FF"), lsys("F=F+F"))).toEqual(["Layer 1: rules F=FF → F=F+F"]);
  });
});
