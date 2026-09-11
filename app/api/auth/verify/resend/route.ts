import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createVerificationCode } from "@/lib/auth/verification";
import { enqueueVerificationEmail } from "@/lib/queue/email";
import { getSessionUserId } from "@/lib/auth/session";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
  }

  const code = await createVerificationCode(user.email);
  await enqueueVerificationEmail(user.email, code);

  return NextResponse.json({ sent: true }, { status: 200 });
}
