import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { readObjectHeader } from "@/lib/storage/r2";
import { matchesDeclaredType } from "@/lib/validation/file-signature";
import { enqueueR2Cleanup } from "@/lib/queue/cleanup";
import { enqueueDocumentProcessing } from "@/lib/queue/doc-processing";
import { getSessionUserId } from "@/lib/auth/session";

const HEADER_BYTES = 16;

const ConfirmSchema = z.object({
  documentId: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = ConfirmSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { documentId } = parsed.data;

  const document = await prisma.document.findFirst({
    where: { id: documentId, project: { id: projectId, userId } },
    select: { id: true, r2Key: true, type: true, status: true, filename: true, sizeBytes: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  // Already resolved (a retried confirm call, or a duplicate click) —
  // return the current state instead of re-running validation.
  if (document.status !== "UPLOADED") {
    return NextResponse.json(document);
  }

  let header: Buffer;
  try {
    header = await readObjectHeader(document.r2Key, HEADER_BYTES);
  } catch {
    const failed = await prisma.document.update({
      where: { id: document.id },
      data: { status: "FAILED", failureReason: "The upload did not complete. Please try again." },
      select: { id: true, filename: true, type: true, status: true, failureReason: true, sizeBytes: true, createdAt: true },
    });
    return NextResponse.json(failed);
  }

  // .agent/rules/security.md: magic-byte check server-side, never trusting
  // the client-declared extension alone.
  if (!matchesDeclaredType(header, document.type)) {
    await enqueueR2Cleanup(document.r2Key);
    const failed = await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "FAILED",
        failureReason: "This file's contents don't match its extension.",
      },
      select: { id: true, filename: true, type: true, status: true, failureReason: true, sizeBytes: true, createdAt: true },
    });
    return NextResponse.json(failed);
  }

  const confirmed = await prisma.document.update({
    where: { id: document.id },
    data: { status: "EXTRACTING" },
    select: { id: true, filename: true, type: true, status: true, failureReason: true, sizeBytes: true, createdAt: true },
  });

  await enqueueDocumentProcessing(document.id);

  return NextResponse.json(confirmed);
}
