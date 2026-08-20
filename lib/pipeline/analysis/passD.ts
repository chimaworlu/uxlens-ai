import { completeText, synthesisProvider } from "../../ai/provider.ts";
import { stripEmDash } from "./text.ts";
import type { VerifiedInsight } from "./passC.ts";

const MAX_OUTPUT_TOKENS = 500;

const SYSTEM_PROMPT = `Write a concise executive summary (3-5 sentences, plain prose, no markdown headers) of this UX research analysis, based ONLY on the verified insights provided below. Do not reference anything outside them. Never use em-dashes (—) or en-dashes (–) anywhere in the summary; use commas, parentheses, or separate sentences instead.`;

// PRD Section 6, step 10: summary generated from the verified insight set
// only, so it can never reference content Pass C dropped.
export async function runPassD(insights: VerifiedInsight[]): Promise<string> {
  const provider = synthesisProvider();
  const user = insights.map((insight) => `[${insight.type}] ${insight.title}: ${insight.description}`).join("\n");

  const summary = await completeText({
    system: SYSTEM_PROMPT,
    user,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider,
  });
  return stripEmDash(summary.trim());
}
