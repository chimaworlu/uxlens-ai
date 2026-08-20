import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getPresignedDownloadUrl } from "@/lib/storage/r2";
import { getSessionUserId } from "@/lib/auth/session";

// Backs the citation panel's "Open full document" button — a short-lived
// signed URL to the original file, generated on demand rather than stored.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const document = await prisma.document.findFirst({
    where: { id, project: { userId } },
    select: { r2Key: true, filename: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const url = await getPresignedDownloadUrl(document.r2Key, document.filename);
  return NextResponse.json({ url });
}
