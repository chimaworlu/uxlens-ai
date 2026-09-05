import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getPresignedDownloadUrl } from "@/lib/storage/r2";
import { getDemoProject } from "@/lib/demo";
import { checkRateLimit } from "@/lib/security/rate-limit";

// Public equivalent of /api/documents/:id/download, scoped to the demo
// project instead of a signed-in user's own documents — backs the demo
// citation panel's "Open full document" button.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinRateLimit = await checkRateLimit(`demo:ip:${ip}`, 20, 60);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const project = await getDemoProject();
  if (!project) {
    return NextResponse.json({ error: "Demo is not available right now." }, { status: 503 });
  }

  const document = await prisma.document.findFirst({
    where: { id, projectId: project.id },
    select: { r2Key: true, filename: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const url = await getPresignedDownloadUrl(document.r2Key, document.filename);
  return NextResponse.json({ url });
}
