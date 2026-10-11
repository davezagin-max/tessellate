import { describe, expect, it } from "vitest";
import {
  countDraws,
  countStrokes,
  expandLSystem,
  fitToUnit,
  lsystem,
  parseRules,
  traceTurtle,
  type RuleSet,
} from "@/lib/geometry/generators/lsystem";
import {
  PHI,
  deflate,
  penroseSun,
  penroseTiles,
  penroseTriangleCounts,
} from "@/lib/geometry/generators/penrose";
import { polygon, regularPolygon } from "@/lib/geometry/generators/polygon";
import { splitPolygon, subdivision } from "@/lib/geometry/generators/subdivision";
import { insetPolygon, signedArea } from "@/lib/geometry/generators/types";
import {
  centroid,
  clipHalfPlane,
  relaxPasses,
  voronoi,
  voronoiCells,
} from "@/lib/geometry/generators/voronoi";
import { createRng } from "@/lib/geometry/rng";

const rules = (source: string): RuleSet => {
  const parsed = parseRules(source);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.rules;
};

const area = (pts: number[]) => Math.abs(signedArea(pts));

describe("seeded random numbers", () => {
  it("repeats exactly for a seed and differs between seeds and streams", () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(createRng(43)()).not.toBe(first[0]);
    expect(createRng(42, 1)()).not.toBe(first[0]);
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is roughly uniform", () => {
    const rng = createRng(7);
    let sum = 0;
    for (let i = 0; i < 20_000; i++) sum += rng();
    expect(sum / 20_000).toBeCloseTo(0.5, 1);
  });
});

describe("polygon", () => {
  it("puts n vertices on the unit circle, first one pointing up", () => {
    const [hex] = polygon({ sides: 6, inset: 0 });
    expect(hex.closed).toBe(true);
    expect(hex.pts).toHaveLength(12);
    expect(hex.pts[0]).toBeCloseTo(0);
    expect(hex.pts[1]).toBeCloseTo(-1);
    for (let i = 0; i < 12; i += 2) expect(Math.hypot(hex.pts[i], hex.pts[i + 1])).toBeCloseTo(1);
    // Area of a regular hexagon of radius 1.
    expect(area(hex.pts)).toBeCloseTo((3 * Math.sqrt(3)) / 2);
  });

  it("turns into a star when inset is above zero", () => {
    const [star] = polygon({ sides: 5, inset: 0.6 });
    expect(star.pts).toHaveLength(20);
    const radii = Array.from({ length: 10 }, (_, k) =>
      Math.hypot(star.pts[2 * k], star.pts[2 * k + 1]),
    );
    radii.forEach((r, k) => expect(r).toBeCloseTo(k % 2 === 0 ? 1 : 0.4));
  });

  it("draws a line segment for two sides", () => {
    expect(polygon({ sides: 2, inset: 0.5 })).toEqual([
      { pts: [-1, 0, 1, 0], closed: false, tag: 0 },
    ]);
  });
});

