import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.ts";

export const DOC_PROCESSING_QUEUE_NAME = "doc-processing";

export type DocProcessingJob = { documentId: string };

// Producer side, used by API routes. AGENTS.md: BullMQ consumers only ever
// run in the separate worker process (worker/queues/doc-processing.ts) —
// this file only ever adds jobs, never processes them.
export const docProcessingQueue = new Queue<DocProcessingJob>(DOC_PROCESSING_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export async function enqueueDocumentProcessing(documentId: string): Promise<void> {
  await docProcessingQueue.add("extract-text", { documentId });
}
