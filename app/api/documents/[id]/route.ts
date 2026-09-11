import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enqueueR2Cleanup } from "@/lib/queue/cleanup";
import { getSessionUserId } from "@/lib/auth/session";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const document = await prisma.document.findFirst({
    where: { id, project: { userId } },
    select: { r2Key: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  // Captured before the delete below cascades away this document's chunks
  // and citations — the AnalysisDocument snapshot is the primary signal,
  // but a live citation join catches any READY analysis the snapshot
  // missed (e.g. one created before that table existed), since an insight
  // losing all its citations is unconditionally stale (FR-18/19 guarantee
  // 1-10 citations per insight at creation, so zero means "used to have
  // some, now doesn't" — never a legitimate original state).
  const [snapshotMatches, liveCitationMatches] = await Promise.all([
    prisma.analysisDocument.findMany({
      where: { documentId: id, analysis: { status: "READY" } },
      select: { analysisId: true },
    }),
    prisma.citation.findMany({
      where: { chunk: { documentId: id }, insight: { analysis: { status: "READY" } } },
      select: { insight: { select: { analysisId: true } } },
    }),
  ]);

  await prisma.document.deleteMany({ where: { id } });

  // If this document fed a READY analysis, that analysis's evidence is now
  // incomplete (deleting the document cascades away its chunks and any
  // citations pointing at them) — mark it STALE rather than let it keep
  // reading as a trustworthy, complete result.
  const affectedAnalysisIds = new Set([
    ...snapshotMatches.map((match) => match.analysisId),
    ...liveCitationMatches
      .map((match) => match.insight?.analysisId)
      .filter((analysisId): analysisId is string => analysisId !== undefined),
  ]);
  if (affectedAnalysisIds.size > 0) {
    await prisma.analysis.updateMany({
      where: { id: { in: [...affectedAnalysisIds] } },
      data: { status: "STALE" },
    });
  }

  // .agent/rules/uploads-and-storage.md: R2 cleanup happens via the
  // cleanup queue, never synchronously in the request path — this route
  // returns as soon as the database row is gone.
  await enqueueR2Cleanup(document.r2Key);

  return new NextResponse(null, { status: 204 });
}
