import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { activateProSubscription } from "@/lib/billing/subscription";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logPaymentEvent } from "@/lib/billing/payment-log";

// Gate 1 exception (api-route-creation skill): this route is one of the
// two unauthenticated-by-design routes in the product (the other is
// /api/demo). Trust comes entirely from the signature check below, not a
// session.

// Deliberately lenient — Paystack's exact payload shape per event type
// isn't something we can fully pin down without a live test delivery
// (their docs describe fields loosely; see the field-by-field notes
// below). `.passthrough()` keeps unknown fields intact rather than
// stripping them, so the full payload is still recorded on WebhookEvent
// even if we don't read every field yet.
const WebhookPayloadSchema = z
  .object({
    event: z.string(),
    data: z
      .object({
        reference: z.string().optional(),
        status: z.string().optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
        customer: z
          .object({ email: z.string().email(), customer_code: z.string().optional() })
          .optional(),
        plan: z.object({ plan_code: z.string().optional() }).optional(),
        subscription_code: z.string().optional(),
        email_token: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// billing-webhook-procedure skill: verify -> idempotency -> record -> act
// -> mark, in that exact order. Acting before verifying, or before the
// idempotency lookup, is the one thing this route must never do.
export async function POST(request: Request) {
  // 0. Rate limit BEFORE touching the body — this route is unauthenticated
  // by design (see the Gate 1 exception note above), so it's the one
  // billing endpoint anyone on the internet can hit directly. Keyed by IP
  // rather than a session (there isn't one). 120/min is generous for
  // legitimate Paystack delivery bursts (retries, multiple events firing
  // close together) while still bounding a flood. security.md: "Rate
  // limiting and abuse."
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const withinRateLimit = await checkRateLimit(`billing-webhook:ip:${ip}`, 120, 60);
  if (!withinRateLimit) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // 1. Verify FIRST. Paystack's x-paystack-signature is a computed
  // HMAC-SHA512 of the RAW request body, keyed with the secret key — not
  // a plain stored-value comparison like the previous Flutterwave
  // integration's verif-hash. Must hash request.text() (the exact bytes
  // Paystack signed), not a re-serialized JSON.parse of it — re-stringifying
  // can reorder keys or change whitespace and silently break verification.
  const rawText = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey || !signature) {
    await logPaymentEvent({
      source: "webhook",
      event: bestEffortEventName(rawText),
      reference: bestEffortReference(rawText),
      status: "signature_invalid",
      signatureValid: false,
      activated: false,
      errorMessage: !secretKey ? "PAYSTACK_SECRET_KEY not configured." : "Missing x-paystack-signature header.",
      rawPayload: bestEffortParse(rawText),
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const expectedSignature = crypto.createHmac("sha512", secretKey).update(rawText).digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureValid =
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!signatureValid) {
    // A failed signature check is the one case where the payload can't be
    // trusted at all — still logged (best-effort, un-trusted) so a stream
    // of these is visible as a signal of a misconfigured secret or an
    // actual forgery attempt, not silently dropped.
    await logPaymentEvent({
      source: "webhook",
      event: bestEffortEventName(rawText),
      reference: bestEffortReference(rawText),
      status: "signature_invalid",
      signatureValid: false,
      activated: false,
      errorMessage: "x-paystack-signature did not match the computed HMAC.",
      rawPayload: bestEffortParse(rawText),
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawBody: unknown = JSON.parse(rawText);
  const parsed = WebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    await logPaymentEvent({
      source: "webhook",
      event: bestEffortEventName(rawText),
      reference: bestEffortReference(rawText),
      status: "invalid_payload",
      signatureValid: true,
      activated: false,
      errorMessage: "Payload did not match the expected webhook shape.",
      rawPayload: rawBody as Prisma.InputJsonValue,
    });
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }
  const payload = parsed.data;

  // Not every event carries data.reference (subscription.disable's
  // documented payload doesn't) — fall back to a content hash so a
  // genuine retry of the same delivery still dedupes correctly, without
  // ever leaving WebhookEvent.txRef (unique, non-null) unset. Field is
  // still named txRef (Flutterwave-era name) — schema.prisma's
  // WebhookEvent is provider-agnostic, only the `provider` value changed.
  const txRef =
    payload.data.reference ??
    (payload.data.subscription_code
      ? `${payload.event}:${payload.data.subscription_code}`
      : undefined) ??
    `${payload.event}:${crypto.createHash("sha256").update(rawText).digest("hex")}`;

  // 2. Idempotency check SECOND, before any action.
  const seen = await prisma.webhookEvent.findUnique({ where: { txRef } });
  if (seen) {
    await logPaymentEvent({
      source: "webhook",
      event: payload.event,
      reference: txRef,
      status: "duplicate",
      signatureValid: true,
      activated: seen.processed,
      rawPayload: rawBody as Prisma.InputJsonValue,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 3. Record THIRD, before acting — if the process dies mid-handling,
  // this row shows what arrived. Stores rawBody (the true full payload,
  // including anything the lenient schema above doesn't model) rather
  // than the Zod-parsed value, whose `.passthrough()` fields don't
  // structurally match Prisma's JSON input type.
  await prisma.webhookEvent.create({
    data: {
      provider: "paystack",
      txRef,
      payload: rawBody as Prisma.InputJsonValue,
      processed: false,
    },
  });

  // 4. Act FOURTH, by event type.
  const { userId, activated } = await handleBillingEvent(payload.event, payload.data);

  // Log the fully-processed outcome — after acting, so `activated` reflects
  // what actually happened, not just what was requested.
  await logPaymentEvent({
    userId,
    source: "webhook",
    event: payload.event,
    reference: txRef,
    status: payload.data.status ?? payload.event,
    amountKobo: payload.data.amount,
    currency: payload.data.currency,
    customerEmail: payload.data.customer?.email,
    planCode: payload.data.plan?.plan_code,
    subscriptionCode: payload.data.subscription_code,
    signatureValid: true,
    activated,
    rawPayload: rawBody as Prisma.InputJsonValue,
  });

  // 5. Mark processed FIFTH.
  await prisma.webhookEvent.update({ where: { txRef }, data: { processed: true } });

  // Never 5xx for a business-logic outcome already handled — that just
  // makes Paystack retry an event this route already recorded.
  return NextResponse.json({ ok: true }, { status: 200 });
}

type WebhookData = {
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  customer?: { email: string; customer_code?: string };
  plan?: { plan_code?: string };
  subscription_code?: string;
  email_token?: string;
};

async function handleBillingEvent(
  event: string,
  data: WebhookData
): Promise<{ userId: string | null; activated: boolean }> {
  const email = data.customer?.email;
  if (!email) {
    console.error(`[billing/webhook] ${event} payload missing customer.email; skipping.`);
    return { userId: null, activated: false };
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`[billing/webhook] ${event} for unknown user ${email}; skipping.`);
    return { userId: null, activated: false };
  }

  const proPlanCode = process.env.PAYSTACK_PRO_PLAN_CODE ?? "";

  if (event === "charge.success" && data.status === "success") {
    // Successful charge — first one or a renewal, activateProSubscription's
    // upsert covers both. This is one of two independent confirmation
    // paths for the same event (see the verify route, which fires on the
    // checkout redirect) — either can arrive first, and activating twice
    // for the same user is safe.
    await activateProSubscription({
      userId: user.id,
      planCode: proPlanCode,
      customerCode: data.customer?.customer_code,
      // Opportunistic: cheap to capture here if present, saves a
      // findActiveSubscription round-trip at cancel time later — but
      // never required, since cancel resolves both fresh if unset.
      subscriptionCode: data.subscription_code,
      emailToken: data.email_token,
    });
    return { userId: user.id, activated: true };
  }

  if (event === "invoice.payment_failed") {
    // Failed recurring charge. PAST_DUE only — the 5-day grace period
    // this starts is closed by the daily billing-enforcement job, never
    // here (AGENTS.md rule 12; billing-webhook-procedure skill).
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { status: "PAST_DUE" },
    });
    return { userId: user.id, activated: false };
  }

  if (event === "subscription.disable") {
    // Fires both for a self-serve cancel and for Paystack's own handling
    // of a subscription that's stopped renewing — either way, this only
    // flags the subscription to lapse at the period the customer already
    // paid for; the enforcement job applies the actual downgrade once
    // currentPeriodEnd has passed (FR-35: "takes effect at period end").
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { cancelAtPeriodEnd: true },
    });
    return { userId: user.id, activated: false };
  }

  // Any other event type (transfers, refunds, etc.) — not something this
  // product's billing model acts on; recorded via the WebhookEvent row
  // above regardless, so nothing is silently lost.
  return { userId: user.id, activated: false };
}

// Best-effort helpers for logging a payload we can't fully trust yet (bad
// signature) or couldn't validate (bad shape) — never used for anything
// that acts on the payment, only for making the audit trail readable.
function bestEffortParse(rawText: string): Prisma.InputJsonValue | undefined {
  try {
    return JSON.parse(rawText) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function bestEffortReference(rawText: string): string {
  const parsed = bestEffortParse(rawText);
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    const data = (parsed as { data?: unknown }).data;
    if (data && typeof data === "object" && "reference" in data) {
      const reference = (data as { reference?: unknown }).reference;
      if (typeof reference === "string" && reference.length > 0) return reference;
    }
  }
  return `unverified:${crypto.createHash("sha256").update(rawText).digest("hex")}`;
}

function bestEffortEventName(rawText: string): string {
  const parsed = bestEffortParse(rawText);
  if (parsed && typeof parsed === "object" && "event" in parsed) {
    const event = (parsed as { event?: unknown }).event;
    if (typeof event === "string" && event.length > 0) return event;
  }
  return "unknown";
}
