import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationCode, createEmailProofToken } from "@/lib/auth/verification";

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  code: z.string().trim().length(6),
});

type Outcome =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "expired" };

// Pre-account counterpart to /api/auth/verify: this is a real single-use
// spend of the code (unlike password-reset's verify-code, which only peeks
// — nothing later in this flow needs the code again). A correct code earns
// a longer-lived opaque proof token instead of immediately flipping a
// User.emailVerified column, since there's no User row yet to flip it on —
// the token is what register() redeems later to set it at account creation.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email, code } = parsed.data;

  // Atomic: consuming the OTP code and issuing the proof token must succeed
  // together. Two separate calls would leave a window where the code is
  // already spent but the create failed (e.g. a DB hiccup) — the user would
  // be stuck with no way to prove they'd verified, forced to request a
  // brand new code for no real reason.
  const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    const codeResult = await consumeVerificationCode(email, code, tx);
    if (codeResult !== "verified") {
      return { ok: false, reason: codeResult };
    }
    const token = await createEmailProofToken(email, tx);
    return { ok: true, token };
  });

  if (!outcome.ok) {
    if (outcome.reason === "invalid") {
      return NextResponse.json({ error: "Incorrect verification code." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "This code has expired. Request a new one." },
      { status: 400 }
    );
  }

  return NextResponse.json({ verified: true, token: outcome.token }, { status: 200 });
}
