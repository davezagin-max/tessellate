import { describe, expect, it } from "vitest";
import { apply, compose, isIsometry } from "@/lib/geometry/affine";
import { WALLPAPER_GROUPS } from "@/lib/geometry/dsl";
import {
  GROUP_SPECS,
  classifyOp,
  composeOps,
  coveringTranslations,
  groupOps,
  latticeFor,
  opKey,
  radialMaps,
  toAffine,
  wallpaperMaps,
  type Box,
  type FracOp,
  type OpKind,
} from "@/lib/geometry/symmetry";

const count = (ops: FracOp[], kind: OpKind) => ops.filter((o) => classifyOp(o) === kind).length;

describe("wallpaper groups", () => {
  it("has all 17 groups with the right number of maps per cell", () => {
    expect(WALLPAPER_GROUPS).toHaveLength(17);
    const orders = Object.fromEntries(WALLPAPER_GROUPS.map((g) => [g, groupOps(g).length]));
    expect(orders).toEqual({
      p1: 1,
      p2: 2,
      pm: 2,
      pg: 2,
      cm: 4,
      pmm: 4,
      pmg: 4,
      pgg: 4,
      cmm: 8,
      p4: 4,
      p4m: 8,
      p4g: 8,
      p3: 3,
      p3m1: 6,
      p31m: 6,
      p6: 6,
      p6m: 12,
    });
  });

  it.each(WALLPAPER_GROUPS)("%s: point group order matches the spec", (name) => {
    const linear = new Set(groupOps(name).map((o) => o.m.join(",")));
    expect(linear.size).toBe(GROUP_SPECS[name].pointOrder);
    expect(groupOps(name).length).toBe(GROUP_SPECS[name].order);
  });

  it.each(WALLPAPER_GROUPS)("%s: is closed under composition modulo the lattice", (name) => {
    const ops = groupOps(name);
    const keys = new Set(ops.map(opKey));
    for (const p of ops) {
      for (const q of ops) expect(keys.has(opKey(composeOps(p, q)))).toBe(true);
    }
  });

  it.each(WALLPAPER_GROUPS)("%s: every map has an inverse in the set", (name) => {
    const ops = groupOps(name);
    const identity = opKey(ops[0]);
    expect(identity).toBe("1,0,0,1|0,0");
    for (const p of ops) {
      expect(ops.some((q) => opKey(composeOps(p, q)) === identity)).toBe(true);
    }
  });

  it.each(WALLPAPER_GROUPS)("%s: every map is an isometry of the canvas", (name) => {
    for (const [cell, aspect] of [
      [0.5, 1],
      [0.31, 1.7],
      [1.2, 0.6],
    ]) {
      const { maps } = wallpaperMaps(name, cell, aspect);
      for (const map of maps) expect(isIsometry(map)).toBe(true);
    }
  });

  it.each(WALLPAPER_GROUPS)("%s: a generic point has one image per map inside a cell", (name) => {
    // Work in lattice coordinates so "inside one cell" is just "modulo 1".
    const ops = groupOps(name);
    const [x, y] = [0.1234, 0.3141];
    const images = new Set(
      ops.map((o) => {
        const u = o.m[0] * x + o.m[1] * y + o.t[0] / 2;
        const v = o.m[2] * x + o.m[3] * y + o.t[1] / 2;
        const wrap = (n: number) => (((n % 1) + 1) % 1).toFixed(6);
        return `${wrap(u)},${wrap(v)}`;
      }),
    );
    expect(images.size).toBe(ops.length);
  });

  it("tells mirrors from glide reflections", () => {
    const kinds = (name: (typeof WALLPAPER_GROUPS)[number]) => {
      const ops = groupOps(name);
      return {
        rotation: count(ops, "rotation"),
        mirror: count(ops, "mirror"),
        glide: count(ops, "glide"),
      };
    };
    expect(kinds("pmm")).toEqual({ rotation: 1, mirror: 2, glide: 0 });
    expect(kinds("pmg")).toEqual({ rotation: 1, mirror: 1, glide: 1 });
    // pgg is the group with glides both ways and no mirror at all.
    expect(kinds("pgg")).toEqual({ rotation: 1, mirror: 0, glide: 2 });
    expect(kinds("pg")).toEqual({ rotation: 0, mirror: 0, glide: 1 });
    expect(kinds("cm")).toEqual({ rotation: 0, mirror: 1, glide: 1 });
    expect(kinds("p4m")).toEqual({ rotation: 3, mirror: 4, glide: 0 });
    // p4g: its 8 maps include 2 mirrors (the diagonals) and 2 true glides (along the axes).
    expect(kinds("p4g")).toEqual({ rotation: 3, mirror: 2, glide: 2 });
    expect(kinds("p3")).toEqual({ rotation: 2, mirror: 0, glide: 0 });
    expect(kinds("p6m")).toEqual({ rotation: 5, mirror: 6, glide: 0 });
  });

  it("p4g mirrors are diagonal and its glides run along the axes", () => {
    for (const o of groupOps("p4g")) {
      const kind = classifyOp(o);
      const diagonal = o.m[0] === 0 && o.m[3] === 0;
      if (kind === "mirror") expect(diagonal).toBe(true);
      if (kind === "glide") expect(diagonal).toBe(false);
    }
  });

  it("separates p3m1 from p31m by whether the centre at (1/3, 2/3) sits on a mirror", () => {
    // Exact arithmetic in sixths: p = (2/6, 4/6); a map fixes p modulo the lattice
    // when M*p + t - p is a whole number of cells.
    const fixesCentre = (o: FracOp) => {
      const dx = o.m[0] * 2 + o.m[1] * 4 + o.t[0] * 3 - 2;
      const dy = o.m[2] * 2 + o.m[3] * 4 + o.t[1] * 3 - 4;
      return dx % 6 === 0 && dy % 6 === 0;
    };
    const mirrorsThrough = (name: "p3m1" | "p31m") =>
      groupOps(name).filter((o) => classifyOp(o) === "mirror" && fixesCentre(o)).length;
    expect(mirrorsThrough("p3m1")).toBe(3);
    expect(mirrorsThrough("p31m")).toBe(0);
    // Both still have a third-turn about that centre.
    for (const name of ["p3m1", "p31m"] as const) {
      expect(groupOps(name).some((o) => classifyOp(o) === "rotation" && fixesCentre(o))).toBe(true);
    }
  });

  it("converts lattice maps to the expected canvas rotations", () => {
    const square = latticeFor("square", 0.5, 1);
    const quarter = toAffine({ m: [0, -1, 1, 0], t: [0, 0] }, square);
    const [x, y] = apply(quarter, 1, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);

    const hex = latticeFor("hexagonal", 0.5, 1);
    const sixth = toAffine({ m: [1, -1, 1, 0], t: [0, 0] }, hex);
    expect(sixth[0]).toBeCloseTo(Math.cos(Math.PI / 3));
    expect(sixth[1]).toBeCloseTo(Math.sin(Math.PI / 3));
    // Six sixth-turns are the identity.
    let m = sixth;
    for (let i = 0; i < 5; i++) m = compose(sixth, m);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(m[i]).toBeCloseTo(v));

    // A glide's translation is half a cell in canvas units.
    const glide = toAffine({ m: [-1, 0, 0, 1], t: [0, 1] }, latticeFor("rectangular", 0.4, 1.5));
    expect(glide[4]).toBeCloseTo(0);
    expect(glide[5]).toBeCloseTo(0.3);
  });
});

