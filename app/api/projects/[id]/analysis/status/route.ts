import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

// PRD Section 6, step 11: polled by the client every 3s while an analysis
// is processing.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const analysis = await prisma.analysis.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, status: true, progressStage: true, failureReason: true, version: true },
  });

  if (!analysis) return NextResponse.json({ status: "none" });

  return NextResponse.json({
    analysisId: analysis.id,
    status: analysis.status,
    progressStage: analysis.progressStage,
    failureReason: analysis.failureReason,
    version: analysis.version,
  });
}
