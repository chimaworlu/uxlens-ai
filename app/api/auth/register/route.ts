import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
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

  const { fullName, email, password } = parsed.data;

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
  let user: { id: string; email: string };
  try {
    user = await prisma.user.create({
      data: {
        name: fullName,
        email,
        passwordHash,
      },
      select: { id: true, email: true },
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
  // analysis. No verification email is sent here — it's only triggered
  // when the user clicks "Verify now" on the dashboard banner, via
  // /api/auth/verify/resend.

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
