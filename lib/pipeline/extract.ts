import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { parse as parseCsv } from "csv-parse/sync";
import type { DocumentType } from "@prisma/client";

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

// Lightweight page-count check (no text extraction) — used by doc-processing
// to decide, before committing to a full extraction attempt, whether a PDF
// has enough pages that extracting all of them in one call risks exceeding
// the Edge Function's memory limit. Deciding this upfront matters because
// that crash is a platform-level kill, not a catchable JS exception, so
// there's no "try the fast path, fall back on failure" option here.
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    return info.total || 1;
  } finally {
    await parser.destroy();
  }
}

// Extracts just one inclusive page range, so peak memory for this call stays
// bounded by the batch size rather than the document's total page count —
// doc-processing chains calls to this across multiple invocations for PDFs
// large enough to need it. Returns raw, unnormalized text with the same
// "[Page N]" markers extractPdf produces, scoped to this range; normalize()
// and the scanned-PDF check run once, by the caller, after all batches for
// a document are concatenated (see finalizePdfBatches below).
export async function extractPdfPageRange(
  buffer: Buffer,
  first: number,
  last: number
): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first, last });
    return result.pages.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
  } finally {
    await parser.destroy();
  }
}

// Mirrors extractPdf's tail validation (normalize + scanned-PDF check), for
// use once a batched PDF's pages have all been accumulated.
export function finalizePdfBatches(rawText: string, pageCount: number): string {
  const extractedText = normalize(rawText);

  if (extractedText.length === 0) {
    throw new ExtractionError("No text extracted", "This file contains no readable text content.");
  }

  const averageCharsPerPage = extractedText.length / pageCount;
  if (averageCharsPerPage < MIN_CHARS_PER_PAGE) {
    throw new ExtractionError(
      "PDF has no meaningful extractable text",
      "This PDF contains no extractable text. It may be a scanned image, which isn't supported yet."
    );
  }

  return extractedText;
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
