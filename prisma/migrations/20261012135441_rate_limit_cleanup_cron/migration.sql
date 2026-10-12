-- Unlike Redis's EXPIRE (which actually removes a key once its TTL
-- passes), a "RateLimit" row just sits there with a stale windowStart
-- until the same key is checked again. Per-IP and per-session keys
-- (demo-chat-session:*, presign:*, etc.) are never reused once that
-- visitor leaves, so without this the table grows unboundedly. The
-- longest window any caller uses today is DEMO_CHAT_SESSION_WINDOW_SECONDS
-- (lib/demo-session.ts, 86400s/24h) — 48h is a safe, conservative cutoff
-- past every real window currently in use.
--
-- Requires the pg_cron extension (enabled directly against the project
-- before this migration — `CREATE EXTENSION` for pg_cron isn't run here
-- because it needs to run in the `postgres` database as a superuser-ish
-- role outside a normal migration's permissions on Supabase's hosted
-- platform; this migration only schedules the job).
SELECT cron.schedule(
  'rate-limit-cleanup-daily',
  '0 3 * * *',
  $$DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '48 hours'$$
);
