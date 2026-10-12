import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createVerificationCode } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email/nodemailer";
import { getSessionUserId } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found." }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
  }

  const code = await createVerificationCode(user.email);

  try {
    await sendVerificationEmail(user.email, code);
  } catch (error) {
    logger.error(
      { event: "verification_email_send_failed", err: error instanceof Error ? error.message : String(error) },
      "Failed to send verification email."
    );
    return NextResponse.json(
      { error: "Could not send a verification code. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true }, { status: 200 });
}
