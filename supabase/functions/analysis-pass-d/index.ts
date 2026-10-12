// Pass D (PRD Section 6 step 10, the summary step) and final persistence:
// reads Pass C's verified insights from AnalysisVerifiedInsight, generates
// the executive summary, then writes the real Insight/Citation rows and
// marks the Analysis READY in one transaction — mirroring
// lib/pipeline/analysis/run.ts's final $transaction exactly, just run from
// here instead of from the end of one long in-process pipeline.
import { getClient } from "../_shared/db.ts";
import { runPassD } from "../_shared/pipeline/analysis/passD.ts";
import type { VerifiedInsight } from "../_shared/pipeline/analysis/passC.ts";

const QUEUE_NAME = "analysis_pass_d";
const RETRY_LIMIT = 2;
const VISIBILITY_SECONDS = 60;

// Mirrors lib/quota/checks.ts's VERSION_LIMITS (FR-20) — duplicated here
// because that file is Next.js/Node-only (imports Prisma's generated
// PlanTier type) and this function has no Prisma client. Keep in sync if
// the PRD's version-history cap ever changes.
const VERSION_LIMITS: Record<string, number> = { FREE: 1, PRO: 5 };

type PassDPayload = { analysisId: string; projectId: string };
type StoredCitation = { chunkId: string; quote: string; charStart: number; charEnd: number };

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
    const payload: PassDPayload = row.message;

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

    const verifiedResult = await client.query(
      `SELECT "type", "title", "description", "citations" FROM "AnalysisVerifiedInsight" WHERE "analysisId" = $1`,
      [payload.analysisId]
    );
    const verified: VerifiedInsight[] = verifiedResult.rows.map((r) => ({
      type: r.type,
      title: r.title,
      description: r.description,
      citations: r.citations as StoredCitation[],
    }));

    let passDCostUsd = 0;
    const summary = await runPassD(verified, (usd) => {
      passDCostUsd += usd;
    });

    const chunkIds = [...new Set(verified.flatMap((insight) => insight.citations.map((c) => c.chunkId)))];
    const documentIdByChunkId = new Map<string, string>();
    if (chunkIds.length > 0) {
      const chunkResult = await client.query(
        `SELECT "id", "documentId" FROM "DocumentChunk" WHERE "id" = ANY($1::text[])`,
        [chunkIds]
      );
      for (const r of chunkResult.rows) documentIdByChunkId.set(r.id, r.documentId);
    }

    const analysisResult = await client.query(
      `SELECT a."projectId", a."costUsd", p."userId"
       FROM "Analysis" a JOIN "Project" p ON p."id" = a."projectId"
       WHERE a."id" = $1`,
      [payload.analysisId]
    );
    const analysisRow = analysisResult.rows[0];
    if (!analysisRow) {
      // Analysis row gone entirely (shouldn't happen outside manual DB
      // intervention) — nothing left to finalize.
      await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
      return Response.json({ processed: true, reason: "analysis already deleted" });
    }
    const totalCostUsd = Number(analysisRow.costUsd ?? 0) + passDCostUsd;

    const rankByType = new Map<string, number>();

    await client.query("BEGIN");
    try {
      for (const insight of verified) {
        const rank = rankByType.get(insight.type) ?? 0;
        rankByType.set(insight.type, rank + 1);

        const distinctDocumentCount = new Set(
          insight.citations.map((c) => documentIdByChunkId.get(c.chunkId))
        ).size;

        const insightResult = await client.query(
          `INSERT INTO "Insight" ("id", "analysisId", "type", "title", "description", "rank", "evidenceCount")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
           RETURNING "id"`,
          [payload.analysisId, insight.type, insight.title, insight.description, rank, distinctDocumentCount]
        );
        const insightId: string = insightResult.rows[0].id;

        for (const citation of insight.citations) {
          await client.query(
            `INSERT INTO "Citation" ("id", "insightId", "chunkId", "quote", "charStart", "charEnd")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
            [insightId, citation.chunkId, citation.quote, citation.charStart, citation.charEnd]
          );
        }
      }

      await client.query(
        `UPDATE "Analysis" SET "status" = 'READY', "executiveSummary" = $1, "completedAt" = now(),
           "progressStage" = NULL, "costUsd" = $2
         WHERE "id" = $3`,
        [summary, totalCostUsd, payload.analysisId]
      );

      if (totalCostUsd > 0) {
        await client.query(
          `INSERT INTO "UsageRecord" ("id", "userId", "kind", "costUsd", "createdAt")
           VALUES (gen_random_uuid()::text, $1, 'ai_cost', $2, now())`,
          [analysisRow.userId, totalCostUsd]
        );
      }

      // FR-20 version-history cap: delete the oldest READY/STALE analyses
      // for this project beyond the plan's kept-version limit, same as
      // lib/quota/checks.ts's pruneAnalysisVersions.
      const planResult = await client.query(`SELECT "plan" FROM "User" WHERE "id" = $1`, [analysisRow.userId]);
      const limit = VERSION_LIMITS[planResult.rows[0]?.plan ?? "FREE"] ?? 1;
      await client.query(
        `DELETE FROM "Analysis"
         WHERE "id" IN (
           SELECT "id" FROM "Analysis"
           WHERE "projectId" = $1 AND "status" IN ('READY', 'STALE')
           ORDER BY "version" DESC
           OFFSET $2
         )`,
        [analysisRow.projectId, limit]
      );

      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    }

    await client.query(`SELECT pgmq.archive($1::text, $2::bigint)`, [QUEUE_NAME, msgId]);
    return Response.json({ processed: true, analysisId: payload.analysisId, insightCount: verified.length });
  } finally {
    await client.end();
  }
}
