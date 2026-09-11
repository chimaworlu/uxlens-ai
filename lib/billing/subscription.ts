// Shared by the webhook handler (app/api/billing/webhook/route.ts) and the
// checkout-redirect verify route (app/api/billing/verify/route.ts) — both
// are independent confirmations of the same event ("this user successfully
// paid"), and must activate a subscription identically so it doesn't
// matter which one gets there first. Upserting is what makes running this
// twice for the same user safe.
import { prisma } from "../db/prisma.ts";

export async function activateProSubscription(params: {
  userId: string;
  planCode: string;
  customerCode?: string;
  subscriptionCode?: string;
  emailToken?: string;
}): Promise<void> {
  // Interactive transaction (not the array form) because the new period end
  // depends on reading the existing row first — see the comment below.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { userId: params.userId },
      select: { currentPeriodEnd: true },
    });

    const now = new Date();
    // Anchor the new period end to whichever is later: the subscription's
    // existing paid-through date, or now. Interval is monthly (see
    // scripts/create-paystack-plan.ts).
    //
    // This call fires for three different situations, and "now" is only
    // correct for two of them: a brand-new subscription (no existing row —
    // base is now, correct) and PAST_DUE recovery (existing currentPeriodEnd
    // already lapsed, so max() still floors to now, correct). The third is
    // an on-time monthly renewal, where Paystack auto-charges the saved
    // card and fires charge.success on its own schedule, independent of
    // when our webhook actually gets processed — anchoring to "now" there
    // would shift currentPeriodEnd later (or earlier) than what was
    // actually paid for by however long the webhook was delayed, and that
    // drift compounds every renewal for the life of the subscription. Since
    // the cancel flow and billing page both promise "Pro until
    // currentPeriodEnd" (money-and-billing.md, FR-35) and the enforcement
    // job's downgrade timing reads the same field, this has to stay
    // accurate, not just close.
    const base = existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
    const currentPeriodEnd = new Date(base);
    currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);

    await tx.subscription.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        status: "ACTIVE",
        paystackPlanCode: params.planCode,
        paystackCustomerCode: params.customerCode,
        paystackSubscriptionCode: params.subscriptionCode,
        paystackEmailToken: params.emailToken,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        status: "ACTIVE",
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        ...(params.subscriptionCode ? { paystackSubscriptionCode: params.subscriptionCode } : {}),
        ...(params.emailToken ? { paystackEmailToken: params.emailToken } : {}),
      },
    });
    await tx.user.update({ where: { id: params.userId }, data: { plan: "PRO" } });
  });
}
