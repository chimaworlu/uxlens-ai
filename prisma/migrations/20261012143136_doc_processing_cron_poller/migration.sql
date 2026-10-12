-- Backup poller for the doc_processing pgmq queue (Phase 3 of the
-- BullMQ -> Supabase Edge Functions migration). The real-time path is a
-- direct HTTP call to this same Edge Function right after
-- lib/queue/doc-processing.ts's enqueueDocumentProcessing sends the pgmq
-- message (see that file) — this cron job only exists to catch whatever
-- that direct call misses (the function already busy with another
-- invocation, a transient network blip, etc.), checking every minute so
-- nothing is stuck for longer than that in the worst case.
SELECT cron.schedule(
  'doc-processing-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/doc-processing',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);
