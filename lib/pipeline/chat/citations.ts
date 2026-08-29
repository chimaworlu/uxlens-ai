import { locateQuote } from "../citation-match.ts";

// PRD Section 6, Stage 5, step 14: the model cites chunks inline as
// [c:chunkId] — a chunk-level reference, not a verbatim quote the way Pass
// A's extraction is. To still highlight something concrete in the citation
// panel (FR-28: "identical to the insights view"), each token's claim text
// is located in the chunk's real content via the same match cascade Pass C
// uses (citation-match.ts) — exact, then normalized, then fuzzy. The claim
// text is normally the <q>...</q> verbatim anchor the prompt asks the model
// to place right before the token (respond.ts) — real source wording, so
// the matcher actually finds it, unlike the model's own paraphrased
// sentence. If a token arrives without one (model skipped it, or an older
// turn from before this existed), fall back to the heuristic claim-span-
// before-the-token approach, which works sometimes but not reliably once
// the answer is synthesized rather than quoted. A claim that still can't be
// located keeps its chunk reference (chat isn't gated by the same
// hallucination firewall Pass C is — dropping the whole answer over one
// unmatched sentence would be too aggressive), just with an empty
// highlighted span.
// Tolerant of the model tacking on extra text before the closing bracket
// (e.g. "[c:chunkId Row 14]" on CSV-sourced chunks, trying to be more
// specific than asked) — only the chunk id itself is captured; anything
// else inside the brackets is discarded along with the token.
//
// One pattern, two alternatives, matched in document order: a <q> anchor
// (group 1) or a citation token (group 2). The prompt asks for the anchor
// immediately before its token, but the model doesn't always honor that —
// it sometimes finishes its own sentence in between (e.g. "<q>Nothing</q>
// was frustrating... [c:id]"). Matching both kinds in one left-to-right
// pass and carrying the most recent unconsumed anchor forward (see
// pendingAnchor below) handles that gap without requiring adjacency, and
// guarantees every <q> tag gets stripped from the visible text regardless
// of whether a token ever claims it.
const TOKEN_OR_ANCHOR = /<q>([\s\S]*?)<\/q>|\[c:([a-zA-Z0-9]+)[^\]]*\]/g;
const MAX_CLAIM_CHARS = 300;

function claimSpanBefore(text: string, tokenStart: number, previousTokenEnd: number): string {
  const spanStart = Math.max(previousTokenEnd, tokenStart - MAX_CLAIM_CHARS);
  const span = text.slice(spanStart, tokenStart);
  // Prefer just the last sentence of the span when it covers more than
  // one — the citation almost always supports the sentence right before
  // it, not everything since the last token.
  const sentences = span.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences.at(-1) ?? span).trim();
}

export type ExtractedCitation = { chunkId: string; quote: string; charStart: number; charEnd: number };
export type ExtractedCitations = { cleanedText: string; citations: ExtractedCitation[] };

export function extractCitations(rawText: string, chunkContentById: Map<string, string>): ExtractedCitations {
  const citations: ExtractedCitation[] = [];
  const dropped: string[] = [];
  let previousTokenEnd = 0;
  let pendingAnchor: string | null = null;
  let cleanedText = "";
  let cursor = 0;

  for (const match of rawText.matchAll(TOKEN_OR_ANCHOR)) {
    const matchStart = match.index;
    cleanedText += rawText.slice(cursor, matchStart);
    cursor = matchStart + match[0].length;

    const anchorText = match[1];
    if (anchorText !== undefined) {
      // Last unconsumed anchor wins if the model emits more than one
      // before the token actually shows up — the one right before the
      // citation is the one that's meant for it.
      pendingAnchor = anchorText.trim() || null;
      continue;
    }

    const chunkId = match[2];
    if (chunkId === undefined) continue;
    const content = chunkContentById.get(chunkId);
    const anchorQuote = pendingAnchor;
    pendingAnchor = null;

    if (!content) {
      dropped.push(chunkId);
      previousTokenEnd = matchStart;
      continue;
    }

    const claim = anchorQuote || claimSpanBefore(rawText, matchStart, previousTokenEnd);
    const located = claim.length > 0 ? locateQuote(content, claim) : null;
    citations.push({
      chunkId,
      quote: located ? claim : "",
      charStart: located?.start ?? 0,
      charEnd: located?.end ?? 0,
    });
    previousTokenEnd = matchStart;
  }
  cleanedText += rawText.slice(cursor);

  if (dropped.length > 0) {
    console.warn(JSON.stringify({ event: "chat_citation_drop", chunkIds: dropped }));
  }

  return { cleanedText: cleanedText.replace(/[ \t]+/g, " ").trim(), citations };
}
