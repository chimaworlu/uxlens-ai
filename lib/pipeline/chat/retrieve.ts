import { prisma } from "../../db/prisma.ts";
import { completeText } from "../../ai/provider.ts";
import { estimateTokens } from "../../ai/tokens.ts";
import { parseJsonWithSchema } from "../analysis/json.ts";
import { KeywordVariantsSchema } from "./schemas.ts";

// PRD Section 6, Stage 5, step 12: typical projects fit entirely in
// context, which is the strongest possible grounding — search is a
// fallback for the minority of projects too large for that, not the
// default path.
const FULL_SEND_TOKEN_BUDGET = 100_000;
const SEARCH_RESULTS_PER_VARIANT = 8;
const TOP_CHUNKS_AFTER_MERGE = 8;

export type ChatChunk = {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
};

export type ChatContext = {
  chunks: ChatChunk[];
  usedSearch: boolean;
};

async function expandKeywords(question: string): Promise<string[]> {
  const system =
    'Rewrite the user\'s question into 3-5 short keyword search variants suitable for full-text search (single words or short phrases, not full sentences). Respond with ONLY JSON: {"variants": ["...", ...]}, nothing else.';

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await completeText({
      system,
      user: attempt === 0 ? question : `${question}\n\nYour previous response was invalid JSON. Respond with ONLY the JSON object.`,
      maxOutputTokens: 200,
      provider: "deepseek",
    });
    const result = parseJsonWithSchema(raw, KeywordVariantsSchema);
    if (result.success) return result.data.variants;
  }

  // Both attempts failed — fall back to the raw question itself rather
  // than failing the whole chat turn over a best-effort search-expansion
  // step.
  return [question];
}

type RawSearchRow = {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  rank: number;
};

async function searchChunks(projectId: string, variants: string[]): Promise<ChatChunk[]> {
  const best = new Map<string, RawSearchRow>();

  for (const variant of variants) {
    const rows = await prisma.$queryRaw<RawSearchRow[]>`
      SELECT dc.id, dc.content, dc."documentId", d.filename, dc."pageNumber",
             ts_rank(dc."searchVector", websearch_to_tsquery('english', ${variant})) AS rank
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."projectId" = ${projectId} AND d.status = 'READY'
        AND dc."searchVector" @@ websearch_to_tsquery('english', ${variant})
      ORDER BY rank DESC
      LIMIT ${SEARCH_RESULTS_PER_VARIANT}
    `;
    for (const row of rows) {
      const existing = best.get(row.id);
      if (!existing || row.rank > existing.rank) best.set(row.id, row);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, TOP_CHUNKS_AFTER_MERGE)
    .map((row) => ({
      id: row.id,
      content: row.content,
      documentId: row.documentId,
      filename: row.filename,
      pageNumber: row.pageNumber,
    }));
}

// PRD Section 6, Stage 5. FR-30's refusal path is triggered by the caller
// when usedSearch is true and chunks comes back empty — that's the "zero
// chunks matched any keyword variant" case, not something this function
// itself needs to special-case.
export async function buildChatContext(projectId: string, question: string): Promise<ChatContext> {
  const allChunks = await prisma.documentChunk.findMany({
    where: { document: { projectId, status: "READY" } },
    select: {
      id: true,
      content: true,
      documentId: true,
      pageNumber: true,
      document: { select: { filename: true } },
    },
  });

  const totalTokens = allChunks.reduce((sum, chunk) => sum + estimateTokens(chunk.content), 0);

  if (totalTokens <= FULL_SEND_TOKEN_BUDGET) {
    return {
      usedSearch: false,
      chunks: allChunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        documentId: chunk.documentId,
        filename: chunk.document.filename,
        pageNumber: chunk.pageNumber,
      })),
    };
  }

  const variants = await expandKeywords(question);
  const chunks = await searchChunks(projectId, variants);
  return { usedSearch: true, chunks };
}
