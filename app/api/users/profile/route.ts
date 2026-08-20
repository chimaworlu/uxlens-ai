import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { validateFullName } from "@/lib/validation/auth";
import { getSessionUserId } from "@/lib/auth/session";

const UpdateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((v) => validateFullName(v) === null, "Enter a valid full name"),
});

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name } = parsed.data;

  const user = await prisma.user
    .update({ where: { id: userId }, data: { name }, select: { name: true } })
    .catch(() => null);

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  return NextResponse.json({ name: user.name });
}
