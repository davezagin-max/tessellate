import { describe, expect, it } from "vitest";
import { defaultLayer, type Layer, type Program } from "@/lib/geometry/dsl";
import { buildScene } from "@/lib/geometry/pipeline";
import { chainSegments, clipSegment, orderLines, sceneToPlot } from "@/lib/geometry/plotter";
import { validateProgram } from "@/lib/geometry/validate";
import { PRESETS, PRESET_BY_ID } from "@/lib/presets";

const scene = (layers: Partial<Layer>[], extra: Partial<Program> = {}) => {
  const result = validateProgram({
    title: "Plot",
    seed: 1,
    background: "#ffffff",
    palette: ["#111111", "#e2401c", "#ffffff"],
    layers: layers.map((l) => defaultLayer(l)),
    ...extra,
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return buildScene(result.program);
};

/** All `M`/`L` coordinates in an SVG, as numbers. */
const coordinates = (svg: string) =>
  [...svg.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);

describe("clipSegment", () => {
  it("keeps, trims, or drops a segment against the page", () => {
    expect(clipSegment(2, 2, 8, 8, 0, 10)).toEqual([2, 2, 8, 8]);
    expect(clipSegment(-5, 5, 5, 5, 0, 10)).toEqual([0, 5, 5, 5]);
    expect(clipSegment(-5, -5, 15, 15, 0, 10)).toEqual([0, 0, 10, 10]);
    expect(clipSegment(-5, 2, -1, 8, 0, 10)).toBeNull();
    expect(clipSegment(12, -3, 12, 30, 0, 10)).toBeNull();
  });
});

describe("chainSegments", () => {
  it("joins the four sides of a square into one stroke", () => {
    const lines = chainSegments([0, 0, 10, 0, 10, 10, 0, 10, 10, 0, 10, 10, 0, 10, 0, 0]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(10);
    expect(lines[0].slice(0, 2)).toEqual(lines[0].slice(8, 10));
  });

  it("keeps separate shapes separate and uses every segment once", () => {
    const lines = chainSegments([0, 0, 5, 0, 20, 20, 25, 20, 5, 0, 5, 5]);
    expect(lines).toHaveLength(2);
    expect(lines.reduce((n, line) => n + line.length / 2 - 1, 0)).toBe(3);
  });
});

describe("orderLines", () => {
  const travel = (lines: number[][]) => {
    let total = 0;
    let x = 0;
    let y = 0;
    for (const line of lines) {
      total += Math.hypot(line[0] - x, line[1] - y);
      x = line[line.length - 2];
      y = line[line.length - 1];
    }
    return total;
  };

  it("visits every stroke exactly once and shortens pen-up travel", () => {
    // Short dashes scattered deterministically over a 1000-unit page.
    const lines: number[][] = [];
    for (let i = 0; i < 500; i++) {
      const x = (i * 7919) % 1000;
      const y = (i * 104729) % 1000;
      lines.push([x, y, x + 3, y + 2]);
    }
    const ordered = orderLines(lines, 1005);
    expect(ordered).toHaveLength(500);
    const canonical = (set: number[][]) =>
      set
        .map((l) =>
          (l[0] < l[2] || (l[0] === l[2] && l[1] < l[3]) ? l : [l[2], l[3], l[0], l[1]]).join(","),
        )
        .sort();
    expect(canonical(ordered)).toEqual(canonical(lines));
    expect(travel(ordered)).toBeLessThan(travel(lines) * 0.2);
  });

  it("always takes the nearest remaining end, flipping a stroke when its tail is closer", () => {
    const ordered = orderLines(
      [
        [900, 900, 800, 800],
        [50, 50, 10, 10],
        [400, 400, 100, 100],
      ],
      1000,
    );
    expect(ordered).toEqual([
      [10, 10, 50, 50],
      [100, 100, 400, 400],
      [800, 800, 900, 900],
    ]);
  });
});

describe("plotter export", () => {
  it("is stroke-only, in millimetres, with one layer group per pen", () => {
    const twoPens = scene(
      [
        { symmetry: "p4m", cell: 0.5, sides: 8, inset: 0.2346, size: 0.5, stroke: 0, fill: 2 },
        { symmetry: "p4m", cell: 0.5, sides: 4, size: 0.2, stroke: 1, opacity: 0.6 },
      ],
      { palette: ["#141414", "#e2401c", "#ffffff"] },
    );
    const { svg, stats } = sceneToPlot(twoPens, { sizeMm: 210, marginMm: 15 });
    expect(svg).toContain('width="210mm" height="210mm" viewBox="0 0 210 210"');
    expect(svg.match(/<g /g)).toHaveLength(stats.pens);
    expect(stats.pens).toBe(2);
    expect(svg).toContain('inkscape:label="1 #141414"');
    expect(svg).toContain('inkscape:label="2 #e2401c"');
    // No fills, no filters, no opacity, no background rectangle.
    expect(svg.match(/fill="(?!none")/g)).toBeNull();
    expect(svg).not.toMatch(/<rect|filter|opacity/);
    expect(svg.match(/<path /g)).toHaveLength(stats.strokes);
  });

  it("keeps the pen on the page, inside the margin", () => {
    for (const preset of PRESETS) {
      const { svg } = sceneToPlot(buildScene(preset.program), { sizeMm: 200, marginMm: 10 });
      const values = coordinates(svg);
      expect(values.length).toBeGreaterThan(0);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...values)).toBeLessThanOrEqual(190);
    }
  });

  it("draws an edge shared by two tiles only once", () => {
    // A honeycomb: every interior edge belongs to two hexagons.
    const honeycomb = scene([{ symmetry: "p6m", cell: 0.5, sides: 6, size: 0.5774 }]);
    const { stats } = sceneToPlot(honeycomb);
    expect(stats.duplicateSegments).toBeGreaterThan(stats.segments * 0.5);
    // Three edges meet at every honeycomb vertex, so a pen stroke can pass
    // through but one edge must start a new stroke: far fewer strokes than edges.
    expect(stats.strokes).toBeLessThan(stats.segments / 2);
  });

  it("reports honest lengths: a single square", () => {
    // A square of half-diagonal 0.5 on a 200 mm page with 10 mm margins:
    // side = 0.5 * sqrt(2) canvas units = 0.7071 * 90 mm.
    const { stats, svg } = sceneToPlot(scene([{ sides: 4, size: 0.5 }]));
    expect(stats).toMatchObject({ pens: 1, strokes: 1, segments: 4, duplicateSegments: 0 });
    expect(stats.drawMm).toBeCloseTo(4 * 0.5 * Math.SQRT2 * 90, 0);
    expect(svg.match(/<path /g)).toHaveLength(1);
  });

  it("cuts pen-up travel compared with plotting shapes in generated order", () => {
    for (const id of ["star-and-cross", "penrose-sun", "fern-wreath"]) {
      const { stats } = sceneToPlot(buildScene(PRESET_BY_ID[id].program));
      expect(stats.travelMm).toBeLessThan(stats.naiveTravelMm * 0.6);
      expect(stats.drawMm).toBeGreaterThan(0);
    }
  });

  it("outlines a filled shape that has no stroke, in its fill colour", () => {
    const { svg, stats } = sceneToPlot(scene([{ sides: 5, size: 0.4, stroke: -1, fill: 1 }]));
    expect(stats.pens).toBe(1);
    expect(svg).toContain('stroke="#e2401c"');
  });

  it("is deterministic", () => {
    const program = PRESET_BY_ID["leaded-glass"].program;
    expect(sceneToPlot(buildScene(program)).svg).toBe(sceneToPlot(buildScene(program)).svg);
  });
});
