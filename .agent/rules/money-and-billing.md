---
trigger: glob
---

# Money and Billing Rules

This file is the single place every money-related rule lives. If you're touching pricing, quotas, billing, or cost, check here even if the rule is also stated elsewhere — the repetition is intentional.

## Currency

- NGN is the only currency, everywhere in the product: pricing table, checkout, billing page, invoices, receipts. No USD price, symbol, or conversion display anywhere in the UI or an API response, at MVP. International cards may pay in NGN via Paystack — there is no USD-denominated path. *(NG-7)*
- Internal cost tracking (`Analysis.costUsd`, `UsageRecord.costUsd`, the $0.20 target in G-4) is in USD because that's the currency AI providers bill in — this is an internal metric, never surfaced to the user, and does not conflict with the NGN-only rule above.
- All monetary values in the database are `Decimal`, never `Float`. Floating-point rounding error in a cost or price field is not an acceptable tradeoff for convenience.

## Pricing and tiers

| | Free | Pro — ₦3,000/month |
|---|---|---|
| Active projects | 1 | 15 |
| Documents per project | 1 | 20 |
| Analysis runs / month | 2 | 30 |
| Chat messages / day | 30 | 500 |
| Storage per project | 30 MB | 500 MB |
| Analysis version history | keep 1 | keep 5 |

- These numbers are locked. Do not change a tier limit to make a feature easier to build, test, or demo — including in your own dev/test environment, where limits must still be enforced identically to production.
- Every limit in this table is enforced **server-side**, before the expensive work is queued (before an analysis job is enqueued, before a chat message is sent to a provider, before a file is presigned for upload). A client-side check is UX only, never the enforcement point.

## Quota enforcement mechanics

- Quota state is derived by counting `UsageRecord` rows for the current period at request time — no separate counter, cache, or running total (see `database-schema.md`). A user's usage and remaining quota must always be computed from the same source of truth the enforcement check uses; never let a "usage displayed to the user" number diverge from the number actually enforced.
- The 300-word minimum (FR-22) and 300k-token maximum (FR-22b) on analysis input are checked before a run is queued, and a refused run does not consume the user's monthly analysis count. Getting this backwards — consuming a run on a refusal — silently shortchanges every user who hits either limit.

## Abuse and cost ceiling

- Every user has a per-day AI spend ceiling of $2 (tracked from `UsageRecord.costUsd`). If a user's usage would cross this ceiling, AI features pause for that user with a clear, friendly message — this is a hard backstop independent of their plan's stated quotas, because quotas assume normal usage patterns and this ceiling protects against the abnormal ones.
- Never remove, raise, or bypass this ceiling to "let a task complete" during development or testing — test against it, don't work around it.

## Billing (Paystack)

- Checkout, recurring charges, and plans go through Paystack's Plan/Subscription API. No other payment provider is called, and no payment logic is hand-rolled outside what Paystack's API and webhooks provide.
- The webhook handler verifies the Paystack signature (`x-paystack-signature`, a computed HMAC-SHA512 of the raw request body, keyed with the secret key) before acting on any payload, and is idempotent by transaction reference (`txRef`) — the same event must never be processed twice, whether that's activating a subscription twice or downgrading a user twice.
- Every payment event — from checkout initiation through webhook delivery and the checkout-redirect verify call, success or failure — is written to `PaymentLog` (`lib/billing/payment-log.ts`). This is the most trusted layer: an append-only audit trail independent of `Subscription`/`User.plan`, meant for reconciling against Paystack's own dashboard if application state ever looks wrong. Never skip logging a rejected or failed attempt just because nothing was activated — the gaps are exactly what this table exists to make visible.
- A failed charge starts a 5-day grace period, not an immediate downgrade. The grace period must actually end: the daily `billing-enforcement` cleanup job downgrades any subscription that has been `PAST_DUE` for more than 5 days. A grace period with no job to close it is a bug that looks like generosity but is actually a permanently-free Pro account.
- Downgrade never deletes data. Projects over the free cap become read-only (upload and analysis disabled); chat remains available within the free tier's daily cap. The only ways data is ever deleted are explicit user actions — document delete, project delete with typed confirmation, or account deletion. A billing state change is never, by itself, a deletion trigger.
- Cancellation is self-serve from the billing page, takes effect at period end, and requires no email or support interaction to complete.
- `activateProSubscription` (`lib/billing/subscription.ts`) anchors a new `currentPeriodEnd` to `max(existing currentPeriodEnd, now)`, never plain `now`. This is only correct-by-accident if skipped: an on-time renewal's `charge.success` webhook fires on Paystack's own schedule, not on ours, so anchoring to wall-clock "now" instead of the subscription's actual paid-through date silently drifts `currentPeriodEnd` by however long the webhook was delayed — and that drift compounds every renewal. First-time activation and PAST_DUE recovery both still resolve to `now` under this rule (there's no later existing date to anchor to), so nothing about those two cases changes.
- Account deletion cancels any active Pro subscription immediately, as part of the same action. This is distinct from a normal user-initiated cancellation and does not go through the standard grace period.

## Pricing changes and FX

- The NGN price is reviewed quarterly against the NGN/USD rate. If AI cost exceeds 60% of Pro revenue equivalent for two consecutive months, that is a documented trigger to raise the NGN price or lower the analysis cap — a real decision for a human to make, not something to be silently auto-adjusted in code. If your work surfaces evidence this trigger has been hit (e.g., while working on the cost dashboard), flag it explicitly rather than changing the price yourself.
- Never build automatic, code-driven price adjustment based on the exchange rate. The quarterly review is a deliberate human checkpoint, not a formula to automate.