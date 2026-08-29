import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enqueueR2Cleanup } from "@/lib/queue/cleanup";
import { getSessionUserId } from "@/lib/auth/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, name: true, createdAt: true, _count: { select: { documents: true } } },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { _count, ...rest } = project;
  return NextResponse.json({ ...rest, documentCount: _count.documents });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Captured before the cascade delete below removes these rows — this is
  // the only chance to know which R2 objects need cleaning up.
  const documents = await prisma.document.findMany({
    where: { project: { id, userId } },
    select: { r2Key: true },
  });

  const { count } = await prisma.project.deleteMany({
    where: { id, userId },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // .agent/rules/uploads-and-storage.md: R2 cleanup happens via the
  // cleanup queue, never synchronously in the request path.
  await Promise.all(documents.map((document) => enqueueR2Cleanup(document.r2Key)));

  return new NextResponse(null, { status: 204 });
}
