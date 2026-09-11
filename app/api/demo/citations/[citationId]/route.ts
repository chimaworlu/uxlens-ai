import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDemoProject } from "@/lib/demo";
import { checkRateLimit } from "@/lib/security/rate-limit";

// Same character-window trimming as /api/citations/:id — kept in sync by
// hand rather than shared, per this app's convention of duplicating small
// page/route-local pieces (see e.g. insights.module.css's own citation
// panel CSS, duplicated per page for the same reason).
const CONTEXT_CHARS = 220;

function windowAroundQuote(content: string, charStart: number, charEnd: number) {
  let start = Math.max(0, charStart - CONTEXT_CHARS);
  let end = Math.min(content.length, charEnd + CONTEXT_CHARS);

  while (start > 0 && /\S/.test(content.charAt(start - 1))) start--;
  while (end < content.length && /\S/.test(content.charAt(end))) end++;

  const rawSlice = content.slice(start, end);
  const leadingWs = rawSlice.match(/^\s+/)?.[0].length ?? 0;
  const trailingWs = rawSlice.match(/\s+$/)?.[0].length ?? 0;
  start += leadingWs;
  end -= trailingWs;

  const prefix = start > 0 ? "… " : "";
  const suffix = end < content.length ? " …" : "";

  return {
    chunkContent: `${prefix}${content.slice(start, end)}${suffix}`,
    charStart: charStart - start + prefix.length,
    charEnd: charEnd - start + prefix.length,
  };
}

// Public equivalent of /api/citations/:id (FR-37: "full insights view with
// working citations"). The only thing that changes from the authenticated
// version is the ownership check: instead of "belongs to a project owned
// by this session's user", it's "belongs to the one public demo project"
// — critical that this stays scoped, not "any citation ID works", or this
// route would be an unauthenticated oracle over every user's real
// citations by ID guessing.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ citationId: string }> }
) {
  const { citationId } = await params;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinRateLimit = await checkRateLimit(`demo:ip:${ip}`, 20, 60);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const project = await getDemoProject();
  if (!project) {
    return NextResponse.json({ error: "Demo is not available right now." }, { status: 503 });
  }

  const citation = await prisma.citation.findFirst({
    where: {
      id: citationId,
      OR: [
        { insight: { analysis: { projectId: project.id } } },
        { chatMessage: { projectId: project.id } },
      ],
    },
    select: {
      id: true,
      quote: true,
      charStart: true,
      charEnd: true,
      insightId: true,
      chatMessageId: true,
      chunk: {
        select: {
          content: true,
          pageNumber: true,
          document: { select: { id: true, filename: true } },
        },
      },
      insight: { select: { title: true } },
    },
  });
  if (!citation) return NextResponse.json({ error: "Citation not found." }, { status: 404 });

  const otherCitations = await prisma.citation.findMany({
    where: citation.insightId
      ? { insightId: citation.insightId, id: { not: citation.id } }
      : { chatMessageId: citation.chatMessageId, id: { not: citation.id } },
    select: {
      id: true,
      chunk: { select: { document: { select: { filename: true } } } },
    },
  });

  const seenFilenames = new Set<string>();
  const otherDocuments = otherCitations
    .filter((entry) => {
      const filename = entry.chunk.document.filename;
      if (seenFilenames.has(filename)) return false;
      seenFilenames.add(filename);
      return true;
    })
    .map((entry) => ({ citationId: entry.id, filename: entry.chunk.document.filename }));

  const windowed = windowAroundQuote(citation.chunk.content, citation.charStart, citation.charEnd);

  return NextResponse.json({
    id: citation.id,
    quote: citation.quote,
    charStart: windowed.charStart,
    charEnd: windowed.charEnd,
    chunkContent: windowed.chunkContent,
    pageNumber: citation.chunk.pageNumber,
    documentId: citation.chunk.document.id,
    documentFilename: citation.chunk.document.filename,
    insightTitle: citation.insight?.title ?? "",
    otherDocuments,
  });
}
