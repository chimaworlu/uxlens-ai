// Pass A (PRD Section 6 step 7, the "map" step): one Edge Function
// invocation processes ONE chunk batch from the "analysis" pgmq queue,
// mirroring doc-processing's one-message-per-invocation design. Batches
// are created up front by lib/queue/analysis.ts (Next.js side), which also
// fires one direct HTTP trigger per batch so they run as concurrent
// invocations rather than queued up behind each other.
//
// Because several batches for the same analysis run concurrently, there's
// no single invocation that naturally knows when Pass A as a whole is
// done. Analysis.passACompletedBatches/passATotalBatches (added in Phase
// 4's migration) answer that: each invocation atomically increments the
// counter after writing its own observations, and only the one invocation
// that happens to flip it to equal passATotalBatches dispatches Pass B —
// safe under concurrency because the UPDATE...RETURNING below is a single
// atomic statement, not a read-then-write.
import { getClient } from "../_shared/db.ts";
import { runObservationBatch } from "../_shared/pipeline/analysis/passA.ts";

const QUEUE_NAME = "analysis";
const RETRY_LIMIT = 2; // matches the old BullMQ analysis queue's `attempts: 2`
const VISIBILITY_SECONDS = 120;
const PASS_B_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-b";

type PassAPayload = { analysisId: string; projectId: string; batchIndex: number; chunkIds: string[] };

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
    const payload: PassAPayload = row.message;

    if (readCount > RETRY_LIMIT) {
      await client.query(
        `INSERT INTO "DeadLetterMessage" ("id", "queueName", "originalMsgId", "payload", "readCount", "lastError")
         VALUES (gen_random_uuid()::text, $1, $2::bigint, $3::jsonb, $4, $5)`,
        [QUEUE_NAME, msgId, JSON.stringify(payload), readCount, "Exceeded retry limit"]
      );
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      // NOT IN ('FAILED', 'READY'): another batch's failure, or Pass D
      // finishing first (shouldn't happen, but harmless if it did), may
      // have already resolved this analysis one way or the other.
      await client.query(
        `UPDATE "Analysis" SET "status" = 'FAILED', "progressStage" = NULL,
           "failureReason" = 'Something went wrong while analyzing this project. Please try again.'
         WHERE "id" = $1 AND "status" NOT IN ('FAILED', 'READY')`,
        [payload.analysisId]
      );
      return Response.json({ processed: false, reason: "dead-lettered", analysisId: payload.analysisId });
    }

    const chunkResult = await client.query(
      `SELECT "id", "content" FROM "DocumentChunk" WHERE "id" = ANY($1::text[])`,
      [payload.chunkIds]
    );
    const chunks: { id: string; content: string }[] = chunkResult.rows;

    let costUsd = 0;
    const observations = await runObservationBatch(chunks, (usd) => {
      costUsd += usd;
    });

    await client.query("BEGIN");
    try {
      for (const observation of observations) {
        await client.query(
          `INSERT INTO "AnalysisObservation" ("id", "analysisId", "type", "statement", "verbatimQuote", "chunkId")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
          [payload.analysisId, observation.type, observation.statement, observation.verbatim_quote, observation.chunkId]
        );
      }
      await client.query(
        `UPDATE "Analysis" SET "costUsd" = COALESCE("costUsd", 0) + $1 WHERE "id" = $2`,
        [costUsd, payload.analysisId]
      );
      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    }

    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);

    const counterResult = await client.query(
      `UPDATE "Analysis" SET "passACompletedBatches" = "passACompletedBatches" + 1
       WHERE "id" = $1 AND "status" NOT IN ('FAILED', 'READY')
       RETURNING "passACompletedBatches", "passATotalBatches"`,
      [payload.analysisId]
    );
    const counterRow = counterResult.rows[0];
    const isLastBatch =
      counterRow && counterRow.passACompletedBatches === counterRow.passATotalBatches;

    if (isLastBatch) {
      await client.query(
        `UPDATE "Analysis" SET "progressStage" = 'synthesizing' WHERE "id" = $1`,
        [payload.analysisId]
      );
      await client.query(
        `SELECT pgmq.send($1::text, $2::jsonb)`,
        ["analysis_pass_b", JSON.stringify({ analysisId: payload.analysisId, projectId: payload.projectId })]
      );
      fetch(PASS_B_URL, { method: "POST" }).catch(() => {});
    }

    return Response.json({
      processed: true,
      analysisId: payload.analysisId,
      batchIndex: payload.batchIndex,
      observationCount: observations.length,
      dispatchedPassB: Boolean(isLastBatch),
    });
  } finally {
    await client.end();
  }
}
