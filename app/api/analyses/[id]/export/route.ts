import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

// FR-24: PDF export. Markdown was the MVP-scoped format per the PRD's
// original [ASSUMPTION]; this replaces it with a rendered report using
// pdfkit (pure Node, no headless-browser dependency).
const SECTION_ORDER = ["THEME", "PAIN_POINT", "SUGGESTION", "CONTRADICTION"] as const;
const SECTION_LABELS: Record<(typeof SECTION_ORDER)[number], string> = {
  THEME: "Themes",
  PAIN_POINT: "Pain Points",
  SUGGESTION: "Suggestions",
  CONTRADICTION: "Contradictions",
};

const PRIMARY_COLOR = "#3457d5";
const TEXT_COLOR = "#1a1a1a";
const MUTED_COLOR = "#6b6b6b";
const PAGE_MARGIN = 54;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, project: { userId } },
    select: {
      version: true,
      executiveSummary: true,
      documentCount: true,
      project: { select: { name: true } },
      insights: {
        orderBy: [{ type: "asc" }, { rank: "asc" }],
        select: {
          type: true,
          title: true,
          description: true,
          evidenceCount: true,
          citations: {
            select: { quote: true, chunk: { select: { document: { select: { filename: true } } } } },
          },
        },
      },
    },
  });
  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  const pdfBuffer = await renderPdf(analysis);
  const filename = `${analysis.project.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}-v${analysis.version}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

type AnalysisForExport = {
  version: number;
  executiveSummary: string | null;
  documentCount: number;
  project: { name: string };
  insights: {
    type: (typeof SECTION_ORDER)[number];
    title: string;
    description: string;
    evidenceCount: number;
    citations: { quote: string; chunk: { document: { filename: string } } }[];
  }[];
};

function renderPdf(analysis: AnalysisForExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(TEXT_COLOR)
      .text(`${analysis.project.name} - Analysis v${analysis.version}`, { align: "left" });
    doc.moveDown(1);

    if (analysis.executiveSummary) {
      addSectionHeading(doc, "Executive Summary");
      addBodyText(doc, analysis.executiveSummary);
      doc.moveDown(0.5);
    }

    for (const type of SECTION_ORDER) {
      const insights = analysis.insights.filter((insight) => insight.type === type);
      if (insights.length === 0) continue;

      addSectionHeading(doc, SECTION_LABELS[type]);

      for (const insight of insights) {
        doc.font("Helvetica-Bold").fontSize(12.5).fillColor(TEXT_COLOR).text(insight.title);
        doc
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .fillColor(MUTED_COLOR)
          .text(`Mentioned in ${insight.evidenceCount} of ${analysis.documentCount} documents`);
        doc.moveDown(0.3);
        addBodyText(doc, insight.description);
        doc.moveDown(0.2);

        for (const citation of insight.citations) {
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .fillColor(MUTED_COLOR)
            .text(`• "${citation.quote}" (${citation.chunk.document.filename})`, {
              indent: 10,
            });
        }
        doc.moveDown(0.8);
      }
    }

    doc.end();
  });
}

function addSectionHeading(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > PAGE_MARGIN) doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(PRIMARY_COLOR).text(text);
  doc.moveDown(0.4);
}

function addBodyText(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10.5).fillColor(TEXT_COLOR).text(text, { align: "left" });
}
