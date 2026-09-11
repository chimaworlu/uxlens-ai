import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createVerificationCode } from "@/lib/auth/verification";
import { enqueuePasswordResetEmail } from "@/lib/queue/email";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
});

const GENERIC_MESSAGE =
  "If an account exists for this email, we've sent a password reset code.";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email } = parsed.data;

  // Unlike /api/auth/register (where confirming "already registered" is
  // normal signup UX), password reset must never reveal whether an email
  // has an account — that's an account-enumeration/takeover-surface risk,
  // not a UX nicety. Same generic response either way; only the
  // find/create/enqueue below is skipped when there's no user.
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const code = await createVerificationCode(email);
    await enqueuePasswordResetEmail(email, code);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
