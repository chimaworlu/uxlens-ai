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
