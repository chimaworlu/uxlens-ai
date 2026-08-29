// Standalone process, separate from the Next.js app (AGENTS.md: BullMQ
// consumers never run inside an API route). Run via `npm run worker`.
// Loads .env manually — Next.js does this automatically for its own
// process, but a plain `node worker/index.ts` process does not.
import "dotenv/config";
import { startEmailWorker } from "./queues/email.ts";
import { startCleanupWorker } from "./queues/cleanup.ts";
import { startDocProcessingWorker } from "./queues/doc-processing.ts";
import { startAnalysisWorker } from "./queues/analysis.ts";
import { scheduleBillingEnforcement, scheduleChatMessagePruning } from "../lib/queue/cleanup.ts";

const emailWorker = startEmailWorker();

emailWorker.on("completed", (job) => {
  console.log(`[worker] email job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[worker] email job ${job?.id ?? "?"} failed:`, err.message);
});

const cleanupWorker = startCleanupWorker();

cleanupWorker.on("completed", (job) => {
  console.log(`[worker] cleanup job ${job.id} completed`);
});

cleanupWorker.on("failed", (job, err) => {
  console.error(`[worker] cleanup job ${job?.id ?? "?"} failed:`, err.message);
});

const docProcessingWorker = startDocProcessingWorker();

docProcessingWorker.on("completed", (job) => {
  console.log(`[worker] doc-processing job ${job.id} completed`);
});

docProcessingWorker.on("failed", (job, err) => {
  console.error(`[worker] doc-processing job ${job?.id ?? "?"} failed:`, err.message);
});

const analysisWorker = startAnalysisWorker();

analysisWorker.on("completed", (job) => {
  console.log(`[worker] analysis job ${job.id} completed`);
});

analysisWorker.on("failed", (job, err) => {
  console.error(`[worker] analysis job ${job?.id ?? "?"} failed:`, err.message);
});

scheduleBillingEnforcement().catch((err) => {
  console.error("[worker] failed to schedule billing-enforcement:", err.message);
});

scheduleChatMessagePruning().catch((err) => {
  console.error("[worker] failed to schedule prune-deleted-chat-messages:", err.message);
});

console.log("[worker] started, listening for jobs on queues: email, cleanup, doc-processing, analysis");
