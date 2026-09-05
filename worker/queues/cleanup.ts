import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { CLEANUP_QUEUE_NAME, type CleanupJob } from "../../lib/queue/cleanup.ts";
import { deleteObject } from "../../lib/storage/r2.ts";
import { runBillingEnforcement } from "../../lib/billing/enforcement.ts";
import { pruneDeletedChatMessages } from "../../lib/pipeline/chat/prune.ts";
import { logger } from "../../lib/logger.ts";

export function startCleanupWorker(): Worker<CleanupJob> {
  return new Worker<CleanupJob>(
    CLEANUP_QUEUE_NAME,
    async (job: Job<CleanupJob>) => {
      if (job.data.type === "delete-r2-object") {
        await deleteObject(job.data.key);
      } else if (job.data.type === "billing-enforcement") {
        const { downgraded } = await runBillingEnforcement();
        logger.info({ event: "billing_enforcement_run", downgraded }, "Billing enforcement downgraded subscriptions.");
      } else if (job.data.type === "prune-deleted-chat-messages") {
        const { pruned } = await pruneDeletedChatMessages();
        logger.info({ event: "chat_prune_run", pruned }, "Pruned deleted chat messages.");
      }
    },
    { connection: getRedisConnection() }
  );
}
