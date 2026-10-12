import { sendToQueue } from "./pgmq.ts";

// Phase 3 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
// Section 2): this queue's consumer is now supabase/functions/doc-processing
// (an Edge Function), not worker/queues/doc-processing.ts — that file and
// its BullMQ registration in worker/index.ts are now dead code, left in
// place until the full cutover (Phase 6) rather than deleted mid-migration.
const EDGE_FUNCTION_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/doc-processing";

export async function enqueueDocumentProcessing(documentId: string): Promise<void> {
  await sendToQueue("doc_processing", { documentId });

  // Direct trigger for near-instant pickup, matching BullMQ's old
  // fire-and-forget enqueue latency — intentionally not awaited, so this
  // function (and the confirm route that calls it) returns immediately
  // rather than waiting out the whole extraction job. The pg_cron
  // backup poller (migration 20261012143136_doc_processing_cron_poller)
  // picks up anything this misses, e.g. the function already busy with
  // another invocation.
  fetch(EDGE_FUNCTION_URL, { method: "POST" }).catch(() => {});
}
