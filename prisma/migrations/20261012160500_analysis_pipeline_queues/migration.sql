-- Phase 4 of the BullMQ -> Supabase Edge Functions migration. The "analysis"
-- pgmq queue already exists (Phase 2) and carries Pass A batch messages;
-- these three new queues carry the Pass B/C/D handoffs that used to be
-- plain function calls inside one long-running worker process.
SELECT pgmq.create('analysis_pass_b');
SELECT pgmq.create('analysis_pass_c');
SELECT pgmq.create('analysis_pass_d');

-- Backup pollers, same reasoning as doc-processing's (migration
-- 20261012143136): the real-time path is a direct HTTP call fired right
-- after each pgmq.send (lib/queue/analysis.ts, and each analysis-pass-*
-- Edge Function when it dispatches the next stage) — these only catch
-- whatever that direct call misses.
SELECT cron.schedule(
  'analysis-pass-a-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-a',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);

SELECT cron.schedule(
  'analysis-pass-b-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-b',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);

SELECT cron.schedule(
  'analysis-pass-c-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-c',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);

SELECT cron.schedule(
  'analysis-pass-d-poller',
  '* * * * *',
  $$SELECT net.http_post(
      url := 'https://gxybkoxjcermhxcvveid.supabase.co/functions/v1/analysis-pass-d',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
);
