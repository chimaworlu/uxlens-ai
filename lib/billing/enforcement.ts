// FR-34/FR-36, AGENTS.md rule 12: the daily billing-enforcement job. A
// grace period or a "cancels at period end" flag is only real if something
// actually closes it — this is that something. Runs from the cleanup
// queue (worker/queues/cleanup.ts), never inline in a webhook or route
// handler, so a slow/failed enforcement pass can't block a request.
//
// Relative import with an explicit .ts extension, not the "@/" alias —
// this file runs inside the worker process (plain `node worker/index.ts`,
// no bundler), same constraint as lib/quota/checks.ts.
import { prisma } from "../db/prisma.ts";

const GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;

// Naturally idempotent: once a subscription is downgraded its status
// moves to CANCELED, which drops it out of both WHERE clauses below — a
// second run in the same day (or a retried job) finds nothing left to do
// for it, per the skill's requirement ("running twice downgrades nobody
// twice"), without needing a separate "already processed" flag.
export async function runBillingEnforcement(): Promise<{ downgraded: number }> {
  const now = new Date();
  const gracePeriodCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

  const [pastDue, endingAtPeriodEnd] = await Promise.all([
    // A failed charge sets PAST_DUE (see the webhook handler); updatedAt
    // is only touched by that status change, so "how long has this row
    // been PAST_DUE" and "when did updatedAt last change" are the same
    // question here — there's no separate pastDueSince column to add for
    // it (AGENTS.md: don't add schema beyond what an FR clearly needs).
    prisma.subscription.findMany({
      where: { status: "PAST_DUE", updatedAt: { lte: gracePeriodCutoff } },
      select: { id: true, userId: true },
    }),
    // Self-serve cancellation (FR-35) sets cancelAtPeriodEnd instead of
    // downgrading immediately — this is what actually applies it once the
    // paid period the customer already bought has run out.
    prisma.subscription.findMany({
      where: {
        cancelAtPeriodEnd: true,
        status: { not: "CANCELED" },
        currentPeriodEnd: { lte: now },
      },
      select: { id: true, userId: true },
    }),
  ]);

  const toDowngrade = [...pastDue, ...endingAtPeriodEnd];

  for (const subscription of toDowngrade) {
    // Never delete anything on downgrade (AGENTS.md rule 7 / FR-36) — this
    // only flips plan/status; projects, documents, and analyses are
    // untouched, and become read-only via the same plan-tier checks
    // /lib/quota already applies elsewhere.
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "CANCELED" },
      }),
      prisma.user.update({
        where: { id: subscription.userId },
        data: { plan: "FREE" },
      }),
    ]);
  }

  return { downgraded: toDowngrade.length };
}
