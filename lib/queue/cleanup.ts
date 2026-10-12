import { sendToQueue } from "./pgmq.ts";

// Phase 5 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
// Section 2): this queue's consumer is now supabase/functions/cleanup (an
// Edge Function), not worker/queues/cleanup.ts, which is now deleted —
// billing-enforcement and prune-deleted-chat-messages already moved to
// pg_cron SQL functions (migration 20261012170000), and delete-r2-object
// was the only job type left on this queue.
const CLEANUP_EDGE_FUNCTION_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/cleanup";

// .agent/rules/uploads-and-storage.md: R2 cleanup on document/project
// deletion happens via this queue, never synchronously in the request path
// — the DELETE route returns as soon as the database row is gone, and this
// job removes the R2 object independently.
export async function enqueueR2Cleanup(key: string): Promise<void> {
  await sendToQueue("cleanup", { type: "delete-r2-object", key });

  // Direct trigger for near-instant pickup, same fire-and-forget pattern
  // as doc-processing/analysis — not awaited, so the caller (a document or
  // project DELETE route) returns immediately. The pg_cron backup poller
  // (migration 20261012170500) picks up anything this misses.
  fetch(CLEANUP_EDGE_FUNCTION_URL, { method: "POST" }).catch(() => {});
}
