// Standalone process, separate from the Next.js app (AGENTS.md: BullMQ
// consumers never run inside an API route). Run via `npm run worker`.
// Loads .env manually — Next.js does this automatically for its own
// process, but a plain `node worker/index.ts` process does not.
import "dotenv/config";
import { startEmailWorker } from "./queues/email.ts";

const emailWorker = startEmailWorker();

emailWorker.on("completed", (job) => {
  console.log(`[worker] email job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[worker] email job ${job?.id ?? "?"} failed:`, err.message);
});

console.log("[worker] started, listening for jobs on queue: email");
