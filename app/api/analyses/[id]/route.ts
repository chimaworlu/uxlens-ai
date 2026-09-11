import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, project: { userId } },
    select: {
      id: true,
      projectId: true,
      version: true,
      status: true,
      failureReason: true,
      executiveSummary: true,
      documentCount: true,
      completedAt: true,
      createdAt: true,
      sourceDocuments: { select: { documentId: true, filename: true } },
      insights: {
        orderBy: [{ type: "asc" }, { rank: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          rank: true,
          evidenceCount: true,
          starred: true,
          citations: {
            select: {
              id: true,
              chunkId: true,
              quote: true,
              charStart: true,
              charEnd: true,
              chunk: { select: { document: { select: { filename: true } } } },
            },
          },
        },
      },
    },
  });

  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  let staleDocuments: string[] = [];
  if (analysis.status === "STALE") {
    const stillExisting = await prisma.document.findMany({
      where: { id: { in: analysis.sourceDocuments.map((doc) => doc.documentId) } },
      select: { id: true },
    });
    const stillExistingIds = new Set(stillExisting.map((doc) => doc.id));
    staleDocuments = analysis.sourceDocuments
      .filter((doc) => !stillExistingIds.has(doc.documentId))
      .map((doc) => doc.filename);
  }

  const { sourceDocuments: _sourceDocuments, ...rest } = analysis;
  return NextResponse.json({ ...rest, staleDocuments });
}
