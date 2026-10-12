// Ports worker/queues/cleanup.ts's delete-r2-object handling to an Edge
// Function consumer of the pgmq "cleanup" queue (Phase 5 of the BullMQ ->
// Supabase Edge Functions migration, AGENTS.md Section 2) — the last job
// type that queue carried. billing-enforcement and
// prune-deleted-chat-messages already moved to pg_cron SQL functions
// (migration 20261012170000); this function needs a general-purpose
// runtime only because deleting an R2 object means the S3 SDK, not just
// SQL. Same one-message-per-invocation, direct-trigger-plus-backup-poller
// shape as doc-processing and analysis-pass-a.
import { getClient } from "../_shared/db.ts";
import { deleteObject } from "../_shared/r2.ts";

const QUEUE_NAME = "cleanup";
const RETRY_LIMIT = 3; // matches the old BullMQ cleanup queue's `attempts: 3`
const VISIBILITY_SECONDS = 60;

type CleanupPayload = { type: "delete-r2-object"; key: string };

Deno.serve(async () => {
  try {
    return await handle();
  } catch (error) {
    return Response.json(
      { processed: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});

async function handle(): Promise<Response> {
  const client = getClient();
  await client.connect();

  try {
    const readResult = await client.query(
      `SELECT * FROM pgmq.read($1::text, $2::integer, 1)`,
      [QUEUE_NAME, VISIBILITY_SECONDS]
    );
    const row = readResult.rows[0];
    if (!row) {
      return Response.json({ processed: false, reason: "queue empty" });
    }

    const msgId: string = row.msg_id;
    const readCount: number = row.read_ct;
    const payload: CleanupPayload = row.message;

    if (readCount > RETRY_LIMIT) {
      await client.query(
        `INSERT INTO "DeadLetterMessage" ("id", "queueName", "originalMsgId", "payload", "readCount", "lastError")
         VALUES (gen_random_uuid()::text, $1, $2::bigint, $3::jsonb, $4, $5)`,
        [QUEUE_NAME, msgId, JSON.stringify(payload), readCount, "Exceeded retry limit"]
      );
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: false, reason: "dead-lettered", key: payload.key });
    }

    await deleteObject(payload.key);

    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
    return Response.json({ processed: true, key: payload.key });
  } finally {
    await client.end();
  }
}
