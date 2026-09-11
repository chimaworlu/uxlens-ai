import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { getProjectUsage, getAnalysisUsage, getChatUsage, getStorageUsage } from "@/lib/quota/checks";
import { findActiveSubscription, disableSubscription, PaystackError } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

// PRD Section 7 lists only GET /api/billing/portal ("plan + usage
// summary"), no dedicated cancel route. FR-35 still needs a self-serve
// cancel action, so this reuses the same path for it via POST, the same
// way other resource routes in this app combine methods on one file
// (e.g. /api/projects/[id] handling PATCH + DELETE) rather than inventing
// a new path not in the table.

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, plan: true },
  });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });

  // FR-35: usage meters are the same numbers /lib/quota enforces, not a
  // separately-computed display value (money-and-billing.md).
  const [projects, analysisRuns, chatMessagesToday, storage] = await Promise.all([
    getProjectUsage(userId),
    getAnalysisUsage(userId),
    getChatUsage(userId),
    getStorageUsage(userId),
  ]);

  return NextResponse.json({
    name: user.name,
    plan: user.plan,
    subscription,
    usage: { projects, analysisRuns, chatMessagesToday, storage },
  });
}

export async function POST() {
  // Gate 1: auth.
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true },
  });
  if (!user) return NextResponse.json({ error: "No account found." }, { status: 404 });

  if (user.plan !== "PRO") {
    return NextResponse.json({ error: "You don't have an active Pro subscription." }, { status: 400 });
  }

  // security.md: "Rate limiting and abuse" — cancel is a rare, deliberate
  // action; this just bounds retries against a flaky Paystack call.
  const withinRateLimit = await checkRateLimit(`billing-cancel:${userId}`, 10, 3600);
  if (!withinRateLimit) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a while and try again." },
      { status: 429 }
    );
  }

  const proPlanCode = process.env.PAYSTACK_PRO_PLAN_CODE;
  if (!proPlanCode) {
    logger.error({ event: "billing_portal_misconfigured" }, "PAYSTACK_PRO_PLAN_CODE is not configured.");
    return NextResponse.json({ error: "Billing isn't available right now." }, { status: 500 });
  }

  try {
    const paystackSub = await findActiveSubscription({ email: user.email, planCode: proPlanCode });
    if (paystackSub) {
      await disableSubscription({ code: paystackSub.subscription_code, token: paystackSub.email_token });
    } else {
      // Nothing active on Paystack's side to stop (e.g. it already lapsed
      // on its own) — still record the user's cancel intent below rather
      // than blocking on a state mismatch we can't resolve here.
      logger.warn(
        { event: "billing_portal_no_active_subscription", userId },
        "No active Paystack subscription found; cancelling locally only."
      );
    }
  } catch (error) {
    if (error instanceof PaystackError) {
      logger.error(
        { event: "billing_portal_paystack_cancel_error", userId, err: error.message },
        "Paystack subscription cancel failed."
      );
      return NextResponse.json(
        { error: "Couldn't cancel your subscription. Please try again." },
        { status: 502 }
      );
    }
    throw error;
  }

  // FR-35: takes effect at period end, not immediately — the daily
  // enforcement job applies the actual downgrade once currentPeriodEnd
  // passes (AGENTS.md rule 12 / billing-webhook-procedure skill).
  const subscription = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
    select: { currentPeriodEnd: true },
  });

  return NextResponse.json({ cancelAtPeriodEnd: true, currentPeriodEnd: subscription.currentPeriodEnd });
}
