import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentKey, getPresignedUploadUrl } from "@/lib/storage/r2";
import { resolveDocumentType, contentTypeFor } from "@/lib/validation/document-type";
import { checkDocumentQuota, QuotaExceededError } from "@/lib/quota/checks";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getSessionUserId } from "@/lib/auth/session";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const PresignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = PresignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { filename, sizeBytes } = parsed.data;

  // .agent/rules/security.md: upload presign requests are rate-limited
  // (30/hour/user) so a compromised or scripted account can't exhaust
  // storage or queue capacity.
  const withinRateLimit = await checkRateLimit(`presign:${userId}`, 30, 3600);
  if (!withinRateLimit) {
    return NextResponse.json(
      { error: "Too many upload requests. Please wait a while and try again." },
      { status: 429 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const documentType = resolveDocumentType(filename);
  if (!documentType) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF, DOCX, TXT, or CSV file." },
      { status: 400 }
    );
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "This file exceeds the 20 MB per-file limit." },
      { status: 400 }
    );
  }

  // .agent/rules/uploads-and-storage.md: storage/document caps are enforced
  // at presign time — a user already over cap cannot get a new presigned
  // URL, even for a small file.
  try {
    await checkDocumentQuota(projectId, userId, sizeBytes);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const documentId = randomUUID();
  const objectKey = buildDocumentKey(userId, projectId, documentId, filename);

  const document = await prisma.document.create({
    data: {
      id: documentId,
      projectId,
      filename,
      type: documentType,
      status: "UPLOADED",
      r2Key: objectKey,
      sizeBytes,
    },
    select: { id: true },
  });

  const contentType = contentTypeFor(documentType);
  const uploadUrl = await getPresignedUploadUrl(objectKey, contentType);

  return NextResponse.json({ documentId: document.id, uploadUrl, contentType });
}
