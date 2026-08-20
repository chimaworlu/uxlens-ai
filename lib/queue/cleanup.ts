import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.ts";

export const CLEANUP_QUEUE_NAME = "cleanup";

export type CleanupJob = { type: "delete-r2-object"; key: string };

// Producer side, used by API routes. AGENTS.md: BullMQ consumers only ever
// run in the separate worker process (worker/queues/cleanup.ts) — this
// file only ever adds jobs, never processes them.
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
