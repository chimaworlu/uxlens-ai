// The golden eval set (PRD Section 13, week-3 build, gates launch; see
// .agent/skills/golden-eval-run/SKILL.md for the full procedure this
// implements). Runs the REAL pipeline end to end for every case in
// fixtures.ts — no shortcuts, no mocked AI calls, Pass C runs for real —
// and scores the result against each case's hand-authored expectations.
//
// Usage: node --env-file=.env tests/eval/run-golden-set.ts
//
// Plain `node` execution, same constraints as worker/index.ts and
// scripts/seed-demo.ts: relative imports with explicit .ts extensions, no
// "@/" alias.
import "dotenv/config";
import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../../lib/db/prisma.ts";
import { chunkText } from "../../lib/pipeline/chunk.ts";
import { runAnalysis } from "../../lib/pipeline/analysis/run.ts";
import { buildChatContext } from "../../lib/pipeline/chat/retrieve.ts";
import { streamAnswer } from "../../lib/pipeline/chat/respond.ts";
import { extractCitations } from "../../lib/pipeline/chat/citations.ts";
import { synthesisProvider } from "../../lib/ai/provider.ts";
import { matchInsight, scoreChatAnswer } from "./judge.ts";
import { GOLDEN_CASES } from "./fixtures.ts";
import type { CaseResult, InsightScore, ChatScore, RunRecord } from "./types.ts";

const EVAL_USER_EMAIL = "eval-runner@uxlens.local";
const RUNS_DIR = fileURLToPath(new URL("./runs", import.meta.url));
const RUNS_FILE = `${RUNS_DIR}/history.jsonl`;

// Drop-rate and fabrication thresholds the gate checks against — matches
// the skill's stated bars exactly (M-3, M-5): drop rate alert at 15%, zero
// tolerance for a fabricated grounded-sounding answer.
const DROP_RATE_ALERT = 0.15;

async function getOrCreateEvalUser(): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { email: EVAL_USER_EMAIL },
    update: {},
    create: { email: EVAL_USER_EMAIL, name: "Eval Runner", plan: "PRO" },
    select: { id: true },
  });
}

async function runCase(userId: string, evalCase: (typeof GOLDEN_CASES)[number]): Promise<CaseResult> {
  const project = await prisma.project.create({
    data: { userId, name: `eval: ${evalCase.id}` },
    select: { id: true },
  });

  try {
    const chunkContentById = new Map<string, string>();

    for (const doc of evalCase.documents) {
      const chunks = chunkText(doc.content);
      const document = await prisma.document.create({
        data: {
          projectId: project.id,
          filename: doc.filename,
          type: "TXT",
          status: "READY",
          r2Key: `eval/${evalCase.id}/${doc.filename}`,
          sizeBytes: Buffer.byteLength(doc.content, "utf-8"),
          extractedText: doc.content,
          pageCount: 1,
        },
        select: { id: true },
      });

      const created = await prisma.documentChunk.createManyAndReturn({
        data: chunks.map((chunk, ordinal) => ({
          documentId: document.id,
          ordinal,
          content: chunk.content,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          pageNumber: chunk.pageNumber,
        })),
        select: { id: true, content: true },
      });
      for (const chunk of created) chunkContentById.set(chunk.id, chunk.content);
    }

    const analysis = await prisma.analysis.create({
      data: { projectId: project.id, version: 1, status: "QUEUED", documentCount: evalCase.documents.length },
      select: { id: true },
    });

    const { verifiedCount, droppedCount } = await runAnalysis(analysis.id);

    const [insights, analysisRow] = await Promise.all([
      prisma.insight.findMany({
        where: { analysisId: analysis.id },
        select: { title: true, description: true },
      }),
      prisma.analysis.findUniqueOrThrow({
        where: { id: analysis.id },
        select: { executiveSummary: true },
      }),
    ]);

    const insightScores: InsightScore[] = [];
    for (const expected of evalCase.expectedInsights) {
      const { matched, matchedTitle } = await matchInsight(expected, insights);
      insightScores.push({ expected, matched, matchedTitle });
    }

    const chatScores: ChatScore[] = [];
    for (const chatCase of evalCase.chatCases) {
      const context = await buildChatContext(project.id, chatCase.question);
      let fullText = "";
      for await (const delta of streamAnswer({
        question: chatCase.question,
        context,
        history: [],
        executiveSummary: analysisRow.executiveSummary,
      })) {
        fullText += delta;
      }
      const { cleanedText, citations } = extractCitations(fullText, chunkContentById);
      const hasCitations = citations.length > 0;
      const { verdict, reasoning } = await scoreChatAnswer(
        chatCase.question,
        chatCase.expectation,
        cleanedText,
        hasCitations
      );
      chatScores.push({
        question: chatCase.question,
        expectation: chatCase.expectation,
        hasCitations,
        verdict: verdict as ChatScore["verdict"],
        reasoning,
      });
    }

    return {
      caseId: evalCase.id,
      producedCount: verifiedCount + droppedCount,
      verifiedCount,
      droppedCount,
      insightScores,
      chatScores,
    };
  } catch (error) {
    return {
      caseId: evalCase.id,
      producedCount: 0,
      verifiedCount: 0,
      droppedCount: 0,
      insightScores: [],
      chatScores: [],
      error: (error as Error).message,
    };
  } finally {
    // Cascades to documents/chunks/analysis/insights (schema-level
    // onDelete: Cascade, same as every other project deletion in the
    // app) — keeps eval runs from accumulating rows in the real database.
    // Only the JSON run record below is meant to be the durable history.
    await prisma.project.delete({ where: { id: project.id } });
  }
}

