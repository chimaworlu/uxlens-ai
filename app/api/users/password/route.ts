import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { isPasswordValid } from "@/lib/validation/auth";
import { getSessionUserId } from "@/lib/auth/session";

const UpdatePasswordSchema = z
  .object({
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

  const { newPassword } = parsed.data;
  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return NextResponse.json({ updated: true });
}
