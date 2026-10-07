// Standalone process, separate from the Next.js app (AGENTS.md: BullMQ
// consumers never run inside an API route). Run via `npm run worker`.
// Loads .env manually — Next.js does this automatically for its own
// process, but a plain `node worker/index.ts` process does not.
import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";
import * as Sentry from "@sentry/node";

// Some hosts (confirmed on Railway) advertise IPv6 but can't actually route
// to it, so outbound connections to IPv6-first hosts (Gmail SMTP, Supabase's
// direct Postgres connection) fail with ENETUNREACH. Preferring IPv4
// resolution process-wide avoids that for every outbound connection this
// worker makes, not just one of them.
setDefaultResultOrder("ipv4first");
import { logger } from "../lib/logger.ts";
import { startEmailWorker } from "./queues/email.ts";
import { startCleanupWorker } from "./queues/cleanup.ts";
import { startDocProcessingWorker } from "./queues/doc-processing.ts";
import { startAnalysisWorker } from "./queues/analysis.ts";
import { scheduleBillingEnforcement, scheduleChatMessagePruning } from "../lib/queue/cleanup.ts";

// Separate init from the Next.js app's (sentry.server.config.ts) — this
// process never goes through Next's build or instrumentation.ts, since
// AGENTS.md requires BullMQ consumers to run as a standalone Node process,
// not inside an API route. Same env var and same no-op-on-empty-dsn
// behavior either way.
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.NODE_ENV });

const emailWorker = startEmailWorker();

emailWorker.on("completed", (job) => {
  logger.info({ queue: "email", jobId: job.id }, "Job completed.");
});

emailWorker.on("failed", (job, err) => {
  logger.error({ queue: "email", jobId: job?.id ?? "?", err: err.message }, "Job failed.");
  Sentry.captureException(err);
});

const cleanupWorker = startCleanupWorker();

cleanupWorker.on("completed", (job) => {
  logger.info({ queue: "cleanup", jobId: job.id }, "Job completed.");
});

cleanupWorker.on("failed", (job, err) => {
  logger.error({ queue: "cleanup", jobId: job?.id ?? "?", err: err.message }, "Job failed.");
  Sentry.captureException(err);
});

const docProcessingWorker = startDocProcessingWorker();

docProcessingWorker.on("completed", (job) => {
  logger.info({ queue: "doc-processing", jobId: job.id }, "Job completed.");
});

docProcessingWorker.on("failed", (job, err) => {
  logger.error({ queue: "doc-processing", jobId: job?.id ?? "?", err: err.message }, "Job failed.");
  Sentry.captureException(err);
});

const analysisWorker = startAnalysisWorker();

analysisWorker.on("completed", (job) => {
  logger.info({ queue: "analysis", jobId: job.id }, "Job completed.");
});

analysisWorker.on("failed", (job, err) => {
  logger.error({ queue: "analysis", jobId: job?.id ?? "?", err: err.message }, "Job failed.");
  Sentry.captureException(err);
});

scheduleBillingEnforcement().catch((err) => {
  logger.error({ event: "schedule_billing_enforcement_failed", err: err.message }, "Failed to schedule billing-enforcement.");
  Sentry.captureException(err);
});

scheduleChatMessagePruning().catch((err) => {
  logger.error(
    { event: "schedule_chat_pruning_failed", err: err.message },
    "Failed to schedule prune-deleted-chat-messages."
  );
  Sentry.captureException(err);
});

logger.info("Worker started, listening for jobs on queues: email, cleanup, doc-processing, analysis");

// Hosts (Railway, Render, Fly) send SIGTERM on every redeploy. close() waits for
// in-flight jobs to finish, so a long analysis run isn't cut off mid-pipeline.
async function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down workers.");
  await Promise.all([
    emailWorker.close(),
    cleanupWorker.close(),
    docProcessingWorker.close(),
    analysisWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
