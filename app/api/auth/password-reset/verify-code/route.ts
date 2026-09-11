import { NextResponse } from "next/server";
import { z } from "zod";
import { peekVerificationCode } from "@/lib/auth/verification";

const VerifyCodeSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  code: z.string().trim().length(6),
});

// Non-consuming: only for immediate "is this code right" UI feedback
// before showing the new-password form. The real, code-spending check
// happens again in /password-reset/confirm — this endpoint alone is not
// the authorization boundary for actually changing the password.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = VerifyCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await peekVerificationCode(parsed.data.email, parsed.data.code);

  if (result === "invalid") {
    return NextResponse.json({ error: "Incorrect reset code." }, { status: 400 });
  }
  if (result === "expired") {
    return NextResponse.json(
      { error: "This code has expired. Request a new one." },
      { status: 400 }
    );
  }

  return NextResponse.json({ verified: true }, { status: 200 });
}
