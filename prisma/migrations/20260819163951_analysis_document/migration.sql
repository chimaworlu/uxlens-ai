-- DropIndex
DROP INDEX "chunk_search_idx";

-- CreateTable
CREATE TABLE "AnalysisDocument" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,

    CONSTRAINT "AnalysisDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisDocument_analysisId_idx" ON "AnalysisDocument"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisDocument_documentId_idx" ON "AnalysisDocument"("documentId");

-- AddForeignKey
ALTER TABLE "AnalysisDocument" ADD CONSTRAINT "AnalysisDocument_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
