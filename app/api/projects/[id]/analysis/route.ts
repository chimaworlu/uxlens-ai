import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  checkAnalysisQuota,
  checkProjectWritable,
  checkAiSpendCeiling,
  QuotaExceededError,
} from "@/lib/quota/checks";
import { enqueueAnalysis } from "@/lib/queue/analysis";
import { countWords, estimateTokens } from "@/lib/ai/tokens";
import { getSessionUserId } from "@/lib/auth/session";

// FR-22b: 300k total extracted tokens is the hard ceiling on a single
// analysis's input.
const MAX_INPUT_TOKENS = 300_000;
// FR-22: under 300 words of total extracted content is refused as too
// little to analyze meaningfully.
const MIN_INPUT_WORDS = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  // .agent/rules/security.md / PRD: email verification gates analysis, not
  // signup or upload.
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Please verify your email before running an analysis." },
      { status: 403 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  // FR-36: a project over the plan's active-project cap is read-only —
  // checked before every other pre-enqueue check below, since none of
  // that matters if analysis isn't allowed here at all.
  try {
    await checkProjectWritable(userId, projectId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, reason: "read-only" }, { status: 403 });
    }
    throw error;
  }

  // PRD Section 7: "1 job per project at a time" — a project already
  // mid-analysis can't have a second one enqueued on top of it.
  const activeAnalysis = await prisma.analysis.findFirst({
    where: { projectId, status: { in: ["QUEUED", "PROCESSING"] } },
    select: { id: true },
  });
  if (activeAnalysis) {
    return NextResponse.json(
      { error: "An analysis is already running for this project.", reason: "in-progress" },
      { status: 409 }
    );
  }

  const readyDocuments = await prisma.document.findMany({
    where: { projectId, status: "READY" },
    select: { id: true, filename: true, extractedText: true },
  });

  const totalText = readyDocuments.map((doc) => doc.extractedText ?? "").join("\n\n");
  const totalWords = countWords(totalText);
  const totalTokens = estimateTokens(totalText);

  // FR-22 / FR-22b: refused pre-enqueue, no run consumed either way.
  if (totalWords < MIN_INPUT_WORDS) {
    return NextResponse.json(
      {
        error:
          "There isn't enough research content here to analyze meaningfully. Add more documents or richer notes.",
        reason: "too-little",
      },
      { status: 422 }
    );
  }
  if (totalTokens > MAX_INPUT_TOKENS) {
    return NextResponse.json(
      {
        error:
          "This project has more content than a single analysis can process. Remove some documents or split into two projects.",
        reason: "too-much",
      },
      { status: 422 }
    );
  }

  // FR-21: monthly quota, checked (and only now, after the free pre-checks
  // above) so a refused run never counts against it.
  try {
    await checkAnalysisQuota(userId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, reason: "quota" }, { status: 429 });
    }
    throw error;
  }

  // R-3: the daily AI spend ceiling, checked last among the quota-style
  // gates and still before a run is consumed — an unusual case (e.g.
  // outsized documents) can cost more than typical even while comfortably
  // within the monthly run count above.
  try {
    await checkAiSpendCeiling(userId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, reason: "ai-spend" }, { status: 429 });
    }
    throw error;
  }

  const latest = await prisma.analysis.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const analysis = await prisma.analysis.create({
    data: {
      projectId,
      version: nextVersion,
      status: "QUEUED",
      documentCount: readyDocuments.length,
    },
    select: { id: true, status: true, version: true },
  });

  // Snapshot which documents fed this run — independent of the Document
  // rows themselves, so it still answers "was doc X part of this analysis"
  // after that document is later deleted (see AnalysisDocument's own note
  // in prisma/schema.prisma for why it isn't a real foreign key).
  await prisma.analysisDocument.createMany({
    data: readyDocuments.map((doc) => ({
      analysisId: analysis.id,
      documentId: doc.id,
      filename: doc.filename,
    })),
  });

  await prisma.usageRecord.create({
    data: { userId, kind: "analysis_run" },
  });

  await enqueueAnalysis(analysis.id, projectId);

  return NextResponse.json(analysis, { status: 202 });
}
