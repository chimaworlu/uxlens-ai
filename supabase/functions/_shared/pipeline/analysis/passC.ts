// Ported from lib/pipeline/analysis/passC.ts for the Deno Edge Function
// runtime — PRD Section 6, step 9, the hallucination firewall (FR-19).
// Pure code, no AI. One real difference from the Next.js copy: chunk
// content is passed in as a Map instead of being fetched here via Prisma,
// since this function has no DB client of its own (the calling Edge
// Function, analysis-pass-c/index.ts, fetches chunks via the shared pg
// client and builds the map) — keeps this file pure like the original,
// just with the DB read moved to the caller. Verification logic itself is
// unchanged; mirror any change here in the Next.js copy too.
import { locateQuote } from "../citation-match.ts";
import type { ClusteredInsight } from "./schemas.ts";

export type VerifiedCitation = { chunkId: string; quote: string; charStart: number; charEnd: number };
export type VerifiedInsight = Omit<ClusteredInsight, "citations"> & { citations: VerifiedCitation[] };

export function runPassC(
  insights: ClusteredInsight[],
  chunkContentById: Map<string, string>
): { verified: VerifiedInsight[]; droppedCount: number } {
  const verified: VerifiedInsight[] = [];
  let droppedCount = 0;

  for (const insight of insights) {
    const verifiedCitations: VerifiedCitation[] = [];

    for (const citation of insight.citations) {
      const content = chunkContentById.get(citation.chunkId);
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
