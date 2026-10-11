/**
 * Which refinement sessions ship as fixtures, so the UI knows what it can
 * replay without a key. A test keeps this list, `fixtures/presets.json`, and
 * the fixture stores in agreement.
 */
import type { RefineEffort } from "./types";

export interface RecordedSession {
  /** Preset id; also the prefix of the session's fixture keys. */
  preset: string;
  effort: RefineEffort;
}

export const RECORDED_SESSIONS: RecordedSession[] = [
  { preset: "star-and-cross", effort: "high" },
  { preset: "star-and-cross", effort: "low" },
  { preset: "penrose-sun", effort: "medium" },
  { preset: "leaded-glass", effort: "medium" },
];

/** Efforts with a recorded session for a preset, in the order they should be offered. */
export function recordedEfforts(preset: string): RefineEffort[] {
  return RECORDED_SESSIONS.filter((session) => session.preset === preset).map(
    (session) => session.effort,
  );
}
