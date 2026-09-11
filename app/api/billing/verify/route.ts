import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { verifyTransaction, PaystackError } from "@/lib/billing/paystack";
import { activateProSubscription } from "@/lib/billing/subscription";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logPaymentEvent } from "@/lib/billing/payment-log";
import { logger } from "@/lib/logger";

// Not in the PRD Section 7 route table (which only names checkout,
// webhook, and portal) — added because relying on the webhook alone means
// billing only ever activates once a public webhook URL is registered
// (ngrok in dev, a real domain in prod). Paystack's own docs treat
// verify-on-redirect as the primary confirmation path, not just an
// anti-tampering check, precisely because the webhook can be delayed,
// dropped, or (as here) simply unreachable — so this is a second,
// independent way the same "user paid" fact reaches the app, sharing
// activateProSubscription with the webhook so neither path can activate
// a subscription differently than the other.
const VerifyBodySchema = z.object({ reference: z.string().min(1) });

export async function POST(request: Request) {
  // Gate 1: auth.
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  // security.md: "Rate limiting and abuse" — this fires once automatically
  // on the checkout redirect (see the dashboard's effect that reads
  // ?reference=), so the cap stays generous enough to tolerate a page
  // refresh or two, while still bounding scripted reference-guessing
  // (each call also round-trips to Paystack's own verify API).
  const withinRateLimit = await checkRateLimit(`billing-verify:${userId}`, 30, 3600);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // Gate 3: input validation.
  const parsed = VerifyBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { reference } = parsed.data;

  // Idempotency first, same table the webhook uses — if the webhook (or an
  // earlier call to this same route, e.g. a page refresh) already recorded
  // this reference, don't re-verify or re-activate.
  const seen = await prisma.webhookEvent.findUnique({ where: { txRef: reference } });
  if (seen) {
    await logPaymentEvent({
      userId,
      source: "verify",
      event: "checkout.verify",
      reference,
      status: "duplicate",
      customerEmail: user.email,
      activated: seen.processed,
    });
    return NextResponse.json({ activated: true });
  }

  let transaction;
  try {
    transaction = await verifyTransaction(reference);
  } catch (error) {
    if (error instanceof PaystackError) {
      await logPaymentEvent({
        userId,
        source: "verify",
        event: "checkout.verify",
        reference,
        status: "verify_api_error",
        customerEmail: user.email,
        activated: false,
        errorMessage: error.message,
      });
      return NextResponse.json({ error: "Couldn't verify this payment." }, { status: 502 });
    }
    throw error;
  }

  if (transaction.status !== "success") {
    await logPaymentEvent({
      userId,
      source: "verify",
      event: "checkout.verify",
      reference,
      status: transaction.status,
      amountKobo: transaction.amount,
      currency: transaction.currency,
      customerEmail: transaction.customer.email,
      activated: false,
      rawPayload: transaction as unknown as Prisma.InputJsonValue,
    });
    return NextResponse.json({ activated: false, status: transaction.status });
  }

  // Never trust that a reference belongs to the signed-in user just
  // because they're the one who submitted it — check the verified
  // transaction's own customer email against the session's, so a user
  // can't activate Pro by feeding in someone else's payment reference.
  if (transaction.customer.email.toLowerCase() !== user.email.toLowerCase()) {
    logger.warn(
      { event: "billing_verify_customer_mismatch", reference, userId },
      "Payment reference belongs to a different customer than the session user; refusing to activate."
    );
    await logPaymentEvent({
      userId,
      source: "verify",
      event: "checkout.verify",
      reference,
      status: "customer_mismatch",
      amountKobo: transaction.amount,
      currency: transaction.currency,
      customerEmail: transaction.customer.email,
      activated: false,
      errorMessage: `Transaction customer (${transaction.customer.email}) does not match session user (${user.email}).`,
      rawPayload: transaction as unknown as Prisma.InputJsonValue,
    });
    return NextResponse.json({ error: "This payment doesn't belong to your account." }, { status: 403 });
  }

  const proPlanCode = process.env.PAYSTACK_PRO_PLAN_CODE ?? "";

  await prisma.webhookEvent.create({
    data: {
      provider: "paystack",
      txRef: reference,
      payload: transaction as unknown as Prisma.InputJsonValue,
      processed: false,
    },
  });

  await activateProSubscription({ userId, planCode: proPlanCode });

  await prisma.webhookEvent.update({ where: { txRef: reference }, data: { processed: true } });

  await logPaymentEvent({
    userId,
    source: "verify",
    event: "checkout.verify",
    reference,
    status: "success",
    amountKobo: transaction.amount,
    currency: transaction.currency,
    customerEmail: transaction.customer.email,
    planCode: proPlanCode,
    activated: true,
    rawPayload: transaction as unknown as Prisma.InputJsonValue,
  });

  return NextResponse.json({ activated: true });
}
