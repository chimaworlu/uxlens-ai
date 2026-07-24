---
name: billing-webhook-procedure
description: How to build or modify anything money-related in UXLens AI — Flutterwave checkout, the payment webhook handler, subscription state changes, plan upgrades or downgrades, the grace period, or the billing-enforcement job. Load this skill before touching any billing, payment, subscription, or Flutterwave code.
---

# Billing Webhook Procedure

Teaches the one ordered spine all five billing surfaces share (checkout, webhook, grace period, enforcement job, portal). The laws live in `money-and-billing.md` and `security.md`. This skill teaches the order, because acting before verifying — or before the idempotency check — breaks money flows while passing every individual rule.

## The procedure — webhook handler

1. **Verify first.** Check the `verif-hash` header against the stored Flutterwave secret. No match → respond 401 and stop. An unverified payload is untrusted input; nothing else happens to it (`security.md`).
2. **Idempotency check second.** Look up the payload's `txRef` in `WebhookEvent`. Already exists → respond 200 (so Flutterwave stops retrying) and do nothing else. Webhooks replay; that's normal, not an edge case.
3. **Record third.** Insert the `WebhookEvent` row (`txRef` unique, `processed: false`, full payload in `payload`) before acting. If the process dies mid-handling, the record shows what arrived.
4. **Act fourth**, by event type:
   - Successful charge → set subscription `ACTIVE`, extend `currentPeriodEnd`.
   - Failed charge → set `PAST_DUE`. Do not downgrade here — the 5-day grace period belongs to the enforcement job, not the webhook.
   - Cancellation → set `cancelAtPeriodEnd: true`. Downgrade happens at period end, not now.
5. **Mark processed fifth.** Set `processed: true` on the `WebhookEvent` row.
6. Respond 200. Never 5xx for a business-logic outcome you handled — that makes Flutterwave retry a webhook you already processed.

## The procedure — the other surfaces

7. **Checkout** (`/api/billing/checkout`): authenticated route (all four gates from `api-route-creation`), creates the Flutterwave Payment Plan link in NGN only, ₦3,000/month, single Pro tier. No amount computed client-side; the price is server config.
8. **Enforcement job** (daily, `cleanup` queue): find subscriptions `PAST_DUE` for more than 5 days → set plan to `FREE`. This job is what ends the grace period; without it, `PAST_DUE` users keep Pro forever (AGENTS.md rule 12). Idempotent: running twice downgrades nobody twice.
9. **Downgrade effects**: over-cap projects become read-only — upload and analysis disabled, chat still available within free daily caps. Nothing is deleted, ever, by any billing state change (FR-36).
10. **Portal** (`/api/billing/portal`): usage meters shown to the user derive from the same `UsageRecord` counts the enforcement checks use — displayed usage and enforced usage must never diverge (`money-and-billing.md`).

## Skeleton

```typescript
// /app/api/billing/webhook/route.ts
export async function POST(req: Request) {
  // 1. verify FIRST
  const signature = req.headers.get("verif-hash");
  if (!signature || signature !== process.env.FLW_VERIF_HASH)
    return new Response("unauthorized", { status: 401 });

  const payload = await req.json();
  const txRef = payload?.data?.tx_ref;
  if (!txRef) return new Response("bad payload", { status: 400 });

  // 2. idempotency SECOND — before any action
  const seen = await prisma.webhookEvent.findUnique({ where: { txRef } });
  if (seen) return new Response("ok", { status: 200 }); // already handled; stop retries

  // 3. record THIRD
  await prisma.webhookEvent.create({
    data: { provider: "flutterwave", txRef, payload, processed: false },
  });

  // 4. act FOURTH (successful charge / failed charge / cancellation)
  await handleBillingEvent(payload); // PAST_DUE here; downgrade only in the daily job

  // 5. mark processed FIFTH
  await prisma.webhookEvent.update({ where: { txRef }, data: { processed: true } });

  return new Response("ok", { status: 200 });
}
```

## Traps

- Acting on the payload before the signature check, or before the `txRef` lookup. The order is the rule.
- Downgrading inside the webhook on a failed charge. Failed charge means `PAST_DUE` + grace period; the daily job does the downgrade on day 5.
- Returning 5xx after successfully handling an event. Flutterwave retries, and now your idempotency check is the only thing between the user and a double charge — don't lean on it unnecessarily.
- Deleting or archiving anything on downgrade. Read-only, chattable within free caps, nothing deleted (FR-36).
- Showing the user a usage number computed differently from the enforced one.
- Any USD amount, symbol, or price appearing anywhere user-facing. NGN only (NG-7).
- Testing with the real Flutterwave secret committed in a fixture. Secrets never enter the repo (`git-conventions.md`).

## Verify before done

- [ ] Webhook order is verify → idempotency → record → act → mark, exactly.
- [ ] Failed charge sets `PAST_DUE`; only the daily job downgrades, at day 5+.
- [ ] Downgrade deletes nothing; read-only projects still chat within free caps.
- [ ] All user-facing amounts NGN; price lives in server config.
- [ ] Displayed usage and enforced usage share one source.
- [ ] Tests: same `txRef` delivered twice → subscription state changes once; unsigned payload → 401 and no `WebhookEvent` row; enforcement job run twice on a day-6 `PAST_DUE` sub → one downgrade; downgraded user's over-cap project → analysis blocked, chat allowed, data intact.