import type { DocumentType } from "@prisma/client";

// Matched by extension, not just MIME type — browsers report inconsistent
// (and sometimes empty) MIME types for the same file depending on OS.
const EXTENSION_TYPE_MAP: Record<string, DocumentType> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  csv: "CSV",
};

const TYPE_CONTENT_TYPE_MAP: Record<DocumentType, string> = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TXT: "text/plain",
  CSV: "text/csv",
};

export function resolveDocumentType(filename: string): DocumentType | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension ? (EXTENSION_TYPE_MAP[extension] ?? null) : null;
}

export function contentTypeFor(documentType: DocumentType): string {
  return TYPE_CONTENT_TYPE_MAP[documentType];
}
