import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { ANALYSIS_QUEUE_NAME, type AnalysisJob } from "../../lib/queue/analysis.ts";
import { runAnalysis } from "../../lib/pipeline/analysis/run.ts";
import { prisma } from "../../lib/db/prisma.ts";

// PRD Section 7: concurrency 2, matching the `analysis` queue's spec.
export function startAnalysisWorker(): Worker<AnalysisJob> {
  return new Worker<AnalysisJob>(
    ANALYSIS_QUEUE_NAME,
    async (job: Job<AnalysisJob>) => {
      try {
        await runAnalysis(job.data.analysisId);
      } catch (error) {
        await prisma.analysis.update({
          where: { id: job.data.analysisId },
          data: {
            status: "FAILED",
            progressStage: null,
            failureReason:
              error instanceof Error ? error.message : "Analysis failed unexpectedly.",
          },
        });
        throw error;
      }
    },
    { connection: getRedisConnection(), concurrency: 2 }
  );
}
