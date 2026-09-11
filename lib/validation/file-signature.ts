import type { DocumentType } from "@prisma/client";

// .agent/rules/security.md: every uploaded file is validated server-side by
// magic bytes, never by trusting the client-reported extension alone.
// PDF and DOCX have real binary signatures to check. TXT and CSV are plain
// text with no fixed signature — for those, the meaningful check is the
// inverse: reject if the bytes match a *binary* format's signature while
// claimed as text (e.g. a renamed .exe), not confirm a signature of their
// own that doesn't exist.
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");
// DOCX is a ZIP container (OOXML) — the ZIP local-file-header signature is
// the strongest check available without unzipping and inspecting entries,
// which is out of scope for an upload-time check.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

export function matchesDeclaredType(header: Buffer, declaredType: DocumentType): boolean {
  if (declaredType === "PDF") {
    return startsWith(header, PDF_SIGNATURE);
  }
  if (declaredType === "DOCX") {
    return startsWith(header, ZIP_SIGNATURE);
  }
  // TXT / CSV: no positive signature to check — just make sure it isn't
  // secretly a PDF or a ZIP-based format wearing a text extension.
  return !startsWith(header, PDF_SIGNATURE) && !startsWith(header, ZIP_SIGNATURE);
}
