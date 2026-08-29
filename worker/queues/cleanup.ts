import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { CLEANUP_QUEUE_NAME, type CleanupJob } from "../../lib/queue/cleanup.ts";
import { deleteObject } from "../../lib/storage/r2.ts";
import { runBillingEnforcement } from "../../lib/billing/enforcement.ts";
import { pruneDeletedChatMessages } from "../../lib/pipeline/chat/prune.ts";

export function startCleanupWorker(): Worker<CleanupJob> {
  return new Worker<CleanupJob>(
    CLEANUP_QUEUE_NAME,
    async (job: Job<CleanupJob>) => {
      if (job.data.type === "delete-r2-object") {
        await deleteObject(job.data.key);
      } else if (job.data.type === "billing-enforcement") {
        const { downgraded } = await runBillingEnforcement();
        console.log(`[worker] billing-enforcement downgraded ${downgraded} subscription(s)`);
      } else if (job.data.type === "prune-deleted-chat-messages") {
        const { pruned } = await pruneDeletedChatMessages();
        console.log(`[worker] prune-deleted-chat-messages hard-deleted ${pruned} message(s)`);
      }
    },
    { connection: getRedisConnection() }
  );
}
