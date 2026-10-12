-- Phase 5 of the BullMQ -> Supabase Edge Functions migration (AGENTS.md
-- Section 2). Billing enforcement and chat-message pruning are pure
-- Prisma read/update/delete with no business logic that needs a
-- general-purpose runtime, so they move straight to pg_cron-scheduled SQL
-- functions instead of an Edge Function, same reasoning as the rate-limit
-- cleanup cron job (migration 20261012135441). Ports
-- lib/billing/enforcement.ts's runBillingEnforcement and
-- lib/pipeline/chat/prune.ts's pruneDeletedChatMessages exactly; mirror
-- any future change to either file's logic here too, same as every other
-- ported pipeline file in this migration.

-- AGENTS.md rule 12 / FR-34: downgrades a subscription once its PAST_DUE
-- grace period (5 days) has elapsed, or once a self-serve cancellation's
-- already-paid-for period has run out. Naturally idempotent, same as the
-- original: a subscription already CANCELED drops out of both conditions,
-- so running this twice downgrades nobody twice. Never deletes anything
-- (AGENTS.md rule 7 / FR-36) — only flips plan/status.
CREATE OR REPLACE FUNCTION run_billing_enforcement() RETURNS void AS $$
BEGIN
  WITH to_downgrade AS (
    SELECT "id", "userId" FROM "Subscription"
    WHERE "status" = 'PAST_DUE' AND "updatedAt" <= now() - interval '5 days'
    UNION
    SELECT "id", "userId" FROM "Subscription"
    WHERE "cancelAtPeriodEnd" = true AND "status" != 'CANCELED' AND "currentPeriodEnd" <= now()
  ),
  downgraded_subs AS (
    UPDATE "Subscription" SET "status" = 'CANCELED'
    WHERE "id" IN (SELECT "id" FROM to_downgrade)
    RETURNING "userId"
  )
  UPDATE "User" SET "plan" = 'FREE'
  WHERE "id" IN (SELECT "userId" FROM downgraded_subs);
END;
$$ LANGUAGE plpgsql;

-- FR-32: "clear chat history" is a soft delete (ChatMessage.deletedAt) —
-- this is the daily sweep that turns a 30-day-old soft delete into a real
-- one. Citation rows cascade automatically (Citation.chatMessageId
-- onDelete: Cascade), no separate cleanup needed for them.
CREATE OR REPLACE FUNCTION run_chat_message_pruning() RETURNS void AS $$
BEGIN
  DELETE FROM "ChatMessage"
  WHERE "deletedAt" IS NOT NULL AND "deletedAt" <= now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('billing-enforcement-daily', '0 3 * * *', $$SELECT run_billing_enforcement()$$);
SELECT cron.schedule('chat-message-pruning-daily', '0 3 * * *', $$SELECT run_chat_message_pruning()$$);
