-- Phase 4 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
-- Section 2). Pass A/B/C/D each become their own Edge Function invocation
-- instead of one long-running in-process pipeline, so the handoff between
-- passes that used to be a plain in-memory variable now has to go through
-- the database. passATotalBatches/passACompletedBatches let the last Pass A
-- batch invocation recognize it's the last one and dispatch Pass B; the
-- three new tables stage each pass's output for the next pass to read.

-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN "passATotalBatches" INTEGER,
ADD COLUMN "passACompletedBatches" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AnalysisObservation" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "verbatimQuote" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisClusteredInsight" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisClusteredInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisVerifiedInsight" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisVerifiedInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisObservation_analysisId_idx" ON "AnalysisObservation"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisClusteredInsight_analysisId_idx" ON "AnalysisClusteredInsight"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisVerifiedInsight_analysisId_idx" ON "AnalysisVerifiedInsight"("analysisId");

-- AddForeignKey
ALTER TABLE "AnalysisObservation" ADD CONSTRAINT "AnalysisObservation_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisClusteredInsight" ADD CONSTRAINT "AnalysisClusteredInsight_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisVerifiedInsight" ADD CONSTRAINT "AnalysisVerifiedInsight_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
