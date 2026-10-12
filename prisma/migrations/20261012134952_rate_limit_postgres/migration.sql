-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- Replaces lib/security/rate-limit.ts's Redis INCR/EXPIRE fixed-window
-- counter (AGENTS.md Section 2 migration: BullMQ+Redis -> Supabase Edge
-- Functions + pgmq + pg_cron). Not representable atomically through the
-- Prisma schema DSL alone, same reasoning as DocumentChunk.searchVector's
-- trigger in 20260819144422_chunk_search_index.
--
-- Mirrors Redis's INCR-then-conditionally-EXPIRE semantics: the first call
-- for a key starts a fresh window at count 1; a call inside an existing,
-- unexpired window increments; a call after the window has expired resets
-- to a fresh window at count 1. Row-level locking (FOR UPDATE) on the
-- existing-row path makes the read-then-decide-then-write sequence safe
-- under concurrent calls for the same key, the same guarantee Redis's
-- single-threaded INCR gives for free.
CREATE OR REPLACE FUNCTION check_rate_limit(p_key TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_inserted_key TEXT;
  v_count INTEGER;
  v_window_start TIMESTAMP(3);
BEGIN
  INSERT INTO "RateLimit" ("key", "count", "windowStart")
  VALUES (p_key, 1, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING
  RETURNING "key" INTO v_inserted_key;

  IF v_inserted_key IS NOT NULL THEN
    RETURN 1 <= p_limit;
  END IF;

  SELECT "count", "windowStart" INTO v_count, v_window_start
  FROM "RateLimit"
  WHERE "key" = p_key
  FOR UPDATE;

  IF CURRENT_TIMESTAMP - v_window_start >= make_interval(secs => p_window_seconds) THEN
    UPDATE "RateLimit" SET "count" = 1, "windowStart" = CURRENT_TIMESTAMP WHERE "key" = p_key;
    RETURN 1 <= p_limit;
  ELSE
    UPDATE "RateLimit" SET "count" = "count" + 1 WHERE "key" = p_key RETURNING "count" INTO v_count;
    RETURN v_count <= p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Refunds one slot (lib/security/rate-limit.ts's releaseRateLimit) — used
-- when a genuine server-side failure shouldn't cost the caller one of
-- their counted attempts (see app/api/demo/chat/route.ts's quota-refund
-- fix). Never goes below zero.
CREATE OR REPLACE FUNCTION release_rate_limit(p_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = p_key;
END;
$$ LANGUAGE plpgsql;
