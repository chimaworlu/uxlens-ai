import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createVerificationCode } from "@/lib/auth/verification";
import { enqueueVerificationEmail } from "@/lib/queue/email";
import { checkRateLimit } from "@/lib/security/rate-limit";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
});

// Optional, pre-account counterpart to /api/auth/verify/resend: lets the
// sign-up form's "Verify email" link send a code before the account exists,
// so there's no session/userId to key anything off of yet — every check
// here is keyed by the raw email (or, for the IP bucket, the caller's IP).
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email } = parsed.data;

  // Unlike /api/auth/password-reset/request (which must never reveal
  // whether an email has an account — an account-takeover-adjacent
  // surface), this runs mid-signup, where the user is about to hit this
  // exact same "already registered" 409 from /api/auth/register anyway if
  // they proceed. Surfacing it a step earlier is a UX improvement, not a
  // new information leak.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "This email is already registered. Sign in instead." },
      { status: 409 }
    );
  }

  // Three independent buckets, checked cheapest-first: a tight per-email
  // cooldown so the modal's 60s resend timer is actually enforced
  // server-side (not just a disabled button a scripted client can ignore),
  // a looser per-email hourly cap, and a per-IP hourly cap so an anonymous
  // caller can't OTP-bomb arbitrary third-party inboxes by rotating
  // emails — this route has no session to key off of the way most of the
  // rest of the app's rate limits do.
  const withinCooldown = await checkRateLimit(`presignup-verify-cooldown:${email}`, 1, 60);
  if (!withinCooldown) {
    return NextResponse.json(
      { error: "Please wait before requesting another code." },
      { status: 429 }
    );
  }
  const withinEmailLimit = await checkRateLimit(`presignup-verify-send:${email}`, 5, 3600);
  if (!withinEmailLimit) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinIpLimit = await checkRateLimit(`presignup-verify-send:ip:${ip}`, 20, 3600);
  if (!withinIpLimit) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const code = await createVerificationCode(email);
  await enqueueVerificationEmail(email, code);

  return NextResponse.json({ sent: true }, { status: 200 });
}
