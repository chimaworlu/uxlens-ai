import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { CLEANUP_QUEUE_NAME, type CleanupJob } from "../../lib/queue/cleanup.ts";
import { deleteObject } from "../../lib/storage/r2.ts";

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