describe("L-systems", () => {
  it("parses rules and rejects malformed ones", () => {
    expect([...rules(" F = F+F--F+F ; X=F[+X] ")]).toEqual([
      ["F", "F+F--F+F"],
      ["X", "F[+X]"],
    ]);
    expect(parseRules("F->FF")).toMatchObject({ ok: false });
    expect(parseRules("F=F(1)")).toMatchObject({ ok: false });
    expect(parseRules("F=FF;F=F")).toMatchObject({ ok: false });
    expect(parseRules("")).toMatchObject({ ok: true });
  });

  it("grows a Koch curve to 4^n segments", () => {
    const koch = rules("F=F+F--F+F");
    for (const depth of [0, 1, 2, 3, 4]) {
      const expanded = expandLSystem("F", koch, depth);
      expect(expanded).not.toBeNull();
      expect(countDraws(expanded as string)).toBe(4 ** depth);
    }
    expect(expandLSystem("F", koch, 2)).toBe("F+F--F+F+F+F--F+F--F+F--F+F+F+F--F+F");
  });

  it("refuses to expand past the symbol cap", () => {
    const doubling = rules("F=FF");
    expect(expandLSystem("F", doubling, 10, 2000)).toHaveLength(1024);
    expect(expandLSystem("F", doubling, 11, 2000)).toBeNull();
    // A grammar that would be astronomically long is rejected without building it.
    expect(expandLSystem("F", rules("F=FFFFFFFFFF"), 40, 60_000)).toBeNull();
  });

  it("walks the turtle: a square closes on itself", () => {
    const [line] = traceTurtle("F+F+F+F", 90);
    expect(line).toHaveLength(10);
    expect(line[8]).toBeCloseTo(0);
    expect(line[9]).toBeCloseTo(0);
    // First step is straight up.
    expect(line[2]).toBeCloseTo(0);
    expect(line[3]).toBeCloseTo(-1);
  });

  it("starts a new polyline after a branch returns or the pen lifts", () => {
    const lines = traceTurtle("F[+F]F", 90);
    // The branch continues the trunk's stroke; the pop starts a second one from the fork.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(6);
    expect(lines[1].slice(0, 2)).toEqual(lines[0].slice(2, 4));
    expect(traceTurtle("FfF", 90)).toHaveLength(2);
    // An unmatched pop is ignored rather than crashing.
    expect(traceTurtle("F]F", 90)).toHaveLength(1);
  });

  it("counts strokes and points without tracing, exactly as the turtle draws them", () => {
    // The validator's size check relies on these counts, so they must match the real trace.
    const grammars: [axiom: string, source: string, depth: number][] = [
      ["F--F--F", "F=F+F--F+F", 3],
      ["X", "X=F+[[X]-X]-F[-FX]+X;F=FF", 4],
      ["FX", "X=X+YF+;Y=-FX-Y", 7],
      ["F", "F=FfF[+F]f", 3],
      ["F]F[f]F", "", 0],
    ];
    for (const [axiom, source, depth] of grammars) {
      const expanded = expandLSystem(axiom, rules(source), depth) as string;
      const lines = traceTurtle(expanded, 25);
      expect(countStrokes(expanded)).toBe(lines.length);
      const points = lines.reduce((sum, line) => sum + line.length / 2, 0);
      expect(countDraws(expanded) + countStrokes(expanded)).toBe(points);
    }
  });

  it("fits any drawing into the unit square", () => {
    const fitted = fitToUnit(
      traceTurtle(expandLSystem("FX", rules("X=X+YF+;Y=-FX-Y"), 8) as string, 90),
    );
    let max = 0;
    for (const line of fitted) for (const v of line) max = Math.max(max, Math.abs(v));
    expect(max).toBeCloseTo(1);
  });

  it("closes a Koch snowflake so it can be filled", () => {
    const paths = lsystem({ axiom: "F--F--F", rules: "F=F+F--F+F", angle: 60, depth: 3 });
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].pts.length / 2).toBe(3 * 4 ** 3);
  });

  it("returns nothing for a broken grammar instead of throwing", () => {
    expect(lsystem({ axiom: "F", rules: "nonsense", angle: 60, depth: 2 })).toEqual([]);
    expect(lsystem({ axiom: "", rules: "F=FF", angle: 60, depth: 2 })).toEqual([]);
  });
});

