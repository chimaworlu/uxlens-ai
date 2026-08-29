// Writes to PaymentLog (prisma/schema.prisma) — the append-only audit
// trail every billing route below feeds, regardless of outcome. Unlike
// WebhookEvent (dedup-by-txRef, updated in place for idempotency),
// PaymentLog takes one new row per event and is never updated: the point
// is to be able to answer "what did Paystack actually tell us, and when"
// independent of whatever Subscription/User.plan currently say — the most
// trusted layer to reconcile against if application state and Paystack's
// own dashboard ever disagree.
//
// Relative import with an explicit .ts extension, not the "@/" alias —
// same worker/script-compatibility constraint as lib/billing/paystack.ts.
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "@prisma/client";

export async function logPaymentEvent(params: {
  userId?: string | null;
  source: "checkout" | "webhook" | "verify";
  event: string;
  reference: string;
  status: string;
  amountKobo?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  planCode?: string | null;
  subscriptionCode?: string | null;
  signatureValid?: boolean | null;
  activated: boolean;
  errorMessage?: string | null;
  rawPayload?: Prisma.InputJsonValue | null;
}): Promise<void> {
  await prisma.paymentLog.create({
    data: {
      userId: params.userId ?? null,
      provider: "paystack",
      source: params.source,
      event: params.event,
      reference: params.reference,
      status: params.status,
      amountKobo: params.amountKobo ?? null,
      currency: params.currency ?? null,
      customerEmail: params.customerEmail ?? null,
      planCode: params.planCode ?? null,
      subscriptionCode: params.subscriptionCode ?? null,
      signatureValid: params.signatureValid ?? null,
      activated: params.activated,
      errorMessage: params.errorMessage ?? null,
      rawPayload: params.rawPayload ?? undefined,
    },
  });
}
