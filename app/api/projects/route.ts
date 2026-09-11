import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { checkProjectQuota, getWritableProjectIds, QuotaExceededError } from "@/lib/quota/checks";
import { getSessionUserId } from "@/lib/auth/session";

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name } = parsed.data;

  try {
    await checkProjectQuota(userId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const project = await prisma.project.create({
    data: { userId, name },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json(project, { status: 201 });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [projects, writableIds] = await Promise.all([
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { documents: true } },
        analyses: {
          orderBy: { version: "desc" },
          take: 1,
          select: { status: true, completedAt: true },
        },
      },
    }),
    // FR-36: one query for the whole list instead of checking each
    // project individually (see getWritableProjectIds's own note).
    getWritableProjectIds(userId),
  ]);

  return NextResponse.json({
    projects: projects.map(({ _count, analyses, ...project }) => ({
      ...project,
      documentCount: _count.documents,
      analysisStatus: analyses[0]?.status ?? null,
      analysisCompletedAt: analyses[0]?.completedAt ?? null,
      readOnly: !writableIds.has(project.id),
    })),
  });
}
