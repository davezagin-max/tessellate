import { describe, expect, it } from "vitest";
import critiqueStore from "@/fixtures/critique.json";
import generateStore from "@/fixtures/generate.json";
import presets from "@/fixtures/presets.json";
import { ZERO_USAGE } from "@/lib/config";
import type { Fixture, FixtureStore } from "@/lib/demo";
import type { Program } from "@/lib/geometry/dsl";
import { buildScene } from "@/lib/geometry/pipeline";
import { validateProgram } from "@/lib/geometry/validate";
import { PRESET_BY_ID } from "@/lib/presets";
import { tidyCritique } from "@/lib/refine/critique";
import { RECORDED_SESSIONS } from "@/lib/refine/sessions";
import {
  CritiqueBody,
  GenerateBody,
  MAX_REVIEWS,
  demoIdFor,
  type CritiqueData,
  type GenerateData,
} from "@/lib/refine/types";

const generate = generateStore as unknown as FixtureStore<GenerateData>;
const critique = critiqueStore as unknown as FixtureStore<CritiqueData>;

interface PresetEntry {
  route: string;
  session: string;
  body: { demoId: string; prompt: string; effort: string; iteration?: number };
}
const entries = presets as PresetEntry[];

/** The program must be exactly what the validator would hand to the renderer, and must draw. */
function expectDrawable(program: Program) {
  const result = validateProgram(program);
  expect(result).toMatchObject({ ok: true, warnings: [] });
  if (!result.ok) return;
  expect(result.program).toEqual(program);
  expect(buildScene(result.program).stats.paths).toBeGreaterThan(0);
}

function expectHonestMeta(fixture: Fixture) {
  if (fixture.placeholder) {
    // A hand-written sample must not look like a recorded run.
    expect(fixture.recordedAt).toBeNull();
    expect(fixture.costUsd).toBe(0);
    expect(fixture.usage).toEqual(ZERO_USAGE);
  } else {
    expect(fixture.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fixture.usage.output_tokens).toBeGreaterThan(0);
  }
}

describe("fixtures validate against the real pipeline", () => {
  it.each(Object.entries(generate))("generate/%s holds a drawable program", (_key, fixture) => {
    expectHonestMeta(fixture);
    expectDrawable(fixture.data.program);
    expect(typeof fixture.data.corrected).toBe("boolean");
    expect(Array.isArray(fixture.data.warnings)).toBe(true);
  });

  it.each(Object.entries(critique))(
    "critique/%s holds a bounded critique and a drawable revision",
    (_key, fixture) => {
      expectHonestMeta(fixture);
      const { matches, gaps, score, done, revisedProgram } = fixture.data;
      // Passing through the live path's tidy step must change nothing.
      expect(tidyCritique({ matches, gaps, score, done })).toEqual({ matches, gaps, score, done });
      if (fixture.placeholder) {
        // A hand-written sample has to say something: what works, and what to fix.
        expect(matches.length).toBeGreaterThan(0);
        if (!done) expect(gaps.length).toBeGreaterThan(0);
      }
      expectDrawable(revisedProgram);
    },
  );
});

describe("recorded sessions are complete chains", () => {
  it("has one manifest entry per chain, and every listed preset is flagged as having a session", () => {
    const ids = RECORDED_SESSIONS.map((s) => `${s.preset}-${s.effort}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(RECORDED_SESSIONS.map((s) => s.preset)).size).toBe(3);
    for (const session of RECORDED_SESSIONS)
      expect(PRESET_BY_ID[session.preset]?.session).toBe(true);
    for (const preset of Object.values(PRESET_BY_ID)) {
      expect(RECORDED_SESSIONS.some((s) => s.preset === preset.id)).toBe(preset.session);
    }
  });

  it.each(RECORDED_SESSIONS.map((s) => [`${s.preset} at ${s.effort}`, s] as const))(
    "%s replays from the first program to a clean stop",
    (_name, { preset, effort }) => {
      const first = generate[demoIdFor(preset, effort, "generate")];
      expect(first).toBeDefined();
      let program = first.data.program;
      const scores: number[] = [];
      let ended = false;
      // Walk the chain the way the browser loop does.
      for (let review = 1; review <= MAX_REVIEWS; review++) {
        const step = critique[demoIdFor(preset, effort, review)];
        if (ended) {
          // Nothing may be left over after the session has stopped.
          expect(step).toBeUndefined();
          continue;
        }
        expect(step).toBeDefined();
        scores.push(step.data.score);
        const unchanged = JSON.stringify(step.data.revisedProgram) === JSON.stringify(program);
        if (step.data.done || unchanged) ended = true;
        else program = step.data.revisedProgram;
      }
      if (first.placeholder) {
        // Hand-written sessions must really improve, and end on the gallery preset.
        expect([...scores].sort((a, b) => a - b)).toEqual(scores);
        expect(new Set(scores).size).toBe(scores.length);
        expect(program).toEqual(PRESET_BY_ID[preset].program);
      }
    },
  );

  it("has no fixture outside a listed session", () => {
    const expected = new Set<string>();
    for (const { preset, effort } of RECORDED_SESSIONS) {
      expected.add(demoIdFor(preset, effort, "generate"));
      for (let review = 1; review <= MAX_REVIEWS; review++)
        expected.add(demoIdFor(preset, effort, review));
    }
    for (const key of [...Object.keys(generate), ...Object.keys(critique)])
      expect(expected.has(key)).toBe(true);
  });
});

describe("fixtures/presets.json", () => {
  it("lists every fixture exactly once, on the right route", () => {
    const listed = entries.map((e) => `${e.route} ${e.body.demoId}`).sort();
    const stored = [
      ...Object.keys(generate).map((key) => `/api/generate ${key}`),
      ...Object.keys(critique).map((key) => `/api/critique ${key}`),
    ].sort();
    expect(listed).toEqual(stored);
  });

  it("carries the same prompt and effort the app sends for that session", () => {
    for (const entry of entries) {
      const session = RECORDED_SESSIONS.find((s) => `${s.preset}-${s.effort}` === entry.session);
      expect(session).toBeDefined();
      if (!session) continue;
      expect(entry.body.prompt).toBe(PRESET_BY_ID[session.preset].prompt);
      expect(entry.body.effort).toBe(session.effort);
      if (entry.route === "/api/generate") {
        expect(GenerateBody.safeParse(entry.body).success).toBe(true);
        expect(entry.body.demoId).toBe(demoIdFor(session.preset, session.effort, "generate"));
      } else {
        // The program and the PNG are produced in the browser during recording, so they are not listed here.
        expect(
          CritiqueBody.omit({ program: true, image: true }).safeParse(entry.body).success,
        ).toBe(true);
        expect(entry.body.demoId).toBe(
          demoIdFor(session.preset, session.effort, entry.body.iteration as number),
        );
      }
    }
  });
});
