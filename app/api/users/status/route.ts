import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PROJECT_LIMITS } from "@/lib/quota/checks";

// Placeholder stand-in for a real session lookup — there's no login/session
// system yet, so this just looks a user up by the email carried through the
// client-side flow. Not an auth boundary; do not treat this as one once
// real sessions exist.
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Missing email." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { name: true, email: true, emailVerified: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    verified: user.emailVerified !== null,
    projectLimit: PROJECT_LIMITS[user.plan],
  });
}
