// PRD Section 6, Stage 3: split extracted text into ~800-token chunks with
// ~100-token overlap, split on paragraph boundaries where possible, each
// carrying its char offsets into the source `extractedText` and a page
// number when known.

const CHARS_PER_TOKEN = 4; // matches lib/ai/tokens.ts's estimate
const TARGET_CHUNK_CHARS = 800 * CHARS_PER_TOKEN;
const OVERLAP_CHARS = 100 * CHARS_PER_TOKEN;

export type Chunk = {
  content: string;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
};

type Span = { start: number; end: number };

// A paragraph is a run of non-blank lines; normalize() in extract.ts
// already collapses 3+ newlines down to a single blank line, so "\n\n" is
// the reliable paragraph separator here.
function paragraphSpans(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

// extractPdf (lib/pipeline/extract.ts) prefixes each page's text with
// "[Page N]\n" markers, retained through normalize() for this purpose.
function pageMarkers(text: string): { page: number; start: number }[] {
  const markers: { page: number; start: number }[] = [];
  const pattern = /\[Page (\d+)\]\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    markers.push({ page: Number(match[1]), start: match.index });
  }
  return markers;
}

function pageForOffset(markers: { page: number; start: number }[], offset: number): number | null {
  let page: number | null = null;
  for (const marker of markers) {
    if (marker.start > offset) break;
    page = marker.page;
  }
  return page;
}

export function chunkText(text: string): Chunk[] {
  const paragraphs = paragraphSpans(text);
  if (paragraphs.length === 0) return [];

  const markers = pageMarkers(text);
  const chunks: Chunk[] = [];

  let startIdx = 0;
  while (startIdx < paragraphs.length) {
    let endIdx = startIdx;
    while (
      endIdx + 1 < paragraphs.length &&
      paragraphs[endIdx + 1]!.end - paragraphs[startIdx]!.start <= TARGET_CHUNK_CHARS
    ) {
      endIdx++;
    }

    const chunkStart = paragraphs[startIdx]!.start;
    const chunkEnd = paragraphs[endIdx]!.end;
    chunks.push({
      content: text.slice(chunkStart, chunkEnd),
      charStart: chunkStart,
      charEnd: chunkEnd,
      pageNumber: pageForOffset(markers, chunkStart),
    });

    if (endIdx === paragraphs.length - 1) break;

    // Walk backward from the end of this chunk until ~OVERLAP_CHARS of
    // trailing content is covered, then resume the next chunk there —
    // paragraph-aligned, so overlap never starts mid-sentence.
    let overlapIdx = endIdx;
    let overlapLength = 0;
    while (overlapIdx > startIdx && overlapLength < OVERLAP_CHARS) {
      overlapLength += paragraphs[overlapIdx]!.end - paragraphs[overlapIdx]!.start;
      overlapIdx--;
    }
    startIdx = Math.max(overlapIdx + 1, startIdx + 1); // guarantee forward progress
  }

  return chunks;
}
