import type { AiProvider } from "./provider.ts";

// R-3's per-user daily AI spend ceiling (lib/quota/checks.ts) needs an
// actual dollar figure per call, not just a token count. These rates are
// reverse-derived from the PRD's own worked examples (Section 6, "Cost
// budget per full analysis") rather than copied from a pricing page, and
// they reproduce those examples almost exactly:
//   DeepSeek Pass A: ~45k in / 8k out ~= $0.02
//     -> 45000/1e6 * 0.27 + 8000/1e6 * 1.10 = $0.021
//   Claude Pass B+D: ~15k in / 4k out ~= $0.11
//     -> 15000/1e6 * 3.00 + 4000/1e6 * 15.00 = $0.105
// This is a safety-net ceiling, not exact invoice reconciliation, so a
// documented approximation is enough — revisit alongside R-8's quarterly
// price review if either provider's published per-token pricing changes.
const RATES_PER_MILLION_TOKENS: Record<AiProvider, { input: number; output: number }> = {
  deepseek: { input: 0.27, output: 1.1 },
  claude: { input: 3.0, output: 15.0 },
};

export function computeCostUsd(provider: AiProvider, inputTokens: number, outputTokens: number): number {
  const rate = RATES_PER_MILLION_TOKENS[provider];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}
