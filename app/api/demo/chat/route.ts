import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getDemoProject } from "@/lib/demo";
import {
  DEMO_SESSION_COOKIE,
  DEMO_CHAT_SESSION_LIMIT,
  DEMO_CHAT_SESSION_WINDOW_SECONDS,
} from "@/lib/demo-session";
import { checkRateLimit, releaseRateLimit } from "@/lib/security/rate-limit";
import { buildChatContext } from "@/lib/pipeline/chat/retrieve";
import { streamAnswer } from "@/lib/pipeline/chat/respond";
import { extractCitations } from "@/lib/pipeline/chat/citations";
import { stripEmDash } from "@/lib/pipeline/analysis/text";
import { logger } from "@/lib/logger";

// Public equivalent of app/api/projects/:id/chat/route.ts — same
// pipeline (retrieve -> stream -> extract citations), three real
// differences:
//   1. No session/userId — anything a signed-in user's identity would
//      gate (email verification, per-user quota) doesn't apply here.
//   2. FR-31's daily/monthly quota is replaced by FR-37's 5-per-browser-
//      -session cap, enforced via the same checkRateLimit Redis counter
//      keyed by an anonymous cookie instead of a userId.
//   3. Prior-turn context comes from the request body (what the client's
//      own chat state already holds), not a DB history query — every demo
//      visitor shares one Project row, so a server-side history query
//      would leak other visitors' questions into this one's context.
const DemoChatSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

const GREETING_PATTERN =
  /^(hi+|hey+|hello+|yo+|sup|howdy|hiya|greetings|good (morning|afternoon|evening))(\s+there)?[!.,\s]*$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinIpLimit = await checkRateLimit(`demo:ip:${ip}`, 20, 60);
  if (!withinIpLimit) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const project = await getDemoProject();
  if (!project) {
    return NextResponse.json({ error: "Demo is not available right now." }, { status: 503 });
  }

  const sessionId = request.cookies.get(DEMO_SESSION_COOKIE)?.value ?? randomUUID();

  // FR-37: 5 messages per browser session, not FR-31's daily reset —
  // checked before the request body is even parsed, since nothing else
  // matters once this session is capped.
  const withinSessionLimit = await checkRateLimit(
    `demo-chat-session:${sessionId}`,
    DEMO_CHAT_SESSION_LIMIT,
    DEMO_CHAT_SESSION_WINDOW_SECONDS
  );
  if (!withinSessionLimit) {
    return NextResponse.json(
      { error: "You've reached the demo's 5-message limit for this session.", reason: "session-limit" },
      { status: 429 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = DemoChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { question, history: clientHistory } = parsed.data;

  const context = await buildChatContext(project.id, question);

  if (context.usedSearch && context.chunks.length === 0 && !GREETING_PATTERN.test(question)) {
    return NextResponse.json(
      { error: "This demo's research doesn't cover this topic.", reason: "no-match" },
      { status: 422 }
    );
  }

  const latestAnalysis = await prisma.analysis.findFirst({
    where: { projectId: project.id, status: "READY" },
    orderBy: { version: "desc" },
    select: { executiveSummary: true },
  });

  // Soft-deleted the instant it's written (deletedAt: now) rather than
  // left to accumulate — this is shared, public, ephemeral demo content,
  // never read back as "history" for anyone (see this file's own header
  // comment), so there's nothing to preserve past the 30-day retention
  // the existing daily prune job (lib/pipeline/chat/prune.ts, FR-32)
  // already enforces for every other soft-deleted chat message. The
  // citation panel still works during that window: it queries Citation
  // rows directly and never filters on the parent message's deletedAt.
  await prisma.chatMessage.create({
    data: { projectId: project.id, role: "USER", content: question, deletedAt: new Date() },
    select: { id: true },
  });

  const history = clientHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const chunkContentById = new Map(context.chunks.map((chunk) => [chunk.id, chunk.content]));

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      // Swallows enqueue-on-closed-controller errors: if the visitor closes
      // the tab or navigates away mid-answer, the runtime closes this
      // controller on its own, but the async work above (DB write,
      // citation extraction) keeps running and eventually calls send()
      // again — nothing left to deliver it to at that point, and the
      // message/citations already persisted above aren't lost either way.
      function send(payload: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client disconnected — nothing to do.
        }
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
            projectId: project.id,
            role: "ASSISTANT",
            content: stripEmDash(cleanedText),
            deletedAt: new Date(),
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

        const seenFilenames = new Set<string>();
        const citationChips = assistantMessage.citations
          .filter((citation) => {
            const filename = citation.chunk.document.filename;
            if (seenFilenames.has(filename)) return false;
            seenFilenames.add(filename);
            return true;
          })
          .map((citation) => ({ id: citation.id, filename: citation.chunk.document.filename }));

        send({ type: "done", messageId: assistantMessage.id, citations: citationChips });
      } catch (error) {
        logger.error({ event: "demo_chat_stream_error", err: (error as Error).message }, "Demo chat stream failed.");
        await releaseRateLimit(`demo-chat-session:${sessionId}`).catch(() => {});
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the runtime (client disconnected) — fine.
        }
      }
    },
  });

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  if (!request.cookies.get(DEMO_SESSION_COOKIE)) {
    response.cookies.set(DEMO_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}
