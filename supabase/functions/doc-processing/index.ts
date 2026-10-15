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
import {
  extractText,
  ExtractionError,
  getPdfPageCount,
  extractPdfPageRange,
  finalizePdfBatches,
  type DocumentType,
} from "../_shared/pipeline/extract.ts";
import { chunkText, type Chunk } from "../_shared/pipeline/chunk.ts";

const QUEUE_NAME = "doc_processing";
const RETRY_LIMIT = 3; // matches the old BullMQ queue's `attempts: 3`
const VISIBILITY_SECONDS = 300; // comfortably longer than one document's processing time
const SELF_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/doc-processing";

// A PDF extracted in one call risks exceeding the Edge Function's memory
// limit as page count grows — reproduced directly against a real ~8MB
// document that crashed the whole invocation with WORKER_RESOURCE_LIMIT,
// a platform-level kill no in-function error handling can catch. Above
// this many pages, extraction is chained across multiple invocations in
// page-range batches instead, mirroring analysis-pass-a's chunk-batching
// pattern. Chosen conservatively (not just tuned to the one file that
// crashed) to leave headroom for denser or image-heavier pages; revisit if
// a batch itself still crashes in practice.
const PDF_PAGE_BATCH_SIZE = 20;

type DocProcessingPayload = {
  documentId: string;
  // Present only on a continuation message for a PDF big enough to need
  // page-batched extraction (see processPdfBatch below). startPage is the
  // next page to extract; totalPages is cached from the first invocation's
  // getPdfPageCount call so later batches don't need to re-derive it.
  pdfBatch?: { startPage: number; totalPages: number };
};

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
      // Reaching the retry ceiling here means every attempt crashed before
      // the try/catch below could run (e.g. the platform killing the whole
      // invocation for exceeding its memory limit, which no in-function
      // error handling can catch) — so unlike the normal FAILED path
      // further down, nothing has marked this document FAILED yet. Without
      // this, the document is left showing "Extracting" in the UI forever
      // with no error ever surfacing.
      await client.query(
        `UPDATE "Document" SET "status" = 'FAILED', "failureReason" = $1 WHERE "id" = $2`,
        [
          "This file could not be processed after multiple attempts. It may be too large or complex to extract — try a smaller or simpler file.",
          payload.documentId,
        ]
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
      const buffer = Buffer.from(bytes);

      if (document.type === "PDF") {
        const totalPages = payload.pdfBatch?.totalPages ?? (await getPdfPageCount(buffer));

        if (totalPages > PDF_PAGE_BATCH_SIZE) {
          return await processPdfBatch(client, msgId, document.id, buffer, {
            startPage: payload.pdfBatch?.startPage ?? 1,
            totalPages,
          });
        }
      }

      const { extractedText, pageCount } = await extractText(buffer, document.type as DocumentType);
      const chunks = chunkText(extractedText);
      await persistFinalResult(client, document.id, extractedText, pageCount, chunks);

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

type PgClient = ReturnType<typeof getClient>;

// Handles one page-range batch of a large PDF. Each call downloads and
// re-extracts only its own page range (bounded memory regardless of the
// document's total size), appends the result to Document.extractedText —
// which stays intermediate/unnormalized until the last batch — and either
// hands off to a fresh invocation for the next range or, once all pages
// are in, finalizes exactly like the single-shot path does.
async function processPdfBatch(
  client: PgClient,
  msgId: string,
  documentId: string,
  buffer: Buffer,
  batch: { startPage: number; totalPages: number }
): Promise<Response> {
  const { startPage, totalPages } = batch;
  const endPage = Math.min(startPage + PDF_PAGE_BATCH_SIZE - 1, totalPages);
  const batchText = await extractPdfPageRange(buffer, startPage, endPage);

  await client.query(
    `UPDATE "Document" SET "extractedText" = COALESCE("extractedText", '') || $1, "pageCount" = $2 WHERE "id" = $3`,
    [(startPage === 1 ? "" : "\n\n") + batchText, totalPages, documentId]
  );

  if (endPage < totalPages) {
    await client.query(`SELECT pgmq.send($1::text, $2::jsonb)`, [
      QUEUE_NAME,
      JSON.stringify({ documentId, pdfBatch: { startPage: endPage + 1, totalPages } }),
    ]);
    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
    fetch(SELF_URL, { method: "POST" }).catch(() => {});
    return Response.json({ processed: true, documentId, pdfBatch: { startPage, endPage, totalPages } });
  }

  const accumulated = await client.query(`SELECT "extractedText" FROM "Document" WHERE "id" = $1`, [documentId]);
  const extractedText = finalizePdfBatches(accumulated.rows[0].extractedText, totalPages);
  const chunks = chunkText(extractedText);
  await persistFinalResult(client, documentId, extractedText, totalPages, chunks);

  await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
  return Response.json({ processed: true, documentId, chunkCount: chunks.length });
}

async function persistFinalResult(
  client: PgClient,
  documentId: string,
  extractedText: string,
  pageCount: number | null,
  chunks: Chunk[]
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      `UPDATE "Document" SET "extractedText" = $1, "pageCount" = $2 WHERE "id" = $3`,
      [extractedText, pageCount, documentId]
    );
    for (let ordinal = 0; ordinal < chunks.length; ordinal++) {
      const chunk = chunks[ordinal]!;
      await client.query(
        `INSERT INTO "DocumentChunk" ("id", "documentId", "ordinal", "content", "charStart", "charEnd", "pageNumber")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
        [documentId, ordinal, chunk.content, chunk.charStart, chunk.charEnd, chunk.pageNumber]
      );
    }
    await client.query(`UPDATE "Document" SET "status" = 'READY' WHERE "id" = $1`, [documentId]);
    await client.query("COMMIT");
  } catch (txError) {
    await client.query("ROLLBACK");
    throw txError;
  }
}
