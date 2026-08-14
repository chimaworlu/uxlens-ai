import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createVerificationCode } from "@/lib/auth/verification";
import { enqueueVerificationEmail } from "@/lib/queue/email";

const ResendSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ResendSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found for this email." }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
  }

  const code = await createVerificationCode(email);
  await enqueueVerificationEmail(email, code);

  return NextResponse.json({ sent: true }, { status: 200 });
}
