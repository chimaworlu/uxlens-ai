import { getRedisConnection } from "@/lib/queue/connection";

// Fixed-window counter on the existing Redis connection — no new
// infrastructure (AGENTS.md Section 2: Redis is locked, already provisioned
// for BullMQ). Good enough for the limits this project actually needs;
// nothing here claims to be a general-purpose rate-limit library.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const redis = getRedisConnection();
  const redisKey = `rate-limit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return count <= limit;
}

// For a tightly-capped quota (e.g. the demo's 3-messages-per-session
// cap), checkRateLimit's own increment happens before the attempt is
// known to succeed. A caller that hits a genuine server-side failure
// after that (not the visitor's fault) calls this to give the slot
// back, so a transient error doesn't permanently cost them one of their
// few allotted messages. Not called for an intentional refusal (FR-30's
// "research doesn't cover this") — that's a real, correct answer, not a
// failure, and should still count.
export async function releaseRateLimit(key: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.decr(`rate-limit:${key}`);
}
