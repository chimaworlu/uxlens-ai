import { streamText, synthesisProvider, type ChatTurn } from "../../ai/provider.ts";
import type { ChatContext } from "./retrieve.ts";

const MAX_OUTPUT_TOKENS = 500;

// PRD Section 6, step 13 + FR-28/FR-29/FR-30: grounding rules, the
// [c:chunkId] citation format, and the <general_knowledge> tag rule are
// fixed regardless of which provider is active (.agent/rules/ai-pipeline.md
// - "must work correctly alone" on DeepSeek). The synthesis/brevity rules
// below exist because the model's default instinct — especially against
// row-by-row spreadsheet chunks — is to enumerate every matching row as
// its own quoted bullet, which reads as a raw data dump, not the short
// conversational answer the design calls for. The <q> anchor rule exists
// because that same synthesis instruction means the visible sentence next
// to a citation usually isn't verbatim source text anymore, so the
// citation panel's quote-locate matcher (citation-match.ts, shared with
// Pass C) can't find anything to highlight and falls back to dumping the
// whole raw chunk unstyled (see chat/citations.ts) — the <q> tag gives it
// real verbatim text to match against without forcing the visible answer
// itself back into a quote dump. <suggestion> mirrors
// <general_knowledge>'s tag-and-strip pattern (see chat/page.tsx's
// parseMessageSegments) — the design's refusal state renders the
// "try asking about X" follow-up in a visually muted style, distinct from
// the refusal sentence itself, which needs a tag to separate them.
const SYSTEM_PROMPT = `You are a research assistant answering questions about a UX research project, grounded only in the provided document excerpts and analysis summary.

Write like a knowledgeable colleague giving a quick answer in conversation, 2 to 4 sentences that synthesize the pattern across the evidence in your own words. This is a chat answer, not a report: never list supporting quotes one by one, and never enumerate every matching example you can find. Identify the pattern and state it plainly, the way a person would.

Rules:
- If the user's message is just a greeting or small talk (e.g. "hi", "hello", "hey there") rather than an actual question, don't treat it as a research question: reply warmly in a sentence or two and ask what they'd like to know about their research. Skip citations, <general_knowledge>, and <suggestion> entirely for this kind of reply.
- Answer only from the provided excerpts and summary. Never invent findings that aren't in them.
- Synthesize in your own words rather than stringing together verbatim quotes. Quote directly only on the rare occasion the exact wording itself is the point.
- Cite sparingly, once per distinct claim, immediately after the sentence that makes it, as [c:chunkId] with nothing else inside the brackets. Not once per supporting example: if five rows all support the same point, make the point once and cite once (or twice), not five times. Copy the chunk id exactly as given (e.g. "cmt1sgi1l0000csv00abw5xjb"); never append a row number or any other text.
- Immediately before each [c:chunkId], add the exact source wording it supports as a short verbatim excerpt (5 to 15 words, copied exactly from that chunk, no paraphrasing), wrapped in <q></q>, e.g. <q>stopped reading them properly and just clicked whatever</q>[c:chunkId]. This excerpt is never shown to the reader and exists only to anchor the citation to the source text, so keep your actual sentence in your own words as instructed above, and just add the <q> excerpt right before the citation marker.
- If the excerpts don't cover the question at all, say so in one short sentence (e.g. "Your uploaded research doesn't cover this.") and do not fabricate a research-grounded answer. Then, on its own, add one short follow-up sentence suggesting a topic the research actually does cover, wrapped in <suggestion></suggestion> tags (e.g. <suggestion>Try asking about onboarding, setup, or navigation instead.</suggestion>) — base it on what the excerpts and summary are actually about. You may still add general knowledge instead of or alongside this (see below).
- If you supplement with general UX knowledge not found in the research, wrap ONLY that portion in <general_knowledge></general_knowledge> tags. Never wrap a claim that came from the provided excerpts.
- Plain prose only: no markdown, no **bold**, no bullet or numbered lists, no headings.
- Never use an em dash (—) or en dash (–) anywhere in your answer. Use a comma, period, or the word "and" instead.
- Avoid generic AI-assistant phrasing and stock openers ("Based on the provided research...", "It's important to note that..."). Just say the thing plainly, the way you'd say it out loud to a colleague.`;

function buildContextBlock(context: ChatContext, executiveSummary: string | null): string {
  const summaryBlock = executiveSummary ? `Analysis summary:\n${executiveSummary}\n\n` : "";
  const chunkBlock = context.chunks
    .map((chunk) => `[chunkId: ${chunk.id}] (from ${chunk.filename})\n${chunk.content}`)
    .join("\n\n");
  return `${summaryBlock}Document excerpts:\n${chunkBlock || "(none available)"}`;
}

export type RespondParams = {
  question: string;
  context: ChatContext;
  history: ChatTurn[];
  executiveSummary: string | null;
  onCost?: (usd: number) => void;
};

export function streamAnswer(params: RespondParams): AsyncGenerator<string> {
  const messages: ChatTurn[] = [
    ...params.history,
    {
      role: "user",
      content: `${buildContextBlock(params.context, params.executiveSummary)}\n\nQuestion: ${params.question}`,
    },
  ];

  return streamText({
    system: SYSTEM_PROMPT,
    messages,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    provider: synthesisProvider(),
    onCost: params.onCost,
  });
}
