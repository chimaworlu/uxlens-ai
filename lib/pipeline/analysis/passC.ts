import { prisma } from "../../db/prisma.ts";
import type { ClusteredInsight } from "./schemas.ts";

// PRD Section 6, step 9 — the hallucination firewall (FR-19). Pure code,
// no AI: every claimed quote must be locatable in its real source chunk.
const FUZZY_MATCH_THRESHOLD = 0.9;

export type VerifiedCitation = { chunkId: string; quote: string; charStart: number; charEnd: number };
export type VerifiedInsight = Omit<ClusteredInsight, "citations"> & { citations: VerifiedCitation[] };

export async function runPassC(
  insights: ClusteredInsight[]
): Promise<{ verified: VerifiedInsight[]; droppedCount: number }> {
  const chunkIds = [...new Set(insights.flatMap((insight) => insight.citations.map((c) => c.chunkId)))];
  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: chunkIds } },
    select: { id: true, content: true },
  });
  const contentById = new Map(chunks.map((chunk) => [chunk.id, chunk.content]));

  const verified: VerifiedInsight[] = [];
  let droppedCount = 0;

  for (const insight of insights) {
    const verifiedCitations: VerifiedCitation[] = [];

    for (const citation of insight.citations) {
      const content = contentById.get(citation.chunkId);
      if (!content) continue;

      const match = locateQuote(content, citation.quote);
      if (match) {
        verifiedCitations.push({
          chunkId: citation.chunkId,
          quote: citation.quote,
          charStart: match.start,
          charEnd: match.end,
        });
      }
    }

    // An insight whose every quote fails matching is dropped and logged —
    // one that has at least one verified citation is kept, with only the
    // unverifiable citations pruned.
    if (verifiedCitations.length === 0) {
      droppedCount++;
      console.warn(
        JSON.stringify({
          event: "citation_drop",
          insightTitle: insight.title,
          insightType: insight.type,
          reason: "no citation verified against source text",
        })
      );
      continue;
    }

    verified.push({ ...insight, citations: verifiedCitations });
  }

  return { verified, droppedCount };
}

function locateQuote(content: string, quote: string): { start: number; end: number } | null {
  const exactIdx = content.indexOf(quote);
  if (exactIdx !== -1) return { start: exactIdx, end: exactIdx + quote.length };

  const normalizedMatch = locateNormalized(content, quote);
  if (normalizedMatch) return normalizedMatch;

  return locateFuzzy(content, quote);
}

// Case/whitespace-insensitive match: rebuild the quote as a regex with
// collapsible whitespace so real offsets come straight from the match.
function locateNormalized(content: string, quote: string): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = content.match(new RegExp(pattern, "i"));
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length };
}

// Slide a window the size of the quote across the content, scoring each by
// Levenshtein similarity, and accept the best one if it clears the
// threshold — catches near-verbatim quotes with a stray typo or
// re-punctuation the model introduced.
function locateFuzzy(content: string, quote: string): { start: number; end: number } | null {
  const windowSize = quote.length;
  if (windowSize === 0 || windowSize > content.length) return null;

  const step = Math.max(1, Math.floor(windowSize / 8));
  let bestRatio = 0;
  let bestStart = -1;

  for (let start = 0; start <= content.length - windowSize; start += step) {
    const ratio = similarityRatio(content.slice(start, start + windowSize), quote);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestStart = start;
    }
  }

  if (bestRatio >= FUZZY_MATCH_THRESHOLD && bestStart !== -1) {
    return { start: bestStart, end: bestStart + windowSize };
  }
  return null;
}

function similarityRatio(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const cols = b.length + 1;
  const dist = new Array(cols);
  for (let j = 0; j < cols; j++) dist[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dist[0];
    dist[0] = i;
    for (let j = 1; j < cols; j++) {
      const temp = dist[j];
      dist[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dist[j], dist[j - 1]);
      prevDiag = temp;
    }
  }
  return dist[cols - 1];
}
