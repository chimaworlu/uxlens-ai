// Pass B (PRD Section 6 step 8, the "cluster" step): reads the full set of
// Pass A observations for one analysis from AnalysisObservation (written by
// however many analysis-pass-a invocations ran, one per chunk batch) and
// clusters them into THEME/PAIN_POINT/SUGGESTION/CONTRADICTION insights.
// One message per analysis, unlike Pass A's one-per-batch — there's only
// ever one Pass B invocation per analysis run.
import { getClient } from "../_shared/db.ts";
import { runPassB } from "../_shared/pipeline/analysis/passB.ts";
import type { Observation } from "../_shared/pipeline/analysis/schemas.ts";

const QUEUE_NAME = "analysis_pass_b";
const RETRY_LIMIT = 2;
const VISIBILITY_SECONDS = 150;
const PASS_C_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-c";

type PassBPayload = { analysisId: string; projectId: string };

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
    const payload: PassBPayload = row.message;

    if (readCount > RETRY_LIMIT) {
      await client.query(
        `INSERT INTO "DeadLetterMessage" ("id", "queueName", "originalMsgId", "payload", "readCount", "lastError")
         VALUES (gen_random_uuid()::text, $1, $2::bigint, $3::jsonb, $4, $5)`,
        [QUEUE_NAME, msgId, JSON.stringify(payload), readCount, "Exceeded retry limit"]
      );
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      await client.query(
        `UPDATE "Analysis" SET "status" = 'FAILED', "progressStage" = NULL,
           "failureReason" = 'Something went wrong while analyzing this project. Please try again.'
         WHERE "id" = $1 AND "status" NOT IN ('FAILED', 'READY')`,
        [payload.analysisId]
      );
      return Response.json({ processed: false, reason: "dead-lettered", analysisId: payload.analysisId });
    }

    const obsResult = await client.query(
      `SELECT "type", "statement", "verbatimQuote", "chunkId" FROM "AnalysisObservation" WHERE "analysisId" = $1`,
      [payload.analysisId]
    );
    const observations: Observation[] = obsResult.rows.map((r) => ({
      type: r.type,
      statement: r.statement,
      verbatim_quote: r.verbatimQuote,
      chunkId: r.chunkId,
    }));

    let costUsd = 0;
    const clustered = await runPassB(observations, (usd) => {
      costUsd += usd;
    });

    await client.query("BEGIN");
    try {
      for (const insight of clustered) {
        await client.query(
          `INSERT INTO "AnalysisClusteredInsight" ("id", "analysisId", "type", "title", "description", "citations")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb)`,
          [payload.analysisId, insight.type, insight.title, insight.description, JSON.stringify(insight.citations)]
        );
      }
      await client.query(
        `UPDATE "Analysis" SET "costUsd" = COALESCE("costUsd", 0) + $1, "progressStage" = 'citations' WHERE "id" = $2`,
        [costUsd, payload.analysisId]
      );
      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    }

    await client.query(
      `SELECT pgmq.send($1::text, $2::jsonb)`,
      ["analysis_pass_c", JSON.stringify({ analysisId: payload.analysisId, projectId: payload.projectId })]
    );
    fetch(PASS_C_URL, { method: "POST" }).catch(() => {});

    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
    return Response.json({ processed: true, analysisId: payload.analysisId, insightCount: clustered.length });
  } finally {
    await client.end();
  }
}
