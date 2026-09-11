import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationCode } from "@/lib/auth/verification";
import { getSessionUserId } from "@/lib/auth/session";

const VerifySchema = z.object({
  code: z.string().trim().length(6),
});

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  const { code } = parsed.data;
  const result = await consumeVerificationCode(user.email, code);

  if (result === "invalid") {
    return NextResponse.json({ error: "Incorrect verification code." }, { status: 400 });
  }
  if (result === "expired") {
    return NextResponse.json(
      { error: "This code has expired. Request a new one." },
      { status: 400 }
    );
  }

  // FR-2: this is the one place email verification actually takes effect —
  // consumeVerificationCode itself only checks/spends the code.
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });

  return NextResponse.json({ verified: true }, { status: 200 });
}
