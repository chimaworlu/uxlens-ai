import { z } from "zod";
import { completeText } from "../../lib/ai/provider.ts";
import { parseJsonWithSchema } from "../../lib/pipeline/analysis/json.ts";
import type { ExpectedInsight } from "./types.ts";

// Always DeepSeek regardless of which provider is under test for the
// pipeline itself — the judge needs to stay a fixed, independent measuring
// stick, not vary with the config being evaluated (retrieve.ts's keyword
// expansion makes the same "always deepseek" choice for the same reason).

const MatchSchema = z.object({
  matched: z.boolean(),
  matchedTitle: z.string().nullable(),
});

// R-10: scored for substance, not exact wording — a produced insight
// titled or worded completely differently from the expected description
// still counts as a match if it's the same underlying finding.
export async function matchInsight(
  expected: ExpectedInsight,
  produced: { title: string; description: string }[]
): Promise<{ matched: boolean; matchedTitle: string | null }> {
  if (produced.length === 0) return { matched: false, matchedTitle: null };

  const system = `You are grading a UX research analysis tool against one known-correct expected finding. Given the expected finding and a list of insights the tool actually produced, decide whether ANY produced insight captures the same underlying finding — different wording, a different title, or a different phrasing is fine, as long as the core substance matches. Respond with ONLY JSON: {"matched": boolean, "matchedTitle": string|null (the title of the matching produced insight, or null if none matched)}.`;
  const user = `Expected finding (${expected.type}): ${expected.description}\n\nProduced insights:\n${produced
    .map((insight) => `- ${insight.title}: ${insight.description}`)
    .join("\n")}`;

  const raw = await completeText({ system, user, maxOutputTokens: 150, provider: "deepseek" });
  const result = parseJsonWithSchema(raw, MatchSchema);
  if (!result.success) return { matched: false, matchedTitle: null };
  return result.data;
}

const ChatScoreSchema = z.object({
  verdict: z.enum(["correct_refusal", "correct_grounded", "fabrication", "incorrect_refusal"]),
  reasoning: z.string(),
});

// FR-30 / M-5: the zero-fabrication bar. "fabrication" covers both a
// confident answer where a refusal was expected, and a grounded-looking
// answer with no real citation backing it.
export async function scoreChatAnswer(
  question: string,
  expectation: "refusal" | "grounded",
  answerText: string,
  hasCitations: boolean
): Promise<{ verdict: string; reasoning: string }> {
  const system = `You are grading a grounded UX-research chat assistant's answer against an expected behavior.

Expected behavior for this question: ${
    expectation === "refusal"
      ? "REFUSAL — the research does not cover this topic, so a correct answer says so rather than answering it."
      : "GROUNDED ANSWER — the research does cover this topic, so a correct answer addresses it, backed by real citations."
  }

Decide the actual verdict:
- "correct_refusal": the assistant correctly said the research doesn't cover this, and a refusal was expected.
- "correct_grounded": the assistant gave a real, on-topic, cited answer, and a grounded answer was expected.
- "fabrication": the assistant answered as if grounded when a refusal was expected (it invented or overreached beyond what the research supports), or gave an answer with no real citation backing when one was expected.
- "incorrect_refusal": the assistant refused when a grounded answer was expected (it should have answered but didn't).

Respond with ONLY JSON: {"verdict": "correct_refusal"|"correct_grounded"|"fabrication"|"incorrect_refusal", "reasoning": string}.`;
  const user = `Question: ${question}\n\nAssistant's answer: ${answerText}\n\nAnswer included at least one citation: ${hasCitations}`;

  const raw = await completeText({ system, user, maxOutputTokens: 150, provider: "deepseek" });
  const result = parseJsonWithSchema(raw, ChatScoreSchema);
  if (!result.success) {
    return {
      verdict: "fabrication",
      reasoning: "Judge response failed to parse; scored conservatively as a failure.",
    };
  }
  return result.data;
}
