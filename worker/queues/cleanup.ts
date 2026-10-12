import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { CLEANUP_QUEUE_NAME, type CleanupJob } from "../../lib/queue/cleanup.ts";
import { deleteObject } from "../../lib/storage/r2.ts";

// Phase 5 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
// Section 2): billing-enforcement and prune-deleted-chat-messages moved to
// pg_cron-scheduled SQL functions (migration 20261012170000) — this worker
// now only handles R2 object deletion, which still needs a general-purpose
// runtime for the S3 SDK (planned to become its own Edge Function next,
// same as doc-processing/analysis, which will let this file be deleted
// entirely).
export function startCleanupWorker(): Worker<CleanupJob> {
  return new Worker<CleanupJob>(
    CLEANUP_QUEUE_NAME,
    async (job: Job<CleanupJob>) => {
      if (job.data.type === "delete-r2-object") {
        await deleteObject(job.data.key);
      }
    },
    { connection: getRedisConnection() }
  );
}
