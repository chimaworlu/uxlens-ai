---
name: background-job-creation
description: How to add or modify any pgmq queue, Supabase Edge Function consumer, or pg_cron job for UXLens AI. Load this skill before defining a new job, editing an Edge Function, changing retry behavior, or touching the doc_processing, analysis/analysis_pass_b/analysis_pass_c/analysis_pass_d, cleanup, or email queues, or the billing-enforcement/chat-prune pg_cron jobs.
---

# Background Job Creation

Teaches the assembly order for every background job in UXLens AI's current architecture. The laws live in the PRD Section 7 (queue/architecture description) and `AGENTS.md` Section 2 (locked stack). This skill teaches how the pieces snap together.

**This replaces the project's original BullMQ + Redis design.** That design is retired for everything except the email queue, which still runs on a BullMQ/Redis worker on Railway (not because it needs a persistent process — it's one synchronous `fetch`/SMTP call — but only because the migration work hasn't deleted that one leftover queue yet). Nothing new should be added to it. If you're asked to add a new background job, it's a pgmq queue plus an Edge Function, or a `pg_cron` SQL function, never a BullMQ job.

## Two shapes, pick the right one

**Shape A — pgmq queue + Edge Function**, for work that needs a general-purpose runtime (calling an AI provider, the S3 SDK, parsing a file):
1. Confirm the queue already exists (`doc_processing`, `analysis`, `analysis_pass_b`, `analysis_pass_c`, `analysis_pass_d`, `cleanup`, `email`) or is a genuinely new one — a new queue needs `pgmq.create('name')` in a migration, plus a `cron.schedule` backup poller (see Shape A's migration pattern below).
2. Producer side (`/lib/queue/<name>.ts`, runs in the Next.js app): compute the message payload, call `sendToQueue` (`/lib/queue/pgmq.ts`), then fire an unawaited `fetch` to the Edge Function's URL for near-instant pickup. Keep the payload small — a document/analysis id, not the content itself; the consumer re-fetches what it needs from the database.
3. Consumer side (`supabase/functions/<name>/index.ts`, Deno): `Deno.serve` wraps a `handle()` function in try/catch. Read exactly one message via `pgmq.read`. Check `read_ct` against the queue's retry ceiling (pgmq has no native retry limit) — past it, insert a `DeadLetterMessage` row and `pgmq.archive` the message rather than letting it retry forever. On success, `pgmq.archive` it.
4. Any `/lib` logic the function needs (pipeline extraction/chunking/pass logic, the AI provider client) gets ported to `supabase/functions/_shared/` — Edge Functions can't import `/lib` or `/app` directly (no `@/` alias resolution, no Node-targeted Prisma client in Deno). Use `supabase/functions/_shared/db.ts`'s `pg` client and hand-written SQL instead of Prisma.
5. Add a `cron.schedule` entry (every ~1 min, `net.http_post` to the function's URL) as a backup poller for whatever the direct trigger misses — same migration that creates the queue, or a follow-up one.
6. For a multi-stage pipeline (like the analysis Pass A→B→C→D chain): each stage is its own Edge Function and its own queue, chained by the last step of one stage sending a message to the next stage's queue. If a stage runs as multiple concurrent invocations (Pass A does, one per chunk batch), use an atomic `UPDATE ... RETURNING` counter on the parent row to detect "I'm the last one" before dispatching the next stage — never a read-then-write check, that races.

**Shape B — `pg_cron` SQL function**, for scheduled work that's pure read/update/delete logic with no business rule that needs a general-purpose runtime (billing-enforcement, chat-message pruning are the two examples):
1. Write a `CREATE OR REPLACE FUNCTION run_<name>() RETURNS void AS $$ ... $$ LANGUAGE plpgsql;` in a migration, porting the exact same logic an equivalent `/lib` TypeScript function would have (keep both in sync if the rule changes — `lib/billing/enforcement.ts` and `lib/pipeline/chat/prune.ts` were deleted once their only caller, the BullMQ worker, was removed, so there is no TS counterpart to sync against for those two specifically; a new one might still want one for testability).
2. Schedule it: `SELECT cron.schedule('<name>-daily', '0 3 * * *', $$SELECT run_<name>()$$);`.
3. No queue, no Edge Function, no retry/dead-letter handling needed — `pg_cron`'s own `cron.job_run_details` table is the observability story here.

## Applying migrations

Both shapes need a Prisma migration folder (`prisma/migrations/<timestamp>_<name>/migration.sql`) for the historical record, but `prisma migrate dev`'s shadow database can't replay `pgmq`/`pg_cron` extension calls locally. Apply the SQL directly against the real Supabase database instead: `npx supabase db query --file <path-to-migration.sql> --linked` (needs `SUPABASE_ACCESS_TOKEN` set — generate one at supabase.com/dashboard/account/tokens, non-interactive `supabase login` doesn't work in most agent environments). Then record it as applied in Prisma's own tracking table so `prisma migrate deploy` doesn't try to replay it later: compute the file's sha256 (`crypto.createHash('sha256')`) and `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES (gen_random_uuid(), '<sha256>', '<migration_name>', now(), now(), 1)` via the same `supabase db query`.

Deploy an Edge Function with `npx supabase functions deploy <name> --project-ref <ref> --no-verify-jwt`. Set secrets (API keys, `EDGE_DATABASE_URL`, R2 credentials) with `npx supabase secrets set KEY=value --project-ref <ref>` — these are separate from the Next.js app's and Railway worker's own env vars, an Edge Function only sees what's explicitly set as its own secret.

## Traps

- Adding a new job to the Railway worker (`/worker`) instead of an Edge Function. That worker is scoped down to the email queue only and shouldn't grow.
- A static top-level `import` in an Edge Function whose own module-level code depends on something Deno doesn't provide (confirmed real: `pdf-parse`'s `pdfjs-dist` dependency touches the browser `DOMMatrix` API even just to load, not only when parsing). Static imports are hoisted and run before any other top-level code, including a polyfill placed "before" them in the file — if a ported dependency needs a polyfill, make its import dynamic (`await import(...)` inside the function that actually uses it), not static.
- Forgetting the retry-ceiling check. Without it, a permanently-failing message retries forever once its visibility window lapses, never reaching a terminal state.
- A message payload carrying full content instead of an id. Keep pgmq messages small; let the consumer re-fetch from the database, same as every existing consumer does.
- Skipping the backup poller. The direct-trigger `fetch` is fire-and-forget and uncertain to land (the function might already be busy, a request might drop) — the poller is what guarantees nothing is stuck forever, not a nice-to-have.
- Writing a `pg_cron` job that isn't safe to run twice. These run daily and will eventually double-fire; idempotency is not optional (`run_billing_enforcement` is naturally idempotent because a downgraded subscription drops out of both its WHERE clauses on a second run — model new cron jobs the same way).

## Verify before done

- [ ] Shape A: retry ceiling checked against `read_ct`, dead-letters past it; message archived on both the dead-letter and success paths; backup poller scheduled; payload carries ids, not content.
- [ ] Shape A: any ported `/lib` logic stays algorithmically identical to its Next.js counterpart, with per-file differences called out in a comment (dynamic vs. static imports, `Deno.env` vs. `process.env`, hand-written SQL vs. Prisma).
- [ ] Shape B: function is provably safe to run twice; scheduled via `cron.schedule`; no queue or Edge Function involved.
- [ ] Migration applied via `supabase db query --file ... --linked` and recorded in `_prisma_migrations`, not left to `prisma migrate dev` against the unreachable shadow database.
- [ ] Verified against real data before considering the job done — enqueue a real message (or call the cron function directly) and confirm the end-to-end result, not just that the code type-checks.
