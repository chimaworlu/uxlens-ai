import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

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

  const messages = await prisma.chatMessage.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      citations: {
        select: {
          id: true,
          chunk: { select: { document: { select: { filename: true } } } },
        },
      },
    },
  });

  return NextResponse.json({
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      // One chip per distinct source document, not per citation — same
      // dedupe convention as the chat route's "done" event and
      // citations/[id]'s "other documents" list.
      citations: dedupeByFilename(message.citations),
    })),
  });
}

function dedupeByFilename(
  citations: { id: string; chunk: { document: { filename: string } } }[]
): { id: string; filename: string }[] {
  const seenFilenames = new Set<string>();
  return citations
    .filter((citation) => {
      const filename = citation.chunk.document.filename;
      if (seenFilenames.has(filename)) return false;
      seenFilenames.add(filename);
      return true;
    })
    .map((citation) => ({ id: citation.id, filename: citation.chunk.document.filename }));
}

// FR-32: soft delete — hard deletion happens 30 days later via the daily
// prune-deleted-chat-messages cleanup job (lib/pipeline/chat/prune.ts).
export async function DELETE(
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

  await prisma.chatMessage.updateMany({
    where: { projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return new NextResponse(null, { status: 204 });
}
