import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueContactEmail } from "@/lib/queue/email";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateEmail, validateFullName } from "@/lib/validation/auth";
import { validateContactMessage } from "@/lib/validation/contact";

// Public, unauthenticated route (marketing page contact form) — no session
// to key anything off of, same as the presignup-verify routes. Reuses
// validateEmail and validateFullName from the sign-up form directly — same
// full-name requirement there too, by explicit choice, not a looser
// contact-specific rule.
const ContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((v) => validateFullName(v) === null, "Invalid name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .refine((v) => validateEmail(v) === null, "Invalid email address"),
  message: z
    .string()
    .trim()
    .min(1)
    .refine((v) => validateContactMessage(v) === null, "Message is too long"),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in every field with a valid value." }, { status: 400 });
  }

  // IP-only, not per-email: an anonymous form has no account to key a
  // per-user limit off, and this is what actually stops someone from
  // scripting repeated sends into the operator's own inbox.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinRateLimit = await checkRateLimit(`contact:ip:${ip}`, 5, 3600);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many messages sent. Please try again later." }, { status: 429 });
  }

  const { name, email, message } = parsed.data;
  await enqueueContactEmail(name, email, message);

  return NextResponse.json({ sent: true }, { status: 200 });
}