describe("Voronoi", () => {
  const sites = (n: number, seed: number) => {
    const rng = createRng(seed);
    return Array.from({ length: 2 * n }, () => rng() * 2 - 1);
  };

  it("clips a square by a half-plane", () => {
    const half = clipHalfPlane([-1, -1, 1, -1, 1, 1, -1, 1], 1, 0, 0);
    expect(area(half)).toBeCloseTo(2);
    expect(Math.max(...half.filter((_, i) => i % 2 === 0))).toBeCloseTo(0);
  });

  it("partitions the square: cell areas add up to the whole", () => {
    for (const n of [2, 17, 120]) {
      const cells = voronoiCells(sites(n, n));
      expect(cells).toHaveLength(n);
      expect(cells.reduce((sum, cell) => sum + area(cell), 0)).toBeCloseTo(4, 9);
    }
  });

  it("gives every point to its nearest site", () => {
    const pts = sites(60, 3);
    const cells = voronoiCells(pts);
    const inside = (cell: number[], x: number, y: number) => {
      // Cells are convex and consistently wound, so one sign test per edge is enough.
      let sign = 0;
      for (let i = 0; i < cell.length; i += 2) {
        const j = (i + 2) % cell.length;
        const cross =
          (cell[j] - cell[i]) * (y - cell[i + 1]) - (cell[j + 1] - cell[i + 1]) * (x - cell[i]);
        if (Math.abs(cross) < 1e-12) continue;
        if (sign !== 0 && Math.sign(cross) !== sign) return false;
        sign = Math.sign(cross);
      }
      return true;
    };
    const rng = createRng(99);
    for (let k = 0; k < 400; k++) {
      const x = rng() * 2 - 1;
      const y = rng() * 2 - 1;
      let nearest = 0;
      let best = Infinity;
      for (let i = 0; i < 60; i++) {
        const d = (pts[2 * i] - x) ** 2 + (pts[2 * i + 1] - y) ** 2;
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      expect(inside(cells[nearest], x, y)).toBe(true);
    }
  });

  it("relaxes toward even cells as jitter drops", () => {
    expect(relaxPasses(1)).toBe(0);
    expect(relaxPasses(0)).toBe(8);
    const spread = (jitter: number) => {
      const areas = voronoi({ count: 80, jitter, inset: 0 }, createRng(5)).map((p) => area(p.pts));
      const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
      return Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length) / mean;
    };
    expect(spread(0)).toBeLessThan(spread(1) * 0.5);
  });

  it("is a pure function of the seed", () => {
    const a = voronoi({ count: 30, jitter: 0.4, inset: 0.1 }, createRng(11, 2));
    const b = voronoi({ count: 30, jitter: 0.4, inset: 0.1 }, createRng(11, 2));
    const c = voronoi({ count: 30, jitter: 0.4, inset: 0.1 }, createRng(12, 2));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(30);
    expect(a.some((p) => p.tag === 1)).toBe(true);
  });

  it("finds the centroid of a polygon", () => {
    expect(centroid([0, 0, 2, 0, 2, 2, 0, 2])).toEqual([1, 1]);
  });
});

