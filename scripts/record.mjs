#!/usr/bin/env node
/**
 * Records real Claude runs for every session in fixtures/presets.json.
 *
 *   pnpm record                      # all sessions, stops at a $3 budget
 *   pnpm record --budget 1.50        # tighter cap
 *   pnpm record --only penrose-sun   # sessions whose id contains the text
 *
 * A Tessellate session cannot be replayed with plain HTTP requests: each
 * review needs a PNG of the program the previous step returned, and that PNG
 * is rendered in the browser. So this script drives the real page in headless
 * Chromium (`/?record=1&preset=...&effort=...`), clicks the same button a
 * visitor does, and lets the app run its own loop. The dev server runs with
 * RECORD_FIXTURES=1 and ALLOW_SERVER_KEY=1, so each route calls Claude with
 * your key and writes its response into fixtures/<store>.json under the
 * session's demo ids, replacing the hand-written placeholder.
 *
 * A real session may take fewer or more reviews than the placeholder did, so
 * afterwards the script drops any leftover placeholder steps for that session
 * and rewrites its entries in fixtures/presets.json to match what was recorded.
 *
 * The key is read from the shell, .env.local, or ../.env and never printed.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const budget = Number(flag("--budget") ?? 3);
const port = Number(flag("--port") ?? 3110);
const only = flag("--only");

for (const file of [".env.local", "../.env"]) {
  if (!process.env.ANTHROPIC_API_KEY && existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to ../.env or .env.local, then re-run.");
  process.exit(1);
}

const PRESETS_FILE = "fixtures/presets.json";
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** Session id -> { preset, effort, prompt }, in file order. */
const sessions = new Map();
for (const entry of readJson(PRESETS_FILE)) {
  if (only && !entry.session.includes(only)) continue;
  if (!sessions.has(entry.session)) {
    const effort = entry.body.effort;
    sessions.set(entry.session, {
      effort,
      preset: entry.session.slice(0, -(effort.length + 1)),
      prompt: entry.body.prompt,
    });
  }
}
if (sessions.size === 0) {
  console.error("No sessions matched.");
  process.exit(1);
}

const base = `http://localhost:${port}`;
const server = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
  env: { ...process.env, RECORD_FIXTURES: "1", ALLOW_SERVER_KEY: "1" },
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Dev server did not start.");
}

/**
 * Makes fixtures and presets.json describe exactly the session that was just
 * recorded: its generate step plus however many reviews it really took.
 * Returns the number of reviews, or null if the session was not recorded.
 */
function reconcile(id, session, started) {
  const fresh = (fixture) => fixture && !fixture.placeholder && fixture.recordedAt >= started;
  if (!fresh(readJson("fixtures/generate.json")[`${id}-generate`])) return null;

  const critique = readJson("fixtures/critique.json");
  let reviews = 0;
  while (fresh(critique[`${id}-critique-${reviews + 1}`])) reviews += 1;
  // Drop leftovers: placeholder steps, and steps from an older, longer recording.
  for (const key of Object.keys(critique)) {
    if (!key.startsWith(`${id}-critique-`)) continue;
    if (Number(key.slice(`${id}-critique-`.length)) > reviews) delete critique[key];
  }
  writeJson("fixtures/critique.json", critique);

  const entries = [
    {
      route: "/api/generate",
      session: id,
      body: { demoId: `${id}-generate`, prompt: session.prompt, effort: session.effort },
    },
  ];
  for (let n = 1; n <= reviews; n++) {
    entries.push({
      route: "/api/critique",
      session: id,
      body: {
        demoId: `${id}-critique-${n}`,
        prompt: session.prompt,
        iteration: n,
        effort: session.effort,
      },
    });
  }
  const all = readJson(PRESETS_FILE);
  const at = all.findIndex((entry) => entry.session === id);
  const rest = all.filter((entry) => entry.session !== id);
  rest.splice(at === -1 ? rest.length : at, 0, ...entries);
  writeJson(PRESETS_FILE, rest);
  return reviews;
}

await waitForServer();
const browser = await chromium.launch();
let spent = 0;
let failed = 0;

try {
  for (const [id, session] of sessions) {
    if (spent >= budget) {
      console.error(`Budget of $${budget.toFixed(2)} reached. Stopping before: ${id}`);
      failed += 1;
      break;
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const started = new Date().toISOString();
    let cost = 0;
    page.on("response", async (response) => {
      if (!new URL(response.url()).pathname.startsWith("/api/")) return;
      try {
        cost += (await response.json()).meta?.costUsd ?? 0;
      } catch {}
    });

    let message = null;
    try {
      await page.goto(`${base}/?record=1&preset=${session.preset}&effort=${session.effort}`, {
        waitUntil: "networkidle",
      });
      await page.click("[data-testid=refine]");
      const end = await page.waitForSelector(
        "[data-refine-phase=done], [data-refine-phase=error]",
        {
          timeout: 20 * 60_000,
        },
      );
      if ((await end.getAttribute("data-refine-phase")) !== "done") {
        message =
          (await page.textContent("[role=alert]"))?.trim() ?? "the session ended in an error";
      }
      // Let the last response handler finish adding up the cost.
      await page.waitForTimeout(300);
    } catch (error) {
      message = error instanceof Error ? error.message.split("\n")[0] : "the browser run failed";
    }
    await page.close();
    spent += cost;

    const reviews = message ? null : reconcile(id, session, started);
    if (reviews === null) {
      failed += 1;
      console.error(
        `FAILED    ${id}  ${message ?? "the server answered from a fixture instead of calling Claude"}`,
      );
      continue;
    }
    console.log(`recorded  ${id}  1 draft + ${reviews} review(s)  $${cost.toFixed(4)}`);
  }
} finally {
  await browser.close();
}

console.log(
  `\nTotal spent: $${spent.toFixed(4)} across ${sessions.size} session(s). Failures: ${failed}.`,
);
console.log("Run `pnpm test` next: it checks every recorded fixture against the real pipeline.");
process.exit(failed ? 1 : 0);
