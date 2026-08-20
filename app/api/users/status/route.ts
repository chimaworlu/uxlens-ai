import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PROJECT_LIMITS, DOCUMENT_LIMITS, STORAGE_LIMIT_BYTES } from "@/lib/quota/checks";
import { getSessionUserId } from "@/lib/auth/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    verified: user.emailVerified !== null,
    plan: user.plan,
    projectLimit: PROJECT_LIMITS[user.plan],
    documentLimit: DOCUMENT_LIMITS[user.plan],
    storageLimitBytes: STORAGE_LIMIT_BYTES[user.plan],
  });
}
