import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { initiateCheckout, PaystackError } from "@/lib/billing/paystack";
import { SITE_URL } from "@/lib/seo";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logPaymentEvent } from "@/lib/billing/payment-log";
import { logger } from "@/lib/logger";

// FR-33: the only paid tier, NGN only. Server config, never a client-
// supplied amount — money-and-billing.md: "No amount computed client-side;
// the price is server config."
const PRO_PRICE_NGN = 3000;

export async function POST() {
  // Gate 1: auth (api-route-creation skill).
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // No resource-by-id ownership gate here — this creates a checkout link
  // for the signed-in user's own account, not a route touching another
  // resource. No request body to validate either (see PRO_PRICE_NGN above).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true },
  });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  if (user.plan === "PRO") {
    return NextResponse.json({ error: "You're already on the Pro plan." }, { status: 400 });
  }

  // security.md: "Rate limiting and abuse" — bounds how often a signed-in
  // user can mint a new checkout session (each call hits Paystack's API
  // and creates a fresh reference), well above any real retry pattern.
  const withinRateLimit = await checkRateLimit(`billing-checkout:${userId}`, 10, 3600);
  if (!withinRateLimit) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a while and try again." },
      { status: 429 }
    );
  }

  const proPlanCode = process.env.PAYSTACK_PRO_PLAN_CODE;
  if (!proPlanCode) {
    // Config error, not a user error — logged with full detail, user gets
    // a safe generic message (coding-standard.md).
    logger.error({ event: "billing_checkout_misconfigured" }, "PAYSTACK_PRO_PLAN_CODE is not configured.");
    return NextResponse.json({ error: "Billing isn't available right now." }, { status: 500 });
  }

  const reference = `uxlens-pro-${userId}-${crypto.randomUUID()}`;

  try {
    const { authorization_url } = await initiateCheckout({
      reference,
      amountKobo: PRO_PRICE_NGN * 100,
      // Lands back on the dashboard (project view), not the billing page —
      // Paystack appends ?reference=...&trxref=... to this URL on
      // redirect, which the dashboard picks up to verify and activate
      // (see app/(app)/projects/page.tsx and /api/billing/verify).
      callbackUrl: `${SITE_URL}/projects`,
      customerEmail: user.email,
      planCode: proPlanCode,
    });

    // First entry in this reference's PaymentLog trail — records that a
    // checkout was created, before Paystack has told us anything about
    // whether it was ever completed. A reference with only this row and no
    // later "webhook"/"verify" row is a visible, queryable abandoned
    // checkout, not a silent gap.
    await logPaymentEvent({
      userId,
      source: "checkout",
      event: "checkout.initiated",
      reference,
      status: "initiated",
      amountKobo: PRO_PRICE_NGN * 100,
      currency: "NGN",
      customerEmail: user.email,
      planCode: proPlanCode,
      activated: false,
    });

    return NextResponse.json({ link: authorization_url });
  } catch (error) {
    if (error instanceof PaystackError) {
      logger.error(
        { event: "billing_checkout_paystack_error", userId, reference, err: error.message },
        "Paystack checkout initiation failed."
      );
      await logPaymentEvent({
        userId,
        source: "checkout",
        event: "checkout.initiate_failed",
        reference,
        status: "failed",
        amountKobo: PRO_PRICE_NGN * 100,
        currency: "NGN",
        customerEmail: user.email,
        planCode: proPlanCode,
        activated: false,
        errorMessage: error.message,
      });
      return NextResponse.json(
        { error: "Couldn't start checkout. Please try again." },
        { status: 502 }
      );
    }
    throw error;
  }
}
