import { prisma } from "../../db/prisma.ts";
import { logger } from "../../logger.ts";
import { locateQuote } from "../citation-match.ts";
import type { ClusteredInsight } from "./schemas.ts";

// PRD Section 6, step 9 — the hallucination firewall (FR-19). Pure code,
// no AI: every claimed quote must be locatable in its real source chunk.

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
      logger.warn(
        {
          event: "citation_drop",
          insightTitle: insight.title,
          insightType: insight.type,
          reason: "no citation verified against source text",
        },
        "Insight dropped: no citation verified against source text."
      );
      continue;
    }

    verified.push({ ...insight, citations: verifiedCitations });
  }

  return { verified, droppedCount };
}
