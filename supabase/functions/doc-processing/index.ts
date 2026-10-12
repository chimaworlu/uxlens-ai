// Ports worker/queues/doc-processing.ts to an Edge Function consumer of
// the pgmq `doc_processing` queue (Phase 3 of the BullMQ -> Supabase Edge
// Functions migration, AGENTS.md Section 2). Triggered two ways, both
// hitting this same endpoint: (1) directly, right after a document's
// confirm route sends the pgmq message, for near-instant pickup; (2) a
// pg_cron backup poller on a short interval, catching anything the direct
// trigger missed (e.g. this function already busy with another message).
//
// Reads and processes ONE message per invocation — Edge Functions scale
// by concurrent invocations (one per inbound HTTP request), not by an
// internal concurrency setting the way BullMQ's `concurrency: 5` worked,
// so "up to 5 at once" now comes from however many requests happen to
// land here at the same time, not a config value in this file.
import { Buffer } from "node:buffer";
import { getClient } from "../_shared/db.ts";
import { downloadObject } from "../_shared/r2.ts";
import { extractText, ExtractionError, type DocumentType } from "../_shared/pipeline/extract.ts";
import { chunkText } from "../_shared/pipeline/chunk.ts";

const QUEUE_NAME = "doc_processing";
const RETRY_LIMIT = 3; // matches the old BullMQ queue's `attempts: 3`
const VISIBILITY_SECONDS = 300; // comfortably longer than one document's processing time

type DocProcessingPayload = { documentId: string };

Deno.serve(async () => {
  try {
    return await handle();
  } catch (error) {
    return Response.json(
      {
        processed: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
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
    const payload: DocProcessingPayload = row.message;

    if (readCount > RETRY_LIMIT) {
      await client.query(
        `INSERT INTO "DeadLetterMessage" ("id", "queueName", "originalMsgId", "payload", "readCount", "lastError")
         VALUES (gen_random_uuid()::text, $1, $2::bigint, $3::jsonb, $4, $5)`,
        [QUEUE_NAME, msgId, JSON.stringify(payload), readCount, "Exceeded retry limit"]
      );
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: false, reason: "dead-lettered", documentId: payload.documentId });
    }

    const docResult = await client.query(
      `SELECT "id", "r2Key", "type" FROM "Document" WHERE "id" = $1`,
      [payload.documentId]
    );
    const document = docResult.rows[0];

    // Deleted before this job ran — nothing to process, but still a
    // successful outcome for this message (matches the old worker's
    // `if (!document) return;`).
    if (!document) {
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: true, reason: "document already deleted" });
    }

    try {
      const bytes = await downloadObject(document.r2Key);
      const { extractedText, pageCount } = await extractText(
        Buffer.from(bytes),
        document.type as DocumentType
      );
      const chunks = chunkText(extractedText);

      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE "Document" SET "extractedText" = $1, "pageCount" = $2 WHERE "id" = $3`,
          [extractedText, pageCount, document.id]
        );
        for (let ordinal = 0; ordinal < chunks.length; ordinal++) {
          const chunk = chunks[ordinal]!;
          await client.query(
            `INSERT INTO "DocumentChunk" ("id", "documentId", "ordinal", "content", "charStart", "charEnd", "pageNumber")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
            [document.id, ordinal, chunk.content, chunk.charStart, chunk.charEnd, chunk.pageNumber]
          );
        }
        await client.query(`UPDATE "Document" SET "status" = 'READY' WHERE "id" = $1`, [document.id]);
        await client.query("COMMIT");
      } catch (txError) {
        await client.query("ROLLBACK");
        throw txError;
      }

      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: true, documentId: document.id, chunkCount: chunks.length });
    } catch (error) {
      const reason =
        error instanceof ExtractionError
          ? error.reason
          : "Something went wrong while processing this file. Please try again.";
      await client.query(
        `UPDATE "Document" SET "status" = 'FAILED', "failureReason" = $1 WHERE "id" = $2`,
        [reason, document.id]
      );
      // Not dead-lettered here: a FAILED document with a clear reason is
      // the correct terminal state (matches the old worker's behavior) —
      // archive so pgmq doesn't keep redelivering a message that already
      // reached a real terminal outcome.
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: true, documentId: document.id, failed: true, reason });
    }
  } finally {
    await client.end();
  }
}
