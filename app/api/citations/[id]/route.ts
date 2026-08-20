import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

// A DocumentChunk is ~800 tokens — several paragraphs. The citation panel
// (per design) shows a short excerpt around the quote, not the whole chunk,
// so this trims outward from charStart/charEnd to a character budget,
// snapping to word boundaries and marking truncation with an ellipsis.
const CONTEXT_CHARS = 220;

function windowAroundQuote(content: string, charStart: number, charEnd: number) {
  let start = Math.max(0, charStart - CONTEXT_CHARS);
  let end = Math.min(content.length, charEnd + CONTEXT_CHARS);

  // Don't cut a word in half at the edges of the window.
  while (start > 0 && /\S/.test(content.charAt(start - 1))) start--;
  while (end < content.length && /\S/.test(content.charAt(end))) end++;

  // Fold in any stray whitespace/newlines the word-boundary snap left dangling
  // (e.g. a paragraph break), keeping start/end aligned to real content.
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

// Backs the citation panel (FR-18): the clicked chip's own quote
// highlighted inside its surrounding chunk text, plus the other documents
// that also support the same insight.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: citationId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const citation = await prisma.citation.findFirst({
    where: { id: citationId, insight: { analysis: { project: { userId } } } },
    select: {
      id: true,
      quote: true,
      charStart: true,
      charEnd: true,
      insightId: true,
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
    where: { insightId: citation.insightId, id: { not: citation.id } },
    select: {
      id: true,
      chunk: { select: { document: { select: { filename: true } } } },
    },
  });

  // Multiple citations can point at the same document (different chunks) —
  // the chip row shows one entry per distinct document, not per citation.
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
