import { prisma } from "../db/prisma.ts";
import { sendToQueue } from "./pgmq.ts";
import { batchChunks } from "../pipeline/analysis/passA.ts";

// Phase 4 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
// Section 2): this queue's consumer is a chain of four Edge Functions
// (supabase/functions/analysis-pass-{a,b,c,d}). The old BullMQ consumer
// (worker/queues/analysis.ts) and the Railway worker process itself are
// deleted (Phase 6). lib/pipeline/analysis/run.ts and its passA-D.ts are
// NOT dead code despite no longer running in production:
// tests/eval/run-golden-set.ts still calls runAnalysis directly as the
// quality-eval harness (M-3 drop rate), so they stay as the reference
// implementation.
const ANALYSIS_PASS_A_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-a";

export async function enqueueAnalysis(analysisId: string, projectId: string): Promise<void> {
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { projectId, status: "READY" } },
    select: { id: true, content: true },
  });
  const batches = batchChunks(chunks);

  // Defensive only: the route's MIN_INPUT_WORDS check already rejects
  // near-empty projects before this is ever called, and a READY document
  // always has chunks by the time doc-processing marks it READY. Guards
  // against an analysis silently stuck at QUEUED forever if that
  // invariant is ever violated.
  if (batches.length === 0) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED", failureReason: "No processed content available to analyze." },
    });
    return;
  }

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "PROCESSING", progressStage: "extracting", passATotalBatches: batches.length },
  });

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    await sendToQueue("analysis", {
      analysisId,
      projectId,
      batchIndex,
      chunkIds: batches[batchIndex]!.map((chunk) => chunk.id),
    });

    // Direct trigger per batch, same fire-and-forget pattern as
    // doc-processing's enqueueDocumentProcessing — lets all N batches
    // start near-instantly as concurrent invocations instead of waiting
    // on the once-a-minute backup poller.
    fetch(ANALYSIS_PASS_A_URL, { method: "POST" }).catch(() => {});
  }
}
