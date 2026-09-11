import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { DOC_PROCESSING_QUEUE_NAME, type DocProcessingJob } from "../../lib/queue/doc-processing.ts";
import { downloadObject } from "../../lib/storage/r2.ts";
import { extractText, ExtractionError } from "../../lib/pipeline/extract.ts";
import { chunkText } from "../../lib/pipeline/chunk.ts";
import { prisma } from "../../lib/db/prisma.ts";

// AGENTS.md Section 4: concurrency 5 for doc-processing, matching the PRD's
// Stage 1 spec (`document-processing` job, queue: doc-processing,
// concurrency 5).
export function startDocProcessingWorker(): Worker<DocProcessingJob> {
  return new Worker<DocProcessingJob>(
    DOC_PROCESSING_QUEUE_NAME,
    async (job: Job<DocProcessingJob>) => {
      const document = await prisma.document.findUnique({
        where: { id: job.data.documentId },
        select: { id: true, r2Key: true, type: true },
      });
      // Deleted before the job ran — nothing to process.
      if (!document) return;

      try {
        const buffer = await downloadObject(document.r2Key);
        const { extractedText, pageCount } = await extractText(buffer, document.type);

        // PRD Section 6, Stage 3: chunk before flipping to READY, so a
        // document never reads as ready to analyze while still missing
        // the chunks the analysis pipeline needs.
        const chunks = chunkText(extractedText);

        await prisma.$transaction(async (tx) => {
          await tx.document.update({
            where: { id: document.id },
            data: { extractedText, pageCount },
          });
          await tx.documentChunk.createMany({
            data: chunks.map((chunk, ordinal) => ({
              documentId: document.id,
              ordinal,
              content: chunk.content,
              charStart: chunk.charStart,
              charEnd: chunk.charEnd,
              pageNumber: chunk.pageNumber,
            })),
          });
          await tx.document.update({
            where: { id: document.id },
            data: { status: "READY" },
          });
        });
      } catch (error) {
        const reason =
          error instanceof ExtractionError
            ? error.reason
            : "Something went wrong while processing this file. Please try again.";
        await prisma.document.update({
          where: { id: document.id },
          data: { status: "FAILED", failureReason: reason },
        });
      }
    },
    { connection: getRedisConnection(), concurrency: 5 }
  );
}
