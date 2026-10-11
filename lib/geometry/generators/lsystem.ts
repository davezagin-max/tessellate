/**
 * L-systems: a string-rewriting grammar drawn by a turtle.
 *
 *   F, G  draw forward one step        +  turn right by `angle`
 *   f     move forward without drawing -  turn left by `angle`
 *   [ ]   push / pop position+heading  |  turn 180 degrees
 *   any other letter is a placeholder that only matters to the rules
 */
import { LIMITS, type Layer } from "../dsl";
import type { MotifPath } from "./types";

const SYMBOLS = /^[A-Za-z+\-[\]|]*$/;

export type RuleSet = Map<string, string>;

export type ParsedRules = { ok: true; rules: RuleSet } | { ok: false; error: string };

/** Parses `"F=F+F--F+F;X=FX"`. Whitespace is ignored; `;` and `,` both separate rules. */
export function parseRules(source: string): ParsedRules {
  const rules: RuleSet = new Map();
  const clean = source.replace(/\s+/g, "");
  if (clean === "") return { ok: true, rules };
  for (const part of clean.split(/[;,]/)) {
    if (part === "") continue;
    const match = /^([A-Za-z])=(.*)$/.exec(part);
    if (!match) return { ok: false, error: `rule "${part}" must look like F=F+F` };
    const [, symbol, replacement] = match;
    if (!SYMBOLS.test(replacement)) {
      return { ok: false, error: `rule "${part}" uses a symbol outside A-Z a-z + - [ ] |` };
    }
    if (rules.has(symbol)) return { ok: false, error: `symbol ${symbol} has two rules` };
    rules.set(symbol, replacement);
  }
  return { ok: true, rules };
}

export function isValidAxiom(axiom: string): boolean {
  return axiom.length > 0 && SYMBOLS.test(axiom);
}

/**
 * Rewrites the axiom `depth` times. Returns null as soon as the string would
 * pass `maxSymbols`, so a runaway grammar costs almost nothing to reject.
 */
export function expandLSystem(
  axiom: string,
  rules: RuleSet,
  depth: number,
  maxSymbols: number = LIMITS.maxSymbols,
): string | null {
  let current = axiom;
  for (let i = 0; i < depth; i++) {
    let length = 0;
    for (const symbol of current) length += rules.get(symbol)?.length ?? 1;
    if (length > maxSymbols) return null;
    let next = "";
    for (const symbol of current) next += rules.get(symbol) ?? symbol;
    current = next;
  }
  return current.length > maxSymbols ? null : current;
}

/** Number of line segments the turtle will draw for an expanded string. */
export function countDraws(expanded: string): number {
  let n = 0;
  for (const symbol of expanded) if (symbol === "F" || symbol === "G") n++;
  return n;
}

/**
 * Number of separate strokes the turtle will make, without tracing them.
 * A new stroke starts at the first draw, and at the first draw after a
 * pen-up move or a branch return.
 */
export function countStrokes(expanded: string): number {
  let strokes = 0;
  let penDown = false;
  let depth = 0;
  for (const symbol of expanded) {
    if (symbol === "F" || symbol === "G") {
      if (!penDown) strokes++;
      penDown = true;
    } else if (symbol === "f") {
      penDown = false;
    } else if (symbol === "[") {
      depth++;
    } else if (symbol === "]" && depth > 0) {
      depth--;
      penDown = false;
    }
  }
  return strokes;
}

/** Walks the turtle and returns raw polylines in turtle units (step length 1). */
export function traceTurtle(expanded: string, angleDegrees: number): number[][] {
  const turn = (angleDegrees * Math.PI) / 180;
  let x = 0;
  let y = 0;
  // Start pointing up, the way plant-like systems are usually drawn.
  let heading = -Math.PI / 2;
  const stack: number[] = [];
  const lines: number[][] = [];
  let line: number[] | null = null;

  for (const symbol of expanded) {
    switch (symbol) {
      case "F":
      case "G":
        if (!line) {
          line = [x, y];
          lines.push(line);
        }
        x += Math.cos(heading);
        y += Math.sin(heading);
        line.push(x, y);
        break;
      case "f":
        x += Math.cos(heading);
        y += Math.sin(heading);
        line = null;
        break;
      case "+":
        heading += turn;
        break;
      case "-":
        heading -= turn;
        break;
      case "|":
        heading += Math.PI;
        break;
      case "[":
        stack.push(x, y, heading);
        break;
      case "]":
        if (stack.length >= 3) {
          heading = stack.pop() as number;
          y = stack.pop() as number;
          x = stack.pop() as number;
          line = null;
        }
        break;
      default:
        break;
    }
  }
  return lines;
}

/** Centres the drawing on its bounding box and scales it to fit the unit square. */
export function fitToUnit(lines: number[][]): number[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length; i += 2) {
      minX = Math.min(minX, line[i]);
      maxX = Math.max(maxX, line[i]);
      minY = Math.min(minY, line[i + 1]);
      maxY = Math.max(maxY, line[i + 1]);
    }
  }
  if (!Number.isFinite(minX)) return [];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  const k = half > 1e-12 ? 1 / half : 1;
  return lines.map((line) => {
    const out = new Array<number>(line.length);
    for (let i = 0; i < line.length; i += 2) {
      out[i] = (line[i] - cx) * k;
      out[i + 1] = (line[i + 1] - cy) * k;
    }
    return out;
  });
}

export function lsystem(layer: Pick<Layer, "axiom" | "rules" | "angle" | "depth">): MotifPath[] {
  const parsed = parseRules(layer.rules);
  if (!parsed.ok || !isValidAxiom(layer.axiom)) return [];
  const expanded = expandLSystem(layer.axiom, parsed.rules, layer.depth);
  if (expanded === null) return [];
  return fitToUnit(traceTurtle(expanded, layer.angle)).map((pts) => {
    const n = pts.length;
    // A curve that returns to its start (a Koch snowflake) is a closed shape and can be filled.
    const returns =
      n >= 8 && Math.abs(pts[0] - pts[n - 2]) < 1e-6 && Math.abs(pts[1] - pts[n - 1]) < 1e-6;
    return returns
      ? { pts: pts.slice(0, n - 2), closed: true, tag: 0 as const }
      : { pts, closed: false, tag: 0 as const };
  });
}
