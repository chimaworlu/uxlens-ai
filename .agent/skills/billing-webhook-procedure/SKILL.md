---
name: billing-webhook-procedure
description: How to build or modify anything money-related in UXLens AI — Paystack checkout, the payment webhook handler, subscription state changes, plan upgrades or downgrades, the grace period, or the billing-enforcement job. Load this skill before touching any billing, payment, subscription, or Paystack code.
---

# Billing Webhook Procedure

Teaches the one ordered spine all five billing surfaces share (checkout, webhook, grace period, enforcement job, portal). The laws live in `money-and-billing.md` and `security.md`. This skill teaches the order, because acting before verifying — or before the idempotency check — breaks money flows while passing every individual rule.

## The procedure — webhook handler

1. **Verify first.** Compute an HMAC-SHA512 of the *raw* request body using the Paystack secret key, and compare it to the `x-paystack-signature` header. No match (or hashing a re-serialized/re-parsed body instead of the raw bytes) → respond 401 and stop. An unverified payload is untrusted input; nothing else happens to it (`security.md`).
2. **Idempotency check second.** Look up the payload's `txRef` (Paystack's `data.reference`, falling back to a content hash for events that don't carry one) in `WebhookEvent`. Already exists → respond 200 (so Paystack stops retrying) and do nothing else. Webhooks replay; that's normal, not an edge case.
3. **Record third.** Insert the `WebhookEvent` row (`txRef` unique, `processed: false`, full payload in `payload`) before acting. If the process dies mid-handling, the record shows what arrived.
4. **Act fourth**, by event type:
   - `charge.success` → set subscription `ACTIVE`, extend `currentPeriodEnd`.
   - `invoice.payment_failed` → set `PAST_DUE`. Do not downgrade here — the 5-day grace period belongs to the enforcement job, not the webhook.
   - `subscription.disable` → set `cancelAtPeriodEnd: true`. Downgrade happens at period end, not now.
5. **Log the outcome.** Write a `PaymentLog` row (`lib/billing/payment-log.ts`'s `logPaymentEvent`) after acting, with `activated` reflecting what actually happened. `PaymentLog` is separate from `WebhookEvent`: it's append-only (one row per event, never updated), it's fed by all three billing surfaces (checkout, webhook, verify), and it's the most trusted layer to reconcile against if `Subscription`/`User.plan` and Paystack's own dashboard ever disagree. Log rejected/failed attempts too (bad signature, bad payload, duplicate) — not just successes — so the trail is genuinely complete.
6. **Mark processed sixth.** Set `processed: true` on the `WebhookEvent` row.
7. Respond 200. Never 5xx for a business-logic outcome you handled — that makes Paystack retry a webhook you already processed.

## The procedure — the other surfaces

7. **Checkout** (`/api/billing/checkout`): authenticated route (all four gates from `api-route-creation`), initializes a Paystack transaction referencing the Pro plan_code, NGN only, ₦3,000/month (300000 kobo), single Pro tier. No amount computed client-side; the price is server config.
8. **Enforcement job** (daily, `cleanup` queue): find subscriptions `PAST_DUE` for more than 5 days → set plan to `FREE`. This job is what ends the grace period; without it, `PAST_DUE` users keep Pro forever (AGENTS.md rule 12). Idempotent: running twice downgrades nobody twice.
9. **Downgrade effects**: over-cap projects become read-only — upload and analysis disabled, chat still available within free daily caps. Nothing is deleted, ever, by any billing state change (FR-36).
10. **Portal** (`/api/billing/portal`): usage meters shown to the user derive from the same `UsageRecord` counts the enforcement checks use — displayed usage and enforced usage must never diverge (`money-and-billing.md`). Self-serve cancel (`POST`) resolves the customer's `{subscription_code, email_token}` pair from Paystack fresh at cancel time (via `GET /subscription?plan=...`) rather than depending on having captured it earlier from a webhook.

## Skeleton

```typescript
// /app/api/billing/webhook/route.ts
export async function POST(req: Request) {
  // 1. verify FIRST — HMAC over the RAW body, not a re-parsed one
  const rawText = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(rawText).digest("hex");
  if (!signature || !timingSafeEqual(signature, expected))
    return new Response("unauthorized", { status: 401 });

  const payload = JSON.parse(rawText);
  const txRef = payload?.data?.reference ?? contentHashFallback(rawText);

  // 2. idempotency SECOND — before any action
  const seen = await prisma.webhookEvent.findUnique({ where: { txRef } });
  if (seen) return new Response("ok", { status: 200 }); // already handled; stop retries

  // 3. record THIRD
  await prisma.webhookEvent.create({
    data: { provider: "paystack", txRef, payload, processed: false },
  });

  // 4. act FOURTH (charge.success / invoice.payment_failed / subscription.disable)
  const { userId, activated } = await handleBillingEvent(payload.event, payload.data); // PAST_DUE here; downgrade only in the daily job

  // 5. log FIFTH — the trusted audit trail, fed by checkout/webhook/verify alike
  await logPaymentEvent({ userId, source: "webhook", event: payload.event, reference: txRef, activated, rawPayload: payload, /* ...status, amount, etc. */ });

  // 6. mark processed SIXTH
  await prisma.webhookEvent.update({ where: { txRef }, data: { processed: true } });

  return new Response("ok", { status: 200 });
}
```

## Traps

- Acting on the payload before the signature check, or before the `txRef` lookup. The order is the rule.
- Computing the HMAC over `JSON.stringify(JSON.parse(rawText))` instead of the raw text itself — re-serializing can reorder keys or change whitespace and silently break verification (Paystack signs the exact bytes it sent).
- Downgrading inside the webhook on a failed charge. Failed charge means `PAST_DUE` + grace period; the daily job does the downgrade on day 5.
- Returning 5xx after successfully handling an event. Paystack retries, and now your idempotency check is the only thing between the user and a double charge — don't lean on it unnecessarily.
- Deleting or archiving anything on downgrade. Read-only, chattable within free caps, nothing deleted (FR-36).
- Showing the user a usage number computed differently from the enforced one.
- Any USD amount, symbol, or price appearing anywhere user-facing. NGN only (NG-7). Remember Paystack amounts are in kobo (× 100) — a bug that sends whole naira as kobo charges 1/100th of the intended price.
- Testing with the real Paystack secret committed in a fixture. Secrets never enter the repo (`git-conventions.md`).

## Verify before done

- [ ] Webhook order is verify → idempotency → record → act → log → mark, exactly.
- [ ] Signature is verified against the raw request body, not a re-parsed/re-serialized one.
- [ ] Every billing surface (checkout, webhook, verify) writes a `PaymentLog` row for every outcome it produces, including rejections and failures, not just successes.
- [ ] Failed charge sets `PAST_DUE`; only the daily job downgrades, at day 5+.
- [ ] Downgrade deletes nothing; read-only projects still chat within free caps.
- [ ] All user-facing amounts NGN; price lives in server config (and is correctly converted to/from kobo at every API boundary).
- [ ] Displayed usage and enforced usage share one source.
- [ ] Tests: same `txRef` delivered twice → subscription state changes once; unsigned/mis-signed payload → 401 and no `WebhookEvent` row; enforcement job run twice on a day-6 `PAST_DUE` sub → one downgrade; downgraded user's over-cap project → analysis blocked, chat allowed, data intact.
