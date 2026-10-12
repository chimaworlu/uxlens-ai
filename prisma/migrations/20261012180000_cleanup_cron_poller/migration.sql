-- Backup poller for the cleanup pgmq queue (Phase 5 of the BullMQ ->
-- Supabase Edge Functions migration), same reasoning as doc-processing's
-- poller (migration 20261012143136): the real-time path is a direct HTTP
-- call right after lib/queue/cleanup.ts's enqueueR2Cleanup sends the pgmq
-- message — this cron job only catches whatever that direct call misses.
SELECT cron.schedule(
  'cleanup-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/cleanup',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);
