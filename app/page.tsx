import critique from "@/fixtures/critique.json";
import generate from "@/fixtures/generate.json";
import { DemoBanner } from "@/components/kit/DemoBanner";
import { ThemeToggle } from "@/components/kit/ThemeToggle";
import { Intro } from "@/components/Intro";
import { Logo } from "@/components/Logo";
import { Studio } from "@/components/Studio";

const REPO_URL = "https://github.com/davezagin-max/tessellate";

/**
 * True while any session fixture is a hand-written sample. Once `pnpm record`
 * has replaced them all, the banner switches to the recorded-run wording.
 */
const SAMPLE_DATA = [...Object.values(generate), ...Object.values(critique)].some(
  (fixture) => fixture.placeholder,
);

const DEMO_LABELS = {
  sample: "Demo: Claude's drafts and critiques here are pre-written examples.",
  recorded: "Demo: these are replays of real Claude sessions, recorded earlier.",
};

export default function Home() {
  return (
    <>
      <DemoBanner placeholder={SAMPLE_DATA} demoLabels={DEMO_LABELS} />
      <header className="mx-auto flex w-full max-w-[78rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo className="size-6 shrink-0" />
          <p className="text-base font-semibold tracking-tight">Tessellate</p>
          <p className="hidden truncate text-sm text-muted sm:block">AI geometric art studio</p>
        </div>
        <nav className="flex shrink-0 items-center gap-3 text-sm">
          <a
            href={REPO_URL}
            className="text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Source
          </a>
          <ThemeToggle className="rounded-none" />
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-[78rem] flex-1 px-4 pb-16 lg:px-8">
        <Intro />
        <Studio sampleData={SAMPLE_DATA} />
      </main>
      <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted">
        Built with Claude Code and Claude Opus 5.5.
      </footer>
    </>
  );
}
