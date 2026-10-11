import { describe, expect, it, vi } from "vitest";
import { POST as critiqueRoute } from "@/app/api/critique/route";
import { POST as generateRoute } from "@/app/api/generate/route";
import type { ApiMeta, ApiResponse } from "@/lib/api";
import { ZERO_USAGE } from "@/lib/config";
import type { Program } from "@/lib/geometry/dsl";
import { PRESET_BY_ID } from "@/lib/presets";
import {
  addMeta,
  runSession,
  type ApiCall,
  type Phase,
  type SessionState,
} from "@/lib/refine/session";
import type { CritiqueData, GenerateData } from "@/lib/refine/types";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  "/api/generate": generateRoute,
  "/api/critique": critiqueRoute,
};

/** Calls the real route handlers the way the browser would, with no key. Each test gets its own address. */
function routeApi(
  address: string,
  sent: { path: string; body: Record<string, unknown> }[] = [],
): ApiCall {
  return async <D>(path: string, body: unknown) => {
    sent.push({ path, body: body as Record<string, unknown> });
    const res = await ROUTES[path](
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": address },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()) as ApiResponse<D>;
  };
}

const star = PRESET_BY_ID["star-and-cross"];

describe("smoke: the main path in demo mode", () => {
  it("replays a recorded session through the real routes, with no key and no browser", async () => {
    const sent: { path: string; body: Record<string, unknown> }[] = [];
    const states: SessionState[] = [];
    const render = vi.fn(() => PNG);

    const final = await runSession({
      prompt: star.prompt,
      effort: "high",
      demo: star.id,
      includeImage: false,
      api: routeApi("10.0.0.1", sent),
      render,
      onState: (state) => states.push(state),
    });

    // One generate, three reviews, each answered from a fixture.
    expect(sent.map((s) => `${s.path} ${s.body.demoId}`)).toEqual([
      "/api/generate star-and-cross-high-generate",
      "/api/critique star-and-cross-high-critique-1",
      "/api/critique star-and-cross-high-critique-2",
      "/api/critique star-and-cross-high-critique-3",
    ]);
    // Demo mode never uploads the render.
    expect(sent.every((s) => !("image" in s.body))).toBe(true);

    expect(final).toMatchObject({
      phase: "done",
      outcome: "matched",
      proposal: null,
      error: null,
      review: 3,
    });
    expect(final.frames).toHaveLength(3);
    expect(render).toHaveBeenCalledTimes(3);
    expect(final.frames.map((f) => f.critique?.score)).toEqual([4, 7, 9]);
    expect(final.frames.map((f) => f.critique?.done)).toEqual([false, false, true]);
    expect(final.frames.every((f) => f.image === PNG)).toBe(true);

    // The session ends on the gallery preset, and each revision's diff is computed, not narrated.
    expect(final.frames[2].program).toEqual(star.program);
    expect(final.frames[0].changes).toEqual([]);
    expect(final.frames[1].changes).toContain("Layer 1: size 0.4 → 0.5");
    expect(final.frames[1].changes).toContain("Layer 3: added (polygon, p4m)");
    expect(final.frames[2].changes).toContain("Layer 2: rotation 0 → 22.5");

    // Honest labelling: these fixtures are samples, and the totals say so.
    expect(final.meta).toMatchObject({ mode: "demo", placeholder: true, costUsd: 0 });

    // The UI saw every step in order.
    const phases = states.map((s) => s.phase).filter((p, i, all) => p !== all[i - 1]);
    expect(phases).toEqual([
      "writing",
      "drawing",
      "reviewing",
      "drawing",
      "reviewing",
      "drawing",
      "reviewing",
      "done",
    ]);
  });

  it("replays every recorded session to a finished state", async () => {
    const cases: [string, "low" | "medium" | "high", string, number][] = [
      ["star-and-cross", "low", "limit", 3],
      ["penrose-sun", "medium", "matched", 3],
      ["leaded-glass", "medium", "matched", 3],
    ];
    for (const [id, effort, outcome, frames] of cases) {
      const final = await runSession({
        prompt: PRESET_BY_ID[id].prompt,
        effort,
        demo: id,
        includeImage: false,
        api: routeApi("10.0.0.2"),
        render: () => PNG,
        onState: () => {},
      });
      expect(final.outcome).toBe(outcome);
      expect(final.frames).toHaveLength(frames);
      if (outcome === "limit") expect(final.proposal).toEqual(PRESET_BY_ID[id].program);
    }
  });

  it("explains a demo miss instead of failing silently", async () => {
    const final = await runSession({
      prompt: "a spiral of hexagons",
      effort: "medium",
      demo: null,
      includeImage: false,
      api: routeApi("10.0.0.3"),
      render: () => PNG,
      onState: () => {},
    });
    expect(final.phase).toBe("error");
    expect(final.error?.kind).toBe("demo_miss");
    expect(final.error?.message).toContain("add your Anthropic key");
    expect(final.frames).toEqual([]);
  });

  it("rejects malformed and oversized requests at the route", async () => {
    const post = (path: string, body: unknown, address: string) =>
      ROUTES[path](
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": address },
          body: JSON.stringify(body),
        }),
      );
    expect(
      (await post("/api/generate", { prompt: "x", effort: "extreme" }, "10.0.0.4")).status,
    ).toBe(400);
    expect(
      (await post("/api/critique", { prompt: "x", effort: "low", iteration: 1 }, "10.0.0.4"))
        .status,
    ).toBe(400);
    const huge = {
      prompt: "x",
      effort: "low",
      iteration: 1,
      program: star.program,
      image: "A".repeat(2_300_000),
    };
    expect((await post("/api/critique", huge, "10.0.0.4")).status).toBe(413);
    // A malformed key is refused before any fixture or model is consulted.
    const res = await ROUTES["/api/generate"](
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anthropic-key": "nope",
          "x-forwarded-for": "10.0.0.4",
        },
        body: JSON.stringify({ prompt: "x", effort: "low" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("runSession with a scripted server", () => {
  const meta = (costUsd: number): ApiMeta => ({
    mode: "live",
    placeholder: false,
    recordedAt: null,
    model: "claude-opus-5-5",
    usage: { ...ZERO_USAGE, input_tokens: 100, output_tokens: 50 },
    costUsd,
  });
  const base = star.program;
  const thicker = (width: number): Program => ({
    ...base,
    layers: [{ ...base.layers[0], strokeWidth: width }, ...base.layers.slice(1)],
  });
  const generated = (program: Program): ApiResponse<GenerateData> => ({
    ok: true,
    data: { program, corrected: false, warnings: [] },
    meta: meta(0.02),
  });
  const reviewed = (
    revisedProgram: Program,
    done = false,
    score = 6,
  ): ApiResponse<CritiqueData> => ({
    ok: true,
    data: {
      matches: ["m"],
      gaps: done ? [] : ["g"],
      score,
      done,
      revisedProgram,
      corrected: false,
      warnings: [],
    },
    meta: meta(0.05),
  });

  function scripted(responses: unknown[]) {
    const bodies: Record<string, unknown>[] = [];
    const api: ApiCall = async <D>(_path: string, body: unknown) => {
      bodies.push(body as Record<string, unknown>);
      return responses.shift() as ApiResponse<D>;
    };
    return { api, bodies };
  }
  const run = (api: ApiCall, extra: Partial<Parameters<typeof runSession>[0]> = {}) =>
    runSession({
      prompt: "stars",
      effort: "medium",
      demo: null,
      includeImage: true,
      api,
      render: () => PNG,
      onState: () => {},
      ...extra,
    });

  it("uploads the render in live mode, sends no demo id, and adds up the cost", async () => {
    const { api, bodies } = scripted([
      generated(base),
      reviewed(thicker(4)),
      reviewed(thicker(4), true, 9),
    ]);
    const final = await run(api);
    expect(final).toMatchObject({ phase: "done", outcome: "matched" });
    expect(final.frames).toHaveLength(2);
    expect(bodies.every((b) => !("demoId" in b))).toBe(true);
    expect(bodies[1]).toMatchObject({ image: PNG, iteration: 1, program: base, effort: "medium" });
    expect(bodies[2]).toMatchObject({ iteration: 2, program: thicker(4) });
    expect(final.meta?.costUsd).toBeCloseTo(0.12);
    expect(final.meta?.usage.input_tokens).toBe(300);
  });

  it("stops at three reviews and keeps the last revision as an unreviewed proposal", async () => {
    const { api, bodies } = scripted([
      generated(base),
      reviewed(thicker(3)),
      reviewed(thicker(4)),
      reviewed(thicker(5), false, 8),
    ]);
    const final = await run(api);
    expect(bodies).toHaveLength(4);
    expect(final).toMatchObject({ phase: "done", outcome: "limit" });
    expect(final.frames).toHaveLength(3);
    expect(final.proposal).toEqual(thicker(5));
    // Every frame on screen has been reviewed; the proposal is not shown as a frame.
    expect(final.frames.every((f) => f.critique !== null)).toBe(true);
  });

  it("stops early when a review changes nothing", async () => {
    const { api, bodies } = scripted([generated(base), reviewed(base, false, 8)]);
    const final = await run(api);
    expect(final).toMatchObject({ phase: "done", outcome: "unchanged" });
    expect(bodies).toHaveLength(2);
  });

  it("refuses to draw a program the validator rejects, even if the server sent it", async () => {
    const bad = { ...base, layers: [{ ...base.layers[0], stroke: 5 }] };
    const first = await run(scripted([generated(bad)]).api);
    expect(first).toMatchObject({ phase: "error", error: { kind: "server" } });
    expect(first.error?.message).toContain("palette index 5");

    const second = await run(scripted([generated(base), reviewed(bad)]).api);
    expect(second.phase).toBe("error");
    expect(second.frames).toHaveLength(1);
    expect(second.frames[0].critique?.score).toBe(6);
  });

  it("surfaces a refusal or auth error with what was spent so far", async () => {
    const refusal: ApiResponse<CritiqueData> = {
      ok: false,
      error: { kind: "refusal", message: "Claude declined this request." },
      meta: meta(0.01),
    };
    const final = await run(scripted([generated(base), refusal]).api);
    expect(final).toMatchObject({ phase: "error", error: { kind: "refusal" } });
    expect(final.meta?.costUsd).toBeCloseTo(0.03);
  });

  it("stops between steps when aborted", async () => {
    const controller = new AbortController();
    const { api, bodies } = scripted([generated(base), reviewed(thicker(4))]);
    const final = await run(api, {
      signal: controller.signal,
      pause: async (phase: Phase) => {
        if (phase === "reviewing") controller.abort();
      },
    });
    expect(final).toMatchObject({ phase: "done", outcome: "stopped" });
    expect(bodies).toHaveLength(1);
    expect(final.frames).toHaveLength(1);
  });

  it("stops at once when aborted in the middle of a paced replay step", async () => {
    const controller = new AbortController();
    const { api, bodies } = scripted([generated(base), reviewed(thicker(4))]);
    // A replay pause that would never end on its own: only Stop can finish this run.
    const forever = new Promise<void>(() => {});
    const running = run(api, {
      signal: controller.signal,
      pause: (phase: Phase) => (phase === "reviewing" ? forever : Promise.resolve()),
      onState: (state) => {
        if (state.phase === "reviewing") queueMicrotask(() => controller.abort());
      },
    });
    const final = await running;
    expect(final).toMatchObject({ phase: "done", outcome: "stopped" });
    // The first draft is kept; the review was never requested.
    expect(final.frames).toHaveLength(1);
    expect(bodies).toHaveLength(1);
  });
});

describe("addMeta", () => {
  it("sums usage and cost and stays a placeholder if any call was one", () => {
    const real: ApiMeta = {
      mode: "demo",
      placeholder: false,
      recordedAt: "2026-10-11T00:00:00.000Z",
      model: "claude-opus-5-5",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 1,
      },
      costUsd: 0.5,
    };
    const sample: ApiMeta = {
      ...real,
      placeholder: true,
      recordedAt: null,
      costUsd: 0,
      usage: ZERO_USAGE,
    };
    expect(addMeta(null, real)).toBe(real);
    expect(addMeta(real, undefined)).toBe(real);
    expect(addMeta(real, real)).toMatchObject({
      costUsd: 1,
      usage: {
        input_tokens: 20,
        output_tokens: 10,
        cache_creation_input_tokens: 4,
        cache_read_input_tokens: 2,
      },
    });
    expect(addMeta(real, sample)?.placeholder).toBe(true);
  });
});
