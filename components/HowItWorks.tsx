import { LIMITS } from "@/lib/geometry/dsl";
import { MAX_REVIEWS } from "@/lib/refine/types";

const STEPS = [
  { title: "Prompt", note: "plain words" },
  { title: "Program", note: "JSON, structured output" },
  { title: "Validator", note: "clamps, caps, rejects" },
  { title: "Render", note: "Canvas, SVG, plotter" },
  { title: "Review", note: "Claude looks at the PNG" },
];

/** The loop in one row, then the three ideas behind it. Static; no client code. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mt-14 border-t border-border pt-10">
      <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
        How it works
      </h2>

      <ol className="mt-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="relative bg-bg px-4 py-3.5 last:col-span-2 sm:last:col-span-1"
          >
            <p className="text-sm font-semibold">{step.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">{step.note}</p>
            {index < STEPS.length - 1 && (
              <svg
                viewBox="0 0 12 12"
                aria-hidden
                className="absolute right-0 top-1/2 z-10 hidden size-3 -translate-y-1/2 translate-x-1/2 bg-bg text-muted sm:block"
              >
                <path d="M3 1.5 8 6l-5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs leading-5 text-muted">
        The review returns a critique and a revised program, which goes back through the validator
        and is drawn again, up to {MAX_REVIEWS} times.
      </p>

      <div className="mt-8 grid gap-8 text-sm leading-6 md:grid-cols-3">
        <div>
          <h3 className="font-semibold">A program, not pixels</h3>
          <p className="mt-1.5 text-muted">
            Claude never draws. It writes a short program in a geometry language: a generator, a
            symmetry group, and a flat list of numbers per layer. That is why the result has
            sliders, exports as clean vector paths, and can be sent to a pen plotter.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">It checks its own work</h3>
          <p className="mt-1.5 text-muted">
            Writing a pattern blind is hard, so the browser renders each program to a PNG and sends
            it back. Claude compares the image with the request, scores it, names what is off, and
            revises the program. The list of changes you see is a diff of the two programs, computed
            in code.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Code computes, the model reasons</h3>
          <p className="mt-1.5 text-muted">
            The symmetry maths, the rendering, and every safety check are deterministic and tested.
            The validator bounds each number and caps an artwork at{" "}
            {LIMITS.maxPaths.toLocaleString("en-US")} shapes before anything is drawn, so no
            program, from the model or from you, can freeze the tab.
          </p>
        </div>
      </div>
    </section>
  );
}
