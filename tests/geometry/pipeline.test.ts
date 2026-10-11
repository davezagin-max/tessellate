import { describe, expect, it } from "vitest";
import { apply, rotate, type Affine } from "@/lib/geometry/affine";
import { paintScene, type PaintContext } from "@/lib/geometry/canvas";
import { defaultLayer, type Layer, type Program } from "@/lib/geometry/dsl";
import { signedArea } from "@/lib/geometry/generators/types";
import { buildScene, nestedPlacement, pathKey, type Scene } from "@/lib/geometry/pipeline";
import { fnv1a } from "@/lib/geometry/rng";
import { fmt, sceneToSvg } from "@/lib/geometry/svg";
import { wallpaperMaps } from "@/lib/geometry/symmetry";
import { validateProgram } from "@/lib/geometry/validate";
import { PRESETS } from "@/lib/presets";

const program = (layers: Partial<Layer>[], extra: Partial<Program> = {}): Program => {
  const result = validateProgram({
    title: "Test",
    seed: 1,
    background: "#ffffff",
    palette: ["#111111", "#e2401c"],
    layers: layers.map((l) => defaultLayer(l)),
    ...extra,
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.program;
};

const strokePaths = (scene: Scene) =>
  scene.batches.filter((b) => b.kind === "stroke").flatMap((b) => b.paths);

describe("determinism", () => {
  it("renders the same SVG, byte for byte, every time", () => {
    for (const preset of PRESETS) {
      const first = sceneToSvg(buildScene(preset.program));
      const second = sceneToSvg(buildScene(structuredClone(preset.program)));
      expect(second).toBe(first);
    }
  });

  it("changes with the seed only for generators that use randomness", () => {
    const render = (generator: Layer["generator"], seed: number) =>
      sceneToSvg(buildScene(program([{ generator, size: 0.8, depth: 4, jitter: 0.8 }], { seed })));
    expect(render("voronoi", 1)).not.toBe(render("voronoi", 2));
    expect(render("subdivision", 1)).not.toBe(render("subdivision", 2));
    expect(render("penrose", 1)).toBe(render("penrose", 2));
    expect(render("polygon", 1)).toBe(render("polygon", 2));
  });

  it("gives each layer its own random stream", () => {
    const voronoi = { generator: "voronoi" as const, count: 12, size: 0.9 };
    const one = buildScene(program([voronoi]));
    const two = buildScene(program([voronoi, voronoi]));
    // Layer 0 is unchanged by adding a layer after it, and layer 1 is not a copy of layer 0.
    expect(two.batches[0].paths).toEqual(one.batches[0].paths);
    expect(two.batches[1].paths).not.toEqual(two.batches[0].paths);
  });

  it("matches the recorded snapshot for every preset", () => {
    // A hash of the full SVG. If one of these changes, the artwork changed:
    // either on purpose (update the snapshot) or because determinism broke.
    const hashes = Object.fromEntries(
      PRESETS.map((preset) => [preset.id, fnv1a(sceneToSvg(buildScene(preset.program)))]),
    );
    expect(hashes).toMatchInlineSnapshot(`
      {
        "composition": "de684025",
        "dahlia": "5b13827f",
        "dragon": "45592ba2",
        "fern-wreath": "45682c8e",
        "flower-of-life": "e53a3975",
        "koch-field": "d6fd1f0b",
        "leaded-glass": "fc06ebea",
        "penrose-sun": "b8b381ec",
        "pursuit": "dc5b394d",
        "rose-window": "5db2dc91",
        "star-and-cross": "31f09ae2",
        "triangle-whirl": "0c8dc00a",
      }
    `);
  });
});

describe("symmetry in the finished artwork", () => {
  /** Keys of the stroked paths that lie fully inside a centred window. */
  const keysInside = (scene: Scene, window: number, map?: Affine) => {
    const keys = new Set<string>();
    for (const path of strokePaths(scene)) {
      const pts = map
        ? path.pts.flatMap((_, i) =>
            i % 2 === 0 ? [...apply(map, path.pts[i], path.pts[i + 1])] : [],
          )
        : path.pts;
      if (pts.some((v) => Math.abs(v) > window)) continue;
      // Re-orient after a mirror so keys are comparable.
      const oriented =
        path.closed && signedArea(pts) < 0
          ? pts
              .slice()
              .reverse()
              .flatMap((_, i, a) => (i % 2 === 0 ? [a[i + 1], a[i]] : []))
          : pts;
      keys.add(pathKey(oriented, path.closed, 0));
    }
    return keys;
  };

  it.each(["p4m", "p4g", "p6m", "p3", "pmm", "pgg", "cmm", "p31m"] as const)(
    "%s artwork is invariant under every map of its own group",
    (symmetry) => {
      const cell = 0.4;
      const scene = buildScene(
        program([
          { symmetry, cell, cellAspect: 1.3, x: 0.21, y: 0.13, sides: 3, size: 0.17, rotation: 11 },
        ]),
      );
      const original = keysInside(scene, 0.55);
      expect(original.size).toBeGreaterThan(8);
      for (const map of wallpaperMaps(symmetry, cell, 1.3).maps) {
        // Every shape near the centre must land exactly on another shape of the pattern.
        const all = keysInside(scene, 1);
        for (const key of keysInside(scene, 0.4, map)) expect(all.has(key)).toBe(true);
      }
    },
  );

  it("radial symmetry of order n repeats under a turn of 360/n", () => {
    const scene = buildScene(
      program([
        { symmetry: "radial", order: 7, mirror: true, x: 0.4, y: 0.1, sides: 5, size: 0.1 },
      ]),
    );
    const paths = strokePaths(scene);
    expect(paths).toHaveLength(14);
    const all = keysInside(scene, 1);
    for (const key of keysInside(scene, 1, rotate(360 / 7))) expect(all.has(key)).toBe(true);
  });

  it("drops copies that land exactly on top of each other", () => {
    // A square on a four-fold centre of p4m is its own image under all 8 maps.
    const scene = buildScene(program([{ symmetry: "p4m", cell: 0.5, sides: 4, size: 0.3 }]));
    const paths = strokePaths(scene);
    const centres = new Set(
      paths.map((p) => {
        const n = p.pts.length / 2;
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < n; i++) {
          cx += p.pts[2 * i] / n;
          cy += p.pts[2 * i + 1] / n;
        }
        return `${cx.toFixed(4)},${cy.toFixed(4)}`;
      }),
    );
    expect(centres.size).toBe(paths.length);
    expect(scene.stats.layers[0].duplicates).toBe(paths.length * 7);
  });

  it("gives every closed path the same winding, even after mirrors", () => {
    const scene = buildScene(
      program([{ symmetry: "p6m", cell: 0.5, x: 0.3, y: 0.1, sides: 5, size: 0.1, fill: 1 }]),
    );
    for (const batch of scene.batches) {
      for (const path of batch.paths) expect(signedArea(path.pts)).toBeGreaterThan(0);
    }
  });

  it("never draws a copy that misses the canvas", () => {
    const scene = buildScene(program([{ symmetry: "p4", cell: 0.3, x: 0.2, sides: 3, size: 0.1 }]));
    for (const path of strokePaths(scene)) {
      const xs = path.pts.filter((_, i) => i % 2 === 0);
      const ys = path.pts.filter((_, i) => i % 2 === 1);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(-1);
      expect(Math.min(...xs)).toBeLessThanOrEqual(1);
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(-1);
      expect(Math.min(...ys)).toBeLessThanOrEqual(1);
    }
    // Off-canvas shapes with no symmetry are culled too.
    expect(buildScene(program([{ x: 1.9, y: 1.9, size: 0.1 }])).stats.paths).toBe(0);
  });
});

describe("placement", () => {
  it("nests copies in place by default and along a spiral when asked", () => {
    const base = { x: 0.5, y: 0, size: 0.1, rotation: 0, scaleStep: 0.5, rotateStep: 90 };
    const inPlace = nestedPlacement({ ...base, spiral: false }, 1);
    // Centre stays put; the shape halves.
    expect(apply(inPlace, 0, 0)).toEqual([0.5, 0]);
    expect(Math.hypot(inPlace[0], inPlace[1])).toBeCloseTo(0.05);

    const spiral = nestedPlacement({ ...base, spiral: true }, 1);
    // Centre swings a quarter turn about the origin and moves in to half the radius.
    const [cx, cy] = apply(spiral, 0, 0);
    expect(cx).toBeCloseTo(0);
    expect(cy).toBeCloseTo(0.25);
  });

  it("measures wallpaper motifs in cells, so the cell slider zooms the whole pattern", () => {
    const at = (cell: number) =>
      strokePaths(
        buildScene(program([{ symmetry: "p1", cell, x: 0, y: 0, sides: 4, size: 0.25 }])),
      );
    const radius = (paths: ReturnType<typeof at>) => {
      const p = paths[0].pts;
      return Math.hypot(p[0] - p[4], p[1] - p[5]) / 2;
    };
    expect(radius(at(0.8))).toBeCloseTo(0.2);
    expect(radius(at(0.4))).toBeCloseTo(0.1);
  });

  it("alternates the fill tag across nested polygon copies", () => {
    const scene = buildScene(
      program([
        { sides: 4, size: 0.8, repeat: 4, scaleStep: 0.7, fill: 0, altFill: 1, stroke: -1 },
      ]),
    );
    expect(scene.batches.map((b) => [b.kind, b.pen, b.paths.length])).toEqual([
      ["fill", 0, 2],
      ["fill", 1, 2],
    ]);
  });
});

describe("back ends", () => {
  it("writes compact, stable numbers", () => {
    expect(fmt(-1)).toBe("0");
    expect(fmt(1)).toBe("1000");
    expect(fmt(0)).toBe("500");
    expect(fmt(1 / 3)).toBe("666.67");
    expect(fmt(-1 - 1e-12)).toBe("0");
  });

  it("paints fills before the outline within a layer and escapes the title", () => {
    const scene = buildScene(
      program([{ generator: "penrose", depth: 2, size: 0.9, fill: 0, altFill: 1, opacity: 0.5 }], {
        title: 'Tiles <&> "quotes"',
      }),
    );
    expect(scene.batches.map((b) => b.kind)).toEqual(["fill", "fill", "stroke"]);
    const svg = sceneToSvg(scene);
    expect(svg).toContain("<title>Tiles &lt;&amp;&gt; &quot;quotes&quot;</title>");
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg).not.toContain("NaN");
  });

  it("paints the same batches on Canvas as it writes to SVG", () => {
    const calls: string[] = [];
    let moves = 0;
    let lines = 0;
    let closes = 0;
    const ctx = {
      setTransform: () => calls.push("transform"),
      fillRect: () => calls.push("background"),
      beginPath: () => calls.push("begin"),
      moveTo: () => moves++,
      lineTo: () => lines++,
      closePath: () => closes++,
      fill: () => calls.push(`fill ${ctx.fillStyle}@${ctx.globalAlpha}`),
      stroke: () =>
        calls.push(`stroke ${ctx.strokeStyle}@${ctx.globalAlpha} w${ctx.lineWidth.toFixed(4)}`),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineJoin: "miter",
      lineCap: "butt",
      globalAlpha: 1,
    } as unknown as PaintContext & {
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
      globalAlpha: number;
    };

    const scene = buildScene(PRESETS[0].program);
    paintScene(ctx, scene, 800);
    const svg = sceneToSvg(scene);

    expect(moves).toBe(svg.match(/M/g)?.length);
    expect(lines).toBe(svg.match(/L/g)?.length);
    expect(closes).toBe(svg.match(/Z/g)?.length);
    expect(calls.filter((c) => c.startsWith("fill ") || c.startsWith("stroke "))).toEqual(
      scene.batches.map((b) =>
        b.kind === "fill"
          ? `fill ${b.color}@${b.opacity}`
          : `stroke ${b.color}@${b.opacity} w${(b.width * 0.002).toFixed(4)}`,
      ),
    );
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.globalAlpha).toBe(1);
  });
});
