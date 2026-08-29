---
trigger: always_on
---

# Security Rules

Breaking any rule in this file is a security failure, not a bug — treat it with the urgency of one, even mid-task.

## Secrets and keys

- Every provider key (DeepSeek, Anthropic/Claude, Paystack, Resend, Cloudflare R2, database connection string, session/JWT secret) lives server-side only, loaded from environment variables. None of these are ever sent to, embedded in, or reachable from client-side code.
- If you write code that would ship a secret in a Next.js client bundle (anything imported into a `'use client'` component, anything in `NEXT_PUBLIC_*` that shouldn't be public), stop immediately — this is not a lint warning, it's a live leak.
- No AI provider call originates from the browser. Every DeepSeek or Claude call goes through the server or the worker, behind the provider interface (`/lib/ai/provider.ts`).

## Authentication and sessions

- Auth.js (NextAuth v5) with the Prisma adapter is the only auth mechanism. Do not hand-roll password hashing, session tokens, or JWT signing.
- Sessions are JWT-based, 30-day max age, sliding expiration — matching the PRD. Do not extend session lifetime "for convenience" or skip expiration checks on any authenticated route.
- Every API route that touches a user's own data (projects, documents, analyses, chat, billing) verifies the authenticated session's user ID matches the resource's owner before returning or modifying anything. Never trust an ID passed in the URL or body alone — always cross-check against the session.
- Email verification (FR-2) gates analysis, not signup or upload. Don't accidentally gate the wrong action, and don't skip the gate because it's "just for testing."
- Password reset requests never reveal whether an email is registered. The confirmation response (and its timing) must be identical whether the submitted email matches an account or not — send the reset email only if the account exists, but return the same neutral message either way. This is an account-enumeration control, not a UX nicety; a response that differs by registration status is a security bug even if the copy looks harmless. *(FR-3)*

## Input validation and file safety

- Every uploaded file is validated server-side by magic bytes, not by trusting the client-reported extension or MIME type. A mismatch is rejected with a specific error — never silently coerced into a type it might not be.
- File size (20 MB/file) and document count caps are enforced server-side before a file reaches R2 or the processing queue.
- Every API input is Zod-validated before touching business logic or the database — this is also a security boundary, not just a correctness one. Unvalidated input is the standard vector for injection and unexpected state.

## Webhooks

- The Paystack webhook handler verifies the signature (`x-paystack-signature` header, a computed HMAC-SHA512 of the raw body) before doing anything else with the payload. An unverified webhook call is treated as untrusted input, full stop.
- The handler is idempotent by transaction reference (`txRef`): check whether that reference has already been processed before acting on it. Never assume a webhook fires exactly once — replay, retries, and duplicate delivery are normal for webhooks, not edge cases.

## Rate limiting and abuse

- The public demo route (`/api/demo`, FR-37) is the one unauthenticated surface in the product. It is rate-limited to 20 requests/min/IP, capped at 5 chat messages per browser session, and has no path to uploads, analysis triggers, or unbounded AI calls. This is a security control, not a UX nicety — an unauthenticated route with an open path to paid AI calls is a direct abuse and cost-drain vector.
- Auth endpoints are rate-limited (10/min/IP) to slow credential-stuffing and brute-force attempts.
- Upload presign requests are rate-limited (30/hour/user) so a compromised or scripted account can't be used to exhaust storage or queue capacity.
- Billing endpoints are rate-limited too: the Paystack webhook (120/min/IP, since it's unauthenticated by design), checkout creation (10/hour/user), the checkout-redirect verify route (30/hour/user), and self-serve cancel (10/hour/user).

## Data handling and disclosure

- Research documents and chat questions are sent to DeepSeek (confirmed processor for all passes) and, if enabled, Claude. Both are called with training opt-out defaults. Never route user content to a provider the ToS doesn't name, and never enable a new provider without updating the disclosure.
- The PII notice on the upload screen is a warning, not a technical control — automated redaction does not exist at MVP. Never write copy, UI, or code comments that imply data is anonymized or scrubbed when it isn't.
- R2 objects are private; all reads go through short-lived presigned GET URLs (15 min). Never generate a long-lived or public URL for a user's uploaded document.
- Account and project deletion hard-delete rows and R2 objects within the stated window (24 hours). If a deletion path leaves orphaned data behind (in the database or in R2), that's a privacy failure, not just a cleanup-job bug.