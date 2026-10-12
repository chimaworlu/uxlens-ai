-- Phase 2 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
-- Section 2). pgmq replaces BullMQ's Queue/Worker; pg_net lets a Postgres
-- trigger or function call an Edge Function's URL directly (the
-- near-instant pickup path — see dead_letter_messages comment below for
-- the retry side of this).
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net CASCADE;

-- One queue per BullMQ queue it replaces (doc-processing, analysis,
-- cleanup, email -> doc_processing, analysis, cleanup, email; pgmq queue
-- names must be valid Postgres identifiers, so underscores not hyphens).
SELECT pgmq.create('doc_processing');
SELECT pgmq.create('analysis');
SELECT pgmq.create('cleanup');
SELECT pgmq.create('email');

-- pgmq has no built-in retry-limit/dead-letter behavior (confirmed during
-- the feasibility research — only a visibility-window read count,
-- read_ct). Each queue's consumer Edge Function is responsible for
-- checking read_ct against its own retry ceiling (matching BullMQ's old
-- per-queue `attempts` config: 3 for doc-processing/cleanup, 2 for
-- analysis) and, once exceeded, archiving the pgmq message (pgmq.archive)
-- and writing a row here instead of leaving it to retry forever.
CREATE TABLE "DeadLetterMessage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "queueName" TEXT NOT NULL,
    "originalMsgId" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "readCount" INTEGER NOT NULL,
    "lastError" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetterMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeadLetterMessage_queueName_idx" ON "DeadLetterMessage"("queueName");
