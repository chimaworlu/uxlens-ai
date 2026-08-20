import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

// FR-20: version dropdown on the Insights view. Free keeps only the latest
// version (older ones are pruned by the daily cleanup job), so this list
// is short for Free and up to 5 entries for Pro — the route itself doesn't
// care which, it just returns whatever rows still exist.
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

  const versions = await prisma.analysis.findMany({
    where: { projectId, status: { in: ["READY", "STALE"] } },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true, documentCount: true },
  });

  return NextResponse.json({ versions });
}
