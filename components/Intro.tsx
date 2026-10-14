import { MAX_REVIEWS } from "@/lib/refine/types";

const STEPS = [
  {
    title: "You describe a pattern",
    detail: "In plain words: shapes, symmetry, colours, line weight.",
  },
  {
    title: "Claude writes a drawing program",
    detail: "A short list of shapes and symmetry rules. Your browser draws it.",
  },
  {
    title: "Claude checks its own drawing",
    detail: `It looks at the picture, scores it, names what is off, and revises it, up to ${MAX_REVIEWS} times.`,
  },
];

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={`size-3 shrink-0 text-accent ${className}`}>
      <path d="M3 1.5 8 6l-5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/** The headline and the loop in three plain steps, above the studio. Static. */
export function Intro() {
  return (
    <div className="pb-5 pt-1 lg:pb-7 lg:pt-2">
      <h1 className="max-w-[46rem] text-[1.45rem] font-semibold leading-[1.2] tracking-tight sm:text-3xl lg:max-w-none lg:text-[2rem]">
        Describe a pattern. Claude draws it, critiques its own drawing, and improves it.
      </h1>
      <ol
        aria-label="How it works"
        className="mt-3 flex flex-col gap-1 text-sm leading-5 lg:mt-4 lg:grid lg:grid-cols-3 lg:gap-6"
      >
        {STEPS.map((step) => (
          <li key={step.title} className="flex items-start gap-2 lg:gap-2.5">
            <Arrow className="mt-1" />
            <div>
              <p className="font-medium">{step.title}</p>
              <p className="mt-0.5 hidden text-muted lg:block">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
