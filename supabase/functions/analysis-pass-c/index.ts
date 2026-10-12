// Pass C (PRD Section 6 step 9, the hallucination firewall, FR-19): reads
// Pass B's clustered insights from AnalysisClusteredInsight, verifies every
// claimed quote actually appears in its source chunk, and drops any
// insight whose every citation fails. Pure code, no AI call — same
// AGENTS.md Section 4 rule as the Next.js copy ("Pass C ... contains no AI
// calls").
import { getClient } from "../_shared/db.ts";
import { runPassC } from "../_shared/pipeline/analysis/passC.ts";
import type { ClusteredInsight } from "../_shared/pipeline/analysis/schemas.ts";

const QUEUE_NAME = "analysis_pass_c";
const RETRY_LIMIT = 2;
const VISIBILITY_SECONDS = 60;
const PASS_D_URL = "https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-d";

type PassCPayload = { analysisId: string; projectId: string };
type StoredCitation = { chunkId: string; quote: string };

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
    const payload: PassCPayload = row.message;

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

    const clusteredResult = await client.query(
      `SELECT "type", "title", "description", "citations" FROM "AnalysisClusteredInsight" WHERE "analysisId" = $1`,
      [payload.analysisId]
    );
    const clustered: ClusteredInsight[] = clusteredResult.rows.map((r) => ({
      type: r.type,
      title: r.title,
      description: r.description,
      citations: r.citations as StoredCitation[],
    }));

    const chunkIds = [...new Set(clustered.flatMap((insight) => insight.citations.map((c) => c.chunkId)))];
    const chunkContentById = new Map<string, string>();
    if (chunkIds.length > 0) {
      const chunkResult = await client.query(
        `SELECT "id", "content" FROM "DocumentChunk" WHERE "id" = ANY($1::text[])`,
        [chunkIds]
      );
      for (const r of chunkResult.rows) chunkContentById.set(r.id, r.content);
    }

    const { verified, droppedCount } = runPassC(clustered, chunkContentById);

    await client.query("BEGIN");
    try {
      for (const insight of verified) {
        await client.query(
          `INSERT INTO "AnalysisVerifiedInsight" ("id", "analysisId", "type", "title", "description", "citations")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb)`,
          [payload.analysisId, insight.type, insight.title, insight.description, JSON.stringify(insight.citations)]
        );
      }
      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    }

    await client.query(
      `SELECT pgmq.send($1::text, $2::jsonb)`,
      ["analysis_pass_d", JSON.stringify({ analysisId: payload.analysisId, projectId: payload.projectId })]
    );
    fetch(PASS_D_URL, { method: "POST" }).catch(() => {});

    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
    return Response.json({
      processed: true,
      analysisId: payload.analysisId,
      verifiedCount: verified.length,
      droppedCount,
    });
  } finally {
    await client.end();
  }
}
