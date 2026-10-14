import type { ApiMeta } from "@/lib/api";
import { PRICING, formatUsd } from "@/lib/config";

const number = new Intl.NumberFormat("en-US");

/**
 * What the most recent action cost, in plain words: dollars first, then how
 * much text Claude read and wrote. Exact token counts (including cached
 * input) and the price source are in the tooltip. Pass `null` before the
 * first call.
 */
export function CostMeter({ meta, className = "" }: { meta: ApiMeta | null; className?: string }) {
  if (!meta || meta.model === "none") return null;

  if (meta.placeholder) {
    return (
      <p className={`text-xs leading-5 text-muted ${className}`}>
        Sample replay: no AI was called, so nothing was spent.
      </p>
    );
  }

  const { usage } = meta;
  const cached = usage.cache_read_input_tokens;
  const input = usage.input_tokens + usage.cache_creation_input_tokens + cached;
  const cost = formatUsd(meta.costUsd);
  const detail = [
    `${number.format(input)} tokens in (${number.format(cached)} cached)`,
    `${number.format(usage.output_tokens)} tokens out`,
    meta.model,
    `priced from ${PRICING.source} (verified ${PRICING.lastVerified})`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <p className={`text-xs leading-5 text-muted ${className}`} title={detail}>
      <span className="font-medium text-fg">
        {meta.mode === "live" ? `This run cost ${cost}.` : `Recorded run: it cost ${cost}.`}
      </span>{" "}
      Claude read {number.format(input)} and wrote {number.format(usage.output_tokens)} tokens (a
      token is a word or part of one).
    </p>
  );
}
