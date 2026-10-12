// Ported unchanged from lib/ai/cost.ts — pure arithmetic, no Node-specific
// APIs. Keep identical to the Next.js app's copy; see that file's header
// comment for where these per-token rates come from.
import type { AiProvider } from "./provider.ts";

const RATES_PER_MILLION_TOKENS: Record<AiProvider, { input: number; output: number }> = {
  deepseek: { input: 0.27, output: 1.1 },
  claude: { input: 3.0, output: 15.0 },
};

export function computeCostUsd(provider: AiProvider, inputTokens: number, outputTokens: number): number {
  const rate = RATES_PER_MILLION_TOKENS[provider];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}
