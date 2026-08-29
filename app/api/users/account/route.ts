import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { enqueueR2Cleanup } from "@/lib/queue/cleanup";
import { findActiveSubscription, disableSubscription, PaystackError } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/security/rate-limit";

// FR-38: account deletion. Typed-confirmation pattern matching project
// deletion (FR-5) — the client shows the same warning text either way, but
// the server never trusts that the client actually enforced it, so the
// confirmation email is re-checked here against the session's own email.
const DeleteAccountSchema = z.object({ confirmEmail: z.string().trim().toLowerCase().min(1) });

export async function DELETE(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const withinRateLimit = await checkRateLimit(`account-delete:${userId}`, 5, 3600);
  if (!withinRateLimit) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a while and try again." },
      { status: 429 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = DeleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true },
  });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  if (parsed.data.confirmEmail !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Email does not match your account." }, { status: 400 });
  }

  // FR-38: "If the user has an active Pro subscription, it is cancelled
  // immediately as part of this action, not left running against a
  // deleted account." Distinct from FR-35's self-serve cancel (which sets
  // cancelAtPeriodEnd and lets the enforcement job downgrade later) —
  // there's no "later" here, the account won't exist to downgrade.
  if (user.plan === "PRO") {
    const proPlanCode = process.env.PAYSTACK_PRO_PLAN_CODE;
    if (proPlanCode) {
      try {
        const paystackSub = await findActiveSubscription({ email: user.email, planCode: proPlanCode });
        if (paystackSub) {
          await disableSubscription({ code: paystackSub.subscription_code, token: paystackSub.email_token });
        }
      } catch (error) {
        if (error instanceof PaystackError) {
          // Never let a Paystack hiccup block account deletion — the user's
          // right to delete their data doesn't depend on a third-party API
          // being up. Logged for manual follow-up (a subscription left
          // active against a since-deleted account is a real cost leak,
          // just not one worth failing this request over).
          console.error(
            `[users/account] Failed to cancel Paystack subscription for deleted user ${userId}: ${error.message}`
          );
        } else {
          throw error;
        }
      }
    } else {
      console.error("[users/account] PAYSTACK_PRO_PLAN_CODE is not configured; skipping Paystack cancel.");
    }
  }

  // Captured before the cascade delete below removes these rows — same
  // pattern as project deletion (app/api/projects/[id]/route.ts): this is
  // the only chance to know which R2 objects need cleaning up. Covers
  // every document across every project this user owns.
  const documents = await prisma.document.findMany({
    where: { project: { userId } },
    select: { r2Key: true },
  });

  // Deleting the User row cascades to Project (-> Document, Analysis,
  // ChatMessage, ...), Subscription, UsageRecord, Account, and Session per
  // schema.prisma's onDelete: Cascade relations — projects, documents,
  // analysis versions, and chat history are all gone in this one
  // statement. PaymentLog and WebhookEvent intentionally do NOT cascade
  // (PaymentLog.userId is onDelete: SetNull) — financial audit trail
  // survives account deletion by design (money-and-billing.md).
  await prisma.user.delete({ where: { id: userId } });

  // .agent/rules/uploads-and-storage.md: R2 cleanup happens via the
  // cleanup queue, never synchronously in the request path — this is what
  // FR-38 means by "hard-deleted within 24 hours via the existing cleanup
  // job." The database rows above are already gone; this is just the
  // object storage side finishing asynchronously.
  await Promise.all(documents.map((document) => enqueueR2Cleanup(document.r2Key)));

  return new NextResponse(null, { status: 204 });
}
