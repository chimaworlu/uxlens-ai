import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { validateEmail, validateFullName } from "@/lib/validation/auth";
import { createVerificationCode } from "@/lib/auth/verification";
import { enqueueVerificationEmail } from "@/lib/queue/email";
import { getSessionUserId } from "@/lib/auth/session";

// FR-39: name saves immediately, no confirmation step; email requires
// re-verification before analysis can run again — email is optional here
// specifically so a name-only save (the common case) never has to touch
// the re-verification path at all.
const UpdateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((v) => validateFullName(v) === null, "Enter a valid full name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => validateEmail(v) === null, "Enter a valid email address")
    .optional(),
});

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, email } = parsed.data;

  const current = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!current) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  const emailChanged = email !== undefined && email !== current.email;

  if (emailChanged) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "This email is already registered." }, { status: 409 });
    }
  }

  const user = await prisma.user
    .update({
      where: { id: userId },
      data: {
        name,
        // Amendment to FR-2: an email change resets emailVerified so
        // analysis is gated again until the new address is confirmed,
        // reusing the exact same verify-pending flow as initial signup
        // (the dashboard's existing banner + /api/auth/verify) — nothing
        // email-specific needs to change there, it just keys off
        // emailVerified being null again.
        ...(emailChanged ? { email, emailVerified: null } : {}),
      },
      select: { name: true, email: true, emailVerified: true },
    })
    .catch(() => null);

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  if (emailChanged) {
    const code = await createVerificationCode(user.email);
    await enqueueVerificationEmail(user.email, code);
  }

  return NextResponse.json({ name: user.name, email: user.email, emailChanged });
}
