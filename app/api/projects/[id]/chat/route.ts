import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { checkChatQuota, QuotaExceededError } from "@/lib/quota/checks";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { buildChatContext } from "@/lib/pipeline/chat/retrieve";
import { streamAnswer } from "@/lib/pipeline/chat/respond";
import { extractCitations } from "@/lib/pipeline/chat/citations";
import { stripEmDash } from "@/lib/pipeline/analysis/text";

const HISTORY_TURNS = 10;

const QuestionSchema = z.object({ question: z.string().trim().min(1).max(2000) });

// A bare "hi" has no research keywords for the search path (below) to
// match, so on a large project it would otherwise hit the FR-30 no-match
// refusal meant for genuine off-topic research questions — a jarring
// "your research doesn't cover this" for someone just saying hello. This
// exempts that gate for greetings only; anything else still goes through
// the normal grounding check. The model's own warm-greeting behavior
// (respond.ts's SYSTEM_PROMPT) handles the reply once it's let through.
const GREETING_PATTERN =
  /^(hi+|hey+|hello+|yo+|sup|howdy|hiya|greetings|good (morning|afternoon|evening))(\s+there)?[!.,\s]*$/i;

// PRD Section 6, Stage 5 / FR-26-30: a persistent, project-scoped chat
// thread grounded in that project's documents, streamed via SSE. Every
// check below returns a plain JSON error before the stream opens — once
// streaming starts there's no clean way to report a mid-stream refusal, so
// all the gating happens up front (mirrors analysis/route.ts's exact
// status-code/reason shape, which the client's existing refusal-view
// pattern already understands).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailVerified: true },
  });
  // .agent/rules/security.md / PRD: email verification gates chat, same as
  // analysis.
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Please verify your email before using chat." },
      { status: 403 }
    );
  }

  const readyDocumentCount = await prisma.document.count({
    where: { projectId, status: "READY" },
  });
  if (readyDocumentCount === 0) {
    return NextResponse.json(
      { error: "Upload at least one document before you can chat.", reason: "no-documents" },
      { status: 422 }
    );
  }

  try {
    await checkChatQuota(userId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, reason: "quota" }, { status: 429 });
    }
    throw error;
  }

  // .agent/rules/security.md: burst cap on top of the daily quota — 10/min
  // per user, same checkRateLimit helper documents/presign/route.ts uses.
  const withinRateLimit = await checkRateLimit(`chat:${userId}`, 10, 60);
  if (!withinRateLimit) {
    return NextResponse.json(
      { error: "Too many messages at once. Please slow down.", reason: "rate-limit" },
      { status: 429 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = QuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { question } = parsed.data;

  // Fetched before the new user message is written below — sequenced, not
  // run in parallel with that create, so there's no race where this query
  // could pick up the just-written row and double it into the prompt
  // alongside the explicit "Question: ..." block in respond.ts.
  const [priorTurns, latestAnalysis, context] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    }),
    prisma.analysis.findFirst({
      where: { projectId, status: "READY" },
      orderBy: { version: "desc" },
      select: { executiveSummary: true },
    }),
    buildChatContext(projectId, question),
  ]);

  // FR-30: search found nothing to ground an answer in — refuse rather
  // than let the model improvise. Only reachable on large projects, where
  // buildChatContext actually searches instead of sending everything.
  // Checked before persisting the user message below, so a refused
  // question never ends up saved to history with no answer attached.
  if (context.usedSearch && context.chunks.length === 0 && !GREETING_PATTERN.test(question)) {
    return NextResponse.json(
      {
        error: "Your uploaded research doesn't cover this topic.",
        reason: "no-match",
      },
      { status: 422 }
    );
  }

  // Persisted now (before the model call) so the question is never lost
  // even if the provider call below fails outright.
  await prisma.chatMessage.create({ data: { projectId, role: "USER", content: question } });

  const history = priorTurns
    .reverse()
    .map((turn) => ({
      role: turn.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: turn.content,
    }));

  const chunkContentById = new Map(context.chunks.map((chunk) => [chunk.id, chunk.content]));

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      function send(payload: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      try {
        for await (const delta of streamAnswer({
          question,
          context,
          history,
          executiveSummary: latestAnalysis?.executiveSummary ?? null,
        })) {
          fullText += delta;
          send({ type: "delta", text: delta });
        }

        const { cleanedText, citations } = extractCitations(fullText, chunkContentById);

        const assistantMessage = await prisma.chatMessage.create({
          data: {
            projectId,
            role: "ASSISTANT",
            // Same hard guarantee Pass B/D apply to AI-written prose
            // (lib/pipeline/analysis/text.ts) — the prompt asks the model
            // not to use em dashes, this is what actually enforces it.
            content: stripEmDash(cleanedText),
            citations: { create: citations },
          },
          select: {
            id: true,
            citations: {
              select: {
                id: true,
                chunkId: true,
                chunk: { select: { document: { select: { filename: true } } } },
              },
            },
          },
        });

        await prisma.usageRecord.create({ data: { userId, kind: "chat_message" } });

        // One chip per distinct source document, not per citation — an
        // answer can cite the same chunk several times across an answer
        // (e.g. one bullet per matching row in a CSV), and the chip row
        // shouldn't repeat itself. Same dedupe convention citations/[id]
        // already uses for its "other documents" list.
        const seenFilenames = new Set<string>();
        const citationChips = assistantMessage.citations
          .filter((citation) => {
            const filename = citation.chunk.document.filename;
            if (seenFilenames.has(filename)) return false;
            seenFilenames.add(filename);
            return true;
          })
          .map((citation) => ({ id: citation.id, filename: citation.chunk.document.filename }));

        send({
          type: "done",
          messageId: assistantMessage.id,
          citations: citationChips,
        });
      } catch (error) {
        console.error(
          JSON.stringify({ event: "chat_stream_error", error: (error as Error).message })
        );
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
