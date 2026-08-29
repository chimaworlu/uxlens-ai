import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isPasswordValid } from "@/lib/validation/auth";
import { getSessionUserId } from "@/lib/auth/session";

// FR-40: requires the current password, not just a new one — this is
// distinct from the email-based reset in FR-3, and the current-password
// check is what keeps a stolen-but-still-logged-in session from being able
// to permanently lock out the real account owner.
const UpdatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().refine((v) => isPasswordValid(v), "Password does not meet requirements"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Same rule as register/password-reset: the plaintext password only
  // exists in memory for this request's lifetime. Never log body/parsed.
  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdatePasswordSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  // A Google-only account has no passwordHash to check against — this
  // route should be unreachable from that account's UI (see account
  // page's Google-sign-in variant), but never assume the client enforced
  // that; treat it as a hard rejection here too.
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account signs in with Google and has no password to change." },
      { status: 400 }
    );
  }

  const currentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentPasswordValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return NextResponse.json({ updated: true });
}
