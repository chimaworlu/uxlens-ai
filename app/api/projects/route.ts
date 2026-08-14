import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { checkProjectQuota, QuotaExceededError } from "@/lib/quota/checks";

// email, not a real session — same placeholder identity mechanism used
// throughout onboarding/dashboard until real login/session exists.
const CreateProjectSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  name: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, name } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  try {
    await checkProjectQuota(user.id);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const project = await prisma.project.create({
    data: { userId: user.id, name },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json(project, { status: 201 });
}

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ projects });
}
