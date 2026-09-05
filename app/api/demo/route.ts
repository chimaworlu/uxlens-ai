import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDemoProject } from "@/lib/demo";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-session";

// FR-37: the public, unauthenticated entry point for the demo — no
// getSessionUserId call anywhere in this route, on purpose. Returns the
// same shape /api/analyses/:id already does (see that route) so the demo
// page can reuse the same rendering logic as the real Insights view.
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinRateLimit = await checkRateLimit(`demo:ip:${ip}`, 20, 60);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const project = await getDemoProject();
  if (!project) {
    return NextResponse.json({ error: "Demo is not available right now." }, { status: 503 });
  }

  const [projectRow, documents, analysis] = await Promise.all([
    prisma.project.findUnique({ where: { id: project.id }, select: { name: true } }),
    prisma.document.findMany({
      where: { projectId: project.id },
      select: { id: true, filename: true },
    }),
    prisma.analysis.findFirst({
      where: { projectId: project.id, status: "READY" },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        status: true,
        executiveSummary: true,
        documentCount: true,
        insights: {
          orderBy: [{ type: "asc" }, { rank: "asc" }],
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            rank: true,
            evidenceCount: true,
            citations: {
              select: {
                id: true,
                chunkId: true,
                quote: true,
                charStart: true,
                charEnd: true,
                chunk: { select: { document: { select: { filename: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const response = NextResponse.json({
    projectName: projectRow?.name ?? "Demo project",
    documents,
    analysis,
  });

  // Minted here, ahead of the first demo chat message, so the session cap
  // (lib/demo-session.ts) has something to key off of the moment the page
  // loads rather than racing the first chat send. No maxAge/expires — a
  // true session cookie, gone when the browser closes, matching FR-37's
  // "per browser session" cap.
  if (!request.cookies.get(DEMO_SESSION_COOKIE)) {
    response.cookies.set(DEMO_SESSION_COOKIE, randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}
