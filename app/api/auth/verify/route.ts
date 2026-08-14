import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationCode } from "@/lib/auth/verification";

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  code: z.string().trim().length(6),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, code } = parsed.data;
  const result = await consumeVerificationCode(email, code);

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
    where: { email },
    data: { emailVerified: new Date() },
  });

  return NextResponse.json({ verified: true }, { status: 200 });
}
