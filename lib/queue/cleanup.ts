import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.ts";

export const CLEANUP_QUEUE_NAME = "cleanup";

export type CleanupJob =
  | { type: "delete-r2-object"; key: string }
  | { type: "billing-enforcement" }
  | { type: "prune-deleted-chat-messages" };

// Producer side, used by API routes (and, for the repeatable job below,
// by worker startup). AGENTS.md: BullMQ consumers only ever run in the
// separate worker process (worker/queues/cleanup.ts) — this file only
// ever adds jobs, never processes them.
//
// .agent/rules/uploads-and-storage.md: R2 cleanup on document/project
// deletion happens via this queue, never synchronously in the request path
// — the DELETE route returns as soon as the database row is gone, and this
// job removes the R2 object independently.
export const cleanupQueue = new Queue<CleanupJob>(CLEANUP_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export async function enqueueR2Cleanup(key: string): Promise<void> {
  const job: CleanupJob = { type: "delete-r2-object", key };
  await cleanupQueue.add("delete-r2-object", job);
}

// AGENTS.md rule 12 / FR-34: the grace period only means something if this
// actually runs daily. BullMQ upserts a repeatable job by its (name,
// repeat pattern) pair, so calling this again on every worker restart is
// safe — it doesn't create duplicate schedules. 03:00 UTC: off the peak
// usage hours this product's Nigeria-based users would be active in.
export async function scheduleBillingEnforcement(): Promise<void> {
  const job: CleanupJob = { type: "billing-enforcement" };
  await cleanupQueue.add("billing-enforcement", job, {
    repeat: { pattern: "0 3 * * *" },
    jobId: "billing-enforcement-daily",
  });
}

// FR-32: same upsert-by-(name, repeat pattern) safety as
// scheduleBillingEnforcement above — calling this again on every worker
// restart doesn't create duplicate schedules.
export async function scheduleChatMessagePruning(): Promise<void> {
  const job: CleanupJob = { type: "prune-deleted-chat-messages" };
  await cleanupQueue.add("prune-deleted-chat-messages", job, {
    repeat: { pattern: "0 3 * * *" },
    jobId: "prune-deleted-chat-messages-daily",
  });
}