describe("Penrose P3", () => {
  const sideLengths = (pts: number[]) => {
    const n = pts.length / 2;
    return Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n;
      return Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
    });
  };
  const angles = (pts: number[]) => {
    const n = pts.length / 2;
    return Array.from({ length: n }, (_, i) => {
      const p = (i + n - 1) % n;
      const q = (i + 1) % n;
      const ux = pts[2 * p] - pts[2 * i];
      const uy = pts[2 * p + 1] - pts[2 * i + 1];
      const vx = pts[2 * q] - pts[2 * i];
      const vy = pts[2 * q + 1] - pts[2 * i + 1];
      return Math.round(
        (Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))) * 180) /
          Math.PI,
      );
    });
  };

  it("follows the deflation recurrence for triangle counts", () => {
    let triangles = penroseSun();
    for (let depth = 0; depth <= 6; depth++) {
      const [acute, obtuse] = penroseTriangleCounts(depth);
      expect(triangles.filter((t) => t[0] === 0)).toHaveLength(acute);
      expect(triangles.filter((t) => t[0] === 1)).toHaveLength(obtuse);
      triangles = deflate(triangles);
    }
    expect(penroseTriangleCounts(7)).toEqual([2330, 3770]);
  });

  it("conserves area: every deflation still tiles the same decagon", () => {
    const decagon = 10 * 0.5 * Math.sin(Math.PI / 5);
    for (const depth of [0, 1, 4, 6]) {
      const total = penroseTiles(depth).reduce((sum, tile) => sum + area(tile.pts), 0);
      expect(total).toBeCloseTo(decagon, 9);
    }
  });

  it("produces only the two Penrose rhombs, all with the same edge length", () => {
    const depth = 5;
    const tiles = penroseTiles(depth).filter((tile) => tile.whole);
    expect(tiles.length).toBeGreaterThan(300);
    const edge = PHI ** -depth;
    for (const tile of tiles) {
      expect(tile.pts).toHaveLength(8);
      for (const side of sideLengths(tile.pts)) expect(side).toBeCloseTo(edge, 9);
      const sorted = angles(tile.pts).sort((a, b) => a - b);
      expect(sorted).toEqual(tile.tag === 0 ? [72, 72, 108, 108] : [36, 36, 144, 144]);
    }
  });

  it("has thick and thin rhombs in the golden ratio", () => {
    const tiles = penroseTiles(7).filter((tile) => tile.whole);
    const thick = tiles.filter((tile) => tile.tag === 0).length;
    const thin = tiles.filter((tile) => tile.tag === 1).length;
    expect(thick / thin).toBeCloseTo(PHI, 1);
  });

  it("is edge to edge: interior edges belong to exactly two tiles, rim edges to one", () => {
    const edges = new Map<string, { n: number; mx: number; my: number }>();
    for (const { pts } of penroseTiles(4)) {
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = `${Math.round(pts[2 * i] * 1e6)},${Math.round(pts[2 * i + 1] * 1e6)}`;
        const b = `${Math.round(pts[2 * j] * 1e6)},${Math.round(pts[2 * j + 1] * 1e6)}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const entry = edges.get(key) ?? {
          n: 0,
          mx: (pts[2 * i] + pts[2 * j]) / 2,
          my: (pts[2 * i + 1] + pts[2 * j + 1]) / 2,
        };
        entry.n += 1;
        edges.set(key, entry);
      }
    }
    // The patch is a regular decagon with circumradius 1; a point is on its rim
    // when its largest projection onto the ten edge normals equals the apothem.
    const apothem = Math.cos(Math.PI / 10);
    const rimDistance = (x: number, y: number) =>
      Math.max(
        ...Array.from(
          { length: 10 },
          (_, k) => x * Math.cos((k * Math.PI) / 5) + y * Math.sin((k * Math.PI) / 5),
        ),
      );
    let rim = 0;
    for (const { n, mx, my } of edges.values()) {
      const onRim = Math.abs(rimDistance(mx, my) - apothem) < 1e-9;
      expect(n).toBe(onRim ? 1 : 2);
      if (onRim) rim++;
    }
    expect(rim).toBeGreaterThanOrEqual(10);
  });
});

describe("recursive subdivision", () => {
  it("splits a square into two halves that keep its area", () => {
    const square = [-1, -1, 1, -1, 1, 1, -1, 1];
    const [first, second] = splitPolygon(square, 0.5);
    expect(first).toHaveLength(8);
    expect(second).toHaveLength(8);
    expect(area(first)).toBeCloseTo(2);
    expect(area(second)).toBeCloseTo(2);
  });

  it("keeps triangles as triangles", () => {
    const [first, second] = splitPolygon(regularPolygon(3), 0.4);
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(area(first) + area(second)).toBeCloseTo(area(regularPolygon(3)));
  });

  it("makes a regular mesh of 2^depth cells at jitter 0", () => {
    for (const sides of [3, 4, 6]) {
      const cells = subdivision({ sides, depth: 5, jitter: 0, inset: 0 }, createRng(1));
      expect(cells).toHaveLength(32);
      expect(cells.reduce((sum, cell) => sum + area(cell.pts), 0)).toBeCloseTo(
        area(regularPolygon(sides)),
        9,
      );
      if (sides === 4) {
        const areas = cells.map((cell) => area(cell.pts));
        expect(Math.max(...areas)).toBeCloseTo(Math.min(...areas));
        for (const cell of cells) expect(cell.pts).toHaveLength(8);
      }
    }
  });

  it("stops early and cuts off-centre when jitter is up, and never exceeds 2^depth", () => {
    const cells = subdivision({ sides: 4, depth: 7, jitter: 1, inset: 0 }, createRng(3));
    expect(cells.length).toBeLessThan(128);
    expect(cells.length).toBeGreaterThanOrEqual(4);
    const areas = cells.map((cell) => area(cell.pts));
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(4);
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 9);
    expect(subdivision({ sides: 4, depth: 7, jitter: 1, inset: 0 }, createRng(3))).toEqual(cells);
  });

  it("insets each tile toward its centre", () => {
    const square = [0, 0, 2, 0, 2, 2, 0, 2];
    expect(area(insetPolygon(square, 0.5))).toBeCloseTo(1);
    expect(insetPolygon(square, 0)).toBe(square);
  });
});
