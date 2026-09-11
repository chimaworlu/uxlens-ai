import { prisma } from "../../db/prisma.ts";
import { pruneAnalysisVersions, logAiCost } from "../../quota/checks.ts";
import { runPassA } from "./passA.ts";
import { runPassB } from "./passB.ts";
import { runPassC } from "./passC.ts";
import { runPassD } from "./passD.ts";
import type { InsightType } from "@prisma/client";

// PRD Section 6, Stage 4: orchestrates Pass A (map) -> B (cluster) -> C
// (citation verification, the hallucination firewall) -> D (summary),
// tracking progressStage as each pass starts so the UI's polling status
// endpoint can reflect it.
export type RunAnalysisResult = { verifiedCount: number; droppedCount: number };

// Returns Pass C's verified/dropped counts — ignored by the worker's own
// call site (worker/queues/analysis.ts), but needed by the golden eval
// runner (tests/eval/run-golden-set.ts) to compute the drop rate (M-3)
// without duplicating this orchestration logic.
export async function runAnalysis(analysisId: string): Promise<RunAnalysisResult> {
  const analysis = await prisma.analysis.findUniqueOrThrow({
    where: { id: analysisId },
    select: { id: true, projectId: true, project: { select: { userId: true } } },
  });

  const chunks = await prisma.documentChunk.findMany({
    where: { document: { projectId: analysis.projectId, status: "READY" } },
    select: { id: true, content: true, documentId: true },
  });
  const documentIdByChunkId = new Map(chunks.map((chunk) => [chunk.id, chunk.documentId]));

  // R-3: one running total across every AI call this run makes (Pass A's
  // several batches, Pass B, Pass D — Pass C makes none, it's verification
  // code, not AI), logged as a single UsageRecord once the run finishes
  // rather than one row per call.
  let totalCostUsd = 0;
  const onCost = (usd: number) => {
    totalCostUsd += usd;
  };

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "PROCESSING", progressStage: "extracting" },
  });
  const observations = await runPassA(chunks, onCost);

  await prisma.analysis.update({ where: { id: analysisId }, data: { progressStage: "synthesizing" } });
  const clustered = await runPassB(observations, onCost);

  await prisma.analysis.update({ where: { id: analysisId }, data: { progressStage: "citations" } });
  const { verified, droppedCount } = await runPassC(clustered);

  const summary = await runPassD(verified, onCost);
  await logAiCost(analysis.project.userId, totalCostUsd);

  const rankByType = new Map<InsightType, number>();

  await prisma.$transaction(async (tx) => {
    for (const insight of verified) {
      const rank = rankByType.get(insight.type) ?? 0;
      rankByType.set(insight.type, rank + 1);

      // "Mentioned in X of Y documents" (FR-17) counts distinct source
      // documents, not raw citation count — two quotes from the same file
      // shouldn't read as "2 documents".
      const distinctDocumentCount = new Set(
        insight.citations.map((citation) => documentIdByChunkId.get(citation.chunkId))
      ).size;

      const created = await tx.insight.create({
        data: {
          analysisId,
          type: insight.type,
          title: insight.title,
          description: insight.description,
          rank,
          evidenceCount: distinctDocumentCount,
        },
        select: { id: true },
      });

      await tx.citation.createMany({
        data: insight.citations.map((citation) => ({
          insightId: created.id,
          chunkId: citation.chunkId,
          quote: citation.quote,
          charStart: citation.charStart,
          charEnd: citation.charEnd,
        })),
      });
    }

    await tx.analysis.update({
      where: { id: analysisId },
      data: {
        status: "READY",
        executiveSummary: summary,
        completedAt: new Date(),
        progressStage: null,
      },
    });
  });

  await pruneAnalysisVersions(analysis.projectId);

  return { verifiedCount: verified.length, droppedCount };
}
