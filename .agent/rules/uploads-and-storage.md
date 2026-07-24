---
trigger: always_on
---

# Uploads and Storage Rules

Cloudflare R2 is the only file store. This file governs the mechanics of getting files in, processing them, and cleaning them up — not the general "never call an AI provider from the client" class of rule, which lives in `security.md`.

## Upload path

- Files never pass through the Next.js application server. The flow is: client requests a presigned R2 PUT URL from the server → client uploads directly to R2 → client notifies the server the upload completed → server creates the `Document` row and enqueues `document-processing`. If you write code where a file's bytes flow through a Next.js route handler, that's the wrong pattern — stop and use the presign flow instead.
- Accepted types: PDF, DOCX, TXT, CSV. Nothing else, even if a library could technically handle another format — that's scope, not a storage detail, and belongs in a PRD conversation, not a quiet addition.
- Max 20 MB per file, max 25 documents per project (10 for free tier). Both are checked server-side before a presigned URL is issued — never rely on the client to stop an oversized upload.

## Object keys

- R2 object keys follow the pattern `users/{userId}/projects/{projectId}/docs/{documentId}/{sanitizedFilename}`. Never deviate from this structure — other jobs (cleanup, export, deletion) parse or construct keys assuming this exact shape.
- Filenames are sanitized before being used in a key (strip path separators, control characters, anything that could be interpreted as a directory traversal). Never use a raw user-supplied filename directly in a storage key or path.

## Reading files back

- All reads from R2 go through short-lived presigned GET URLs (15 minutes). Never generate a public or long-lived URL for a user's document, even for internal debugging convenience.

## Text extraction

- Extraction is type-specific: `pdf-parse` for PDF, `mammoth` for DOCX, direct UTF-8 read (fallback latin1) for TXT, `csv-parse` with row-wise conversion for CSV. Don't substitute a different library without flagging why the named one doesn't work.
- A PDF with fewer than ~50 extracted characters per page on average is treated as likely scanned and fails with a specific, honest reason ("This PDF contains no extractable text..."). Never let this case silently produce an empty or near-empty analysis input — fail loudly and early, before it reaches the pipeline.
- Extracted text is normalized (whitespace collapsed, page markers retained for PDFs) once, at extraction time, and stored on `Document.extractedText`. Don't re-normalize inconsistently at different pipeline stages — chunk offsets depend on extraction producing stable, consistent text.

## Storage caps and cost

- Free tier: 100 MB/user. Pro: 2 GB/user. Enforced at presign time — a user already over cap cannot get a new presigned URL, even for a small file. This is a cost control, not just a fairness feature; unchecked storage growth is a direct line item. *(FR-42)*
- The 300-word minimum and 300k-token maximum on total project text (FR-22, FR-22b) are analysis-time checks, not upload-time checks — a project can accumulate documents past the analysis floor or ceiling; the block happens when analysis is triggered, not when a file is uploaded.

## Deletion and cleanup

- Deleting a document removes its R2 object, its chunks, and marks any analysis that used it as `STALE`. Deleting a project cascades the same cleanup across all its documents, and its R2 objects are removed within 24 hours via the cleanup queue — never immediately in the request path, since batch deletion at scale can be slow and shouldn't block the user's request.
- The `cleanup` queue's R2 orphan-deletion job is what actually enforces "documents are removed from storage" for cascaded and account-level deletions. If a deletion path creates a new way for an R2 object to become orphaned (referenced by no `Document` row), that job's query needs to account for it — an orphaned file in a private bucket is not a bug you can defer, it's a customer's data outliving the record it was deleted through.