import { prisma } from "@/lib/db/prisma";

// Fixed-window counter on Postgres (the `check_rate_limit`/`release_rate_limit`
// functions and `RateLimit` table added in migration
// 20261012134952_rate_limit_postgres) — replaces the Redis INCR/EXPIRE
// version used before the Supabase Edge Functions migration (AGENTS.md
// Section 2): the worker no longer runs anywhere Redis would naturally
// live, so this keeps the same fixed-window semantics without a second
// piece of infrastructure. Good enough for the limits this project
// actually needs; nothing here claims to be a general-purpose rate-limit
// library.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const result = await prisma.$queryRaw<{ allowed: boolean }[]>`
    SELECT check_rate_limit(${key}, ${limit}, ${windowSeconds}) AS allowed
  `;
  return result[0]?.allowed ?? false;
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
  await prisma.$executeRaw`SELECT release_rate_limit(${key})`;
}
