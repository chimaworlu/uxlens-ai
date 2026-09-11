import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.ts";

export const ANALYSIS_QUEUE_NAME = "analysis";

export type AnalysisJob = { analysisId: string; projectId: string };

// Producer side, used by API routes. AGENTS.md: BullMQ consumers only ever
// run in the separate worker process (worker/queues/analysis.ts) — this
// file only ever adds jobs, never processes them.
//
// PRD Section 7: attempts 2. The queue's "concurrency 2" and "per-project
// lock" live on the consumer side and the enqueue route respectively —
// the lock is enforced there by checking for an existing QUEUED/PROCESSING
// Analysis row before creating a new one, not by anything in this file.
export const analysisQueue = new Queue<AnalysisJob>(ANALYSIS_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
  },
});

export async function enqueueAnalysis(analysisId: string, projectId: string): Promise<void> {
  await analysisQueue.add("run-analysis", { analysisId, projectId });
}