describe("radial symmetry", () => {
  it("builds the cyclic group C_n and the dihedral group D_n", () => {
    expect(radialMaps(7, false)).toHaveLength(7);
    const d5 = radialMaps(5, true);
    expect(d5).toHaveLength(10);
    for (const map of d5) {
      expect(isIsometry(map)).toBe(true);
      expect(map[4]).toBe(0);
      expect(map[5]).toBe(0);
    }
    // Half of D_n preserves orientation, half reverses it.
    const dets = d5.map((m) => Math.round(m[0] * m[3] - m[1] * m[2]));
    expect(dets.filter((d) => d === 1)).toHaveLength(5);
    expect(dets.filter((d) => d === -1)).toHaveLength(5);
  });

  it("is closed under composition", () => {
    const maps = radialMaps(6, true);
    const key = (m: readonly number[]) =>
      m.map((v) => (Math.round(v * 1e6) / 1e6 || 0).toFixed(6)).join(",");
    const keys = new Set(maps.map(key));
    for (const p of maps) for (const q of maps) expect(keys.has(key(compose(p, q)))).toBe(true);
  });
});

describe("coveringTranslations", () => {
  it("returns exactly the lattice translations that bring a box onto the canvas", () => {
    const view: Box = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const cases: {
      kind: "square" | "hexagonal" | "rectangular";
      cell: number;
      aspect: number;
      box: Box;
    }[] = [
      {
        kind: "square",
        cell: 0.5,
        aspect: 1,
        box: { minX: -0.1, minY: -0.1, maxX: 0.1, maxY: 0.1 },
      },
      {
        kind: "hexagonal",
        cell: 0.37,
        aspect: 1,
        box: { minX: 0.2, minY: -0.3, maxX: 0.5, maxY: 0.05 },
      },
      {
        kind: "rectangular",
        cell: 0.6,
        aspect: 0.45,
        box: { minX: -1.4, minY: 0.7, maxX: -1.1, maxY: 0.9 },
      },
    ];
    for (const { kind, cell, aspect, box } of cases) {
      const lattice = latticeFor(kind, cell, aspect);
      const got = coveringTranslations(lattice, box, view);
      const expected: string[] = [];
      for (let i = -30; i <= 30; i++) {
        for (let j = -30; j <= 30; j++) {
          const tx = i * lattice.a[0] + j * lattice.b[0];
          const ty = i * lattice.a[1] + j * lattice.b[1];
          const hits =
            box.maxX + tx >= view.minX &&
            box.minX + tx <= view.maxX &&
            box.maxY + ty >= view.minY &&
            box.minY + ty <= view.maxY;
          if (hits) expected.push(`${tx.toFixed(6)},${ty.toFixed(6)}`);
        }
      }
      const actual: string[] = [];
      for (let k = 0; k < got.length; k += 2)
        actual.push(`${got[k].toFixed(6)},${got[k + 1].toFixed(6)}`);
      expect(actual.sort()).toEqual(expected.sort());
      expect(actual.length).toBeGreaterThan(4);
    }
  });
});
