import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { consumeEmailProofToken } from "@/lib/auth/verification";
import { enqueueWelcomeEmail } from "@/lib/queue/email";
import { validateEmail, validateFullName, isPasswordValid } from "@/lib/validation/auth";

// Never trust the client alone: the same rules the sign-up form checks in
// real time are re-checked here, server-side, before anything touches the
// database. Zod validates shape; the shared validators re-check the actual
// business rules (letters-only name, 2+ words, email shape, password
// requirements) so client and server can't drift apart.
const RegisterSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1)
    .refine((v) => validateFullName(v) === null, "Invalid full name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .refine((v) => validateEmail(v) === null, "Invalid email address"),
  password: z.string().refine((v) => isPasswordValid(v), "Password does not meet requirements"),
  // Optional — set only when the sign-up form's "Verify email" flow
  // (app/api/auth/presignup-verify/*) already confirmed this exact email.
  // Same "never trust the client alone" rule applies here too: this is an
  // opaque bearer token that gets independently redeemed below via
  // consumeEmailProofToken, not a bare "trust me, I verified" flag.
  emailVerificationToken: z.string().optional(),
});

export async function POST(request: Request) {
  // The plaintext password only ever exists in memory, for the lifetime of
  // this request. Never log `body`, `parsed`, or `password` — including in
  // a future catch block or error handler added here. Only `passwordHash`
  // (never the plaintext) reaches the database, and only `id`/`email` are
  // ever returned to the client — see the response below.
  const body: unknown = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const { fullName, email, password, emailVerificationToken } = parsed.data;

  const passwordHash = await hashPassword(password);

  // No pre-flight findUnique: a separate check-then-act step leaves a race
  // window where two concurrent requests for the same email can both pass
  // the check before either has created a row. Instead, the database's
  // unique constraint on `email` is the single, atomic source of truth —
  // create() is attempted directly, and a conflict (P2002) is caught below
  // rather than prevented in advance. This makes the endpoint idempotent:
  // no matter how many times or how close together the same email is
  // submitted, exactly one account is ever created and every other attempt
  // converges to the same clean 409.
  //
  // The proof-token redemption happens inside this same transaction, after
  // create() succeeds, not before: creating first means a genuine P2002
  // race (someone else grabbed this exact email in the narrow window since
  // presignup-verify/request checked) aborts the whole transaction before
  // the token is ever touched, so it isn't wasted — the user can immediately
  // retry with the same token instead of restarting the OTP flow.
  let user: { id: string; email: string };
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: fullName,
          email,
          passwordHash,
        },
        select: { id: true, email: true },
      });

      if (emailVerificationToken) {
        const proven = await consumeEmailProofToken(email, emailVerificationToken, tx);
        if (proven) {
          await tx.user.update({ where: { id: created.id }, data: { emailVerified: new Date() } });
        }
      }

      return created;
    });
  } catch (error) {
    const isUniqueConflict =
      error instanceof Error && "code" in error && error.code === "P2002";
    if (isUniqueConflict) {
      return NextResponse.json(
        { error: "This email is already registered." },
        { status: 409 }
      );
    }
    throw error;
  }

  // FR-2: verification doesn't block sign-up or app use, only the first
  // analysis. No verification email is sent here for the default path —
  // it's only triggered when the user clicks "Verify now" on the dashboard
  // banner, via /api/auth/verify/resend. The optional pre-signup "Verify
  // email" flow above is the one exception: if a valid proof token was
  // redeemed just now, this account was already created verified, and the
  // dashboard banner simply won't show for it.

  // The welcome email is best-effort: it's queued only after the account
  // row above has actually committed, but a failure here (e.g. Redis is
  // down) must never turn a successful account creation into an error
  // response — so the enqueue failure is swallowed, not rethrown.
  try {
    await enqueueWelcomeEmail(user.email, fullName);
  } catch {
    // Intentionally ignored — see comment above.
  }

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