async function main() {
  const gitCommit = execSync("git rev-parse --short HEAD").toString().trim();
  const provider = synthesisProvider();
  const user = await getOrCreateEvalUser();

  console.log(`Golden eval run — commit ${gitCommit}, provider ${provider}, ${GOLDEN_CASES.length} cases.`);
  console.log("This runs the real pipeline for every case and makes live AI calls.\n");

  const results: CaseResult[] = [];
  for (const evalCase of GOLDEN_CASES) {
    process.stdout.write(`  ${evalCase.id}... `);
    const result = await runCase(user.id, evalCase);
    results.push(result);
    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      const hits = result.insightScores.filter((s) => s.matched).length;
      console.log(
        `${hits}/${result.insightScores.length} insights matched, ${result.droppedCount} dropped, ${result.chatScores.length} chat cases scored`
      );
    }
  }

  const totalExpectedInsights = results.reduce((sum, r) => sum + r.insightScores.length, 0);
  const totalMatchedInsights = results.reduce(
    (sum, r) => sum + r.insightScores.filter((s) => s.matched).length,
    0
  );
  const totalProduced = results.reduce((sum, r) => sum + r.producedCount, 0);
  const totalDropped = results.reduce((sum, r) => sum + r.droppedCount, 0);
  const fabrications = results.reduce(
    (sum, r) => sum + r.chatScores.filter((s) => s.verdict === "fabrication").length,
    0
  );

  const insightHitRate = totalExpectedInsights === 0 ? 0 : totalMatchedInsights / totalExpectedInsights;
  const dropRate = totalProduced === 0 ? 0 : totalDropped / totalProduced;

  console.log("\n--- Summary ---");
  console.log(`Insight hit rate: ${totalMatchedInsights}/${totalExpectedInsights} (${(insightHitRate * 100).toFixed(1)}%)`);
  console.log(`Drop rate: ${totalDropped}/${totalProduced} (${(dropRate * 100).toFixed(1)}%) — alert at ${DROP_RATE_ALERT * 100}%`);
  console.log(`Fabricated/incorrect chat answers: ${fabrications} — bar is zero`);

  const record: RunRecord = {
    date: new Date().toISOString(),
    gitCommit,
    // respond.ts's chat answers currently use the same synthesisProvider()
    // as Pass B/D, not a separate chat-specific setting, despite
    // AI_CHAT_PROVIDER existing as its own env var — recorded honestly as
    // what's actually active, not what the unused env var implies.
    config: { synthesisProvider: provider, chatProvider: provider },
    results,
    insightHitRate,
    dropRate,
    fabrications,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  appendFileSync(RUNS_FILE, `${JSON.stringify(record)}\n`);
  console.log(`\nRun record appended to ${RUNS_FILE}`);

  const failed = dropRate >= DROP_RATE_ALERT || fabrications > 0;
  if (failed) {
    console.log("\nQUALITY REGRESSION FLAGGED — do not silently retune prompts to pass. See SKILL.md.");
  }

  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("Golden eval run failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
