import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationCode } from "@/lib/auth/verification";
import { hashPassword } from "@/lib/auth/password";
import { isPasswordValid } from "@/lib/validation/auth";

const ConfirmSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  code: z.string().trim().length(6),
  newPassword: z.string().refine((v) => isPasswordValid(v), "Password does not meet requirements"),
});

export async function POST(request: Request) {
  // Same rule as register: the plaintext password only exists in memory
  // for this request's lifetime. Never log body/parsed/newPassword.
  const body: unknown = await request.json().catch(() => null);
  const parsed = ConfirmSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, code, newPassword } = parsed.data;

  // This — not the earlier /verify-code peek — is the actual authorization
  // boundary: the code is spent here, at the moment it's used to allow the
  // password change, never trusting that an earlier peek was ever called.
  const result = await consumeVerificationCode(email, code);

  if (result === "invalid") {
    return NextResponse.json({ error: "Incorrect reset code." }, { status: 400 });
  }
  if (result === "expired") {
    return NextResponse.json(
      { error: "This code has expired. Request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  return NextResponse.json({ reset: true }, { status: 200 });
}
