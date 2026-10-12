// Ported from lib/pipeline/extract.ts for the Deno Edge Function runtime.
// Two real differences from the Next.js app's copy, both confirmed during
// the Phase 0 validation spike (supabase/functions/spike-test):
//   1. pdf-parse's pdfjs-dist dependency references the browser DOMMatrix
//      API, even just to load the module, not only when actually parsing.
//      Deno doesn't provide it, so a minimal polyfill is required before
//      pdf-parse is imported — and critically, that import must be
//      *dynamic* (inside extractPdf, not a static top-level import),
//      since static imports are hoisted and evaluate before any other
//      top-level code in the module, including this polyfill, crashing
//      the whole function at load time before the polyfill ever runs.
//      This is exactly how the Phase 0 spike avoided the crash; an
//      earlier attempt at a static top-level import reproduced it.
//   2. DocumentType comes from a local literal union instead of
//      @prisma/client, since this function doesn't use Prisma (see
//      _shared/db.ts's header comment for why).
// Keep extraction behavior otherwise identical to the Next.js copy; if the
// algorithm changes there, mirror the change here too.
import { Buffer } from "node:buffer";
import mammoth from "npm:mammoth@1";
import { parse as parseCsv } from "npm:csv-parse@7/sync";

if (typeof (globalThis as Record<string, unknown>).DOMMatrix === "undefined") {
  (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: unknown) {}
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
  };
}

export type DocumentType = "PDF" | "DOCX" | "TXT" | "CSV";

export class ExtractionError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ExtractionError";
    this.reason = reason;
  }
}

// .agent/rules/uploads-and-storage.md: a PDF averaging under ~50 extracted
// characters per page is treated as likely scanned — fail loudly and
// honestly here rather than let a near-empty analysis input reach the
// pipeline silently.
const MIN_CHARS_PER_PAGE = 50;

type ExtractionResult = { text: string; pageCount: number | null };

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const { PDFParse } = await import("npm:pdf-parse@2");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pageCount = result.total || result.pages.length || 1;
    const averageCharsPerPage = result.text.length / pageCount;

    if (averageCharsPerPage < MIN_CHARS_PER_PAGE) {
      throw new ExtractionError(
        "PDF has no meaningful extractable text",
        "This PDF contains no extractable text. It may be a scanned image, which isn't supported yet."
      );
    }

    // Page markers retained, per the extraction spec, so downstream
    // chunking can still attribute text to a page number.
    const text = result.pages.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
    return { text, pageCount };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, pageCount: null };
}

// No fixed signature to detect encoding, so this decodes as UTF-8 first;
// the presence of the replacement character (U+FFFD) after that decode is
// the practical signal that the bytes weren't actually UTF-8, at which
// point latin1 is the fallback.
function extractTxt(buffer: Buffer): ExtractionResult {
  const utf8Text = buffer.toString("utf-8");
  const text = utf8Text.includes("�") ? buffer.toString("latin1") : utf8Text;
  return { text, pageCount: null };
}

function extractCsv(buffer: Buffer): ExtractionResult {
  const records: Record<string, string>[] = parseCsv(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const text = records
    .map((record, index) => {
      const fields = Object.entries(record)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      return `Row ${index + 1}: ${fields}`;
    })
    .join("\n");

  return { text, pageCount: null };
}

function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(
  buffer: Buffer,
  type: DocumentType
): Promise<{ extractedText: string; pageCount: number | null }> {
  let result: ExtractionResult;

  if (type === "PDF") {
    result = await extractPdf(buffer);
  } else if (type === "DOCX") {
    result = await extractDocx(buffer);
  } else if (type === "TXT") {
    result = extractTxt(buffer);
  } else {
    result = extractCsv(buffer);
  }

  const extractedText = normalize(result.text);

  if (extractedText.length === 0) {
    throw new ExtractionError(
      "No text extracted",
      "This file contains no readable text content."
    );
  }

  return { extractedText, pageCount: result.pageCount };
}
