// Paystack API client (api.paystack.co) — the only payment provider
// (AGENTS.md Section 2, updated from Flutterwave). Paystack's Plan +
// Subscription objects give Paystack-managed recurring billing (it bills
// the saved authorization on schedule, retries failed charges, and fires
// webhook events on each outcome), matching FR-33/34's intent the same
// way the previous Flutterwave integration did — money-and-billing.md
// still applies unchanged: "no payment logic is hand-rolled outside what
// [the provider]'s API and webhooks provide."
//
// Amounts are in kobo (NGN's smallest unit — amount * 100), NOT whole
// naira like the old Flutterwave integration used. Every function here
// that takes/returns an amount is in kobo; callers convert at the edge.
//
// Relative import with an explicit .ts extension, not the "@/" alias:
// this file is imported by scripts/create-paystack-plan.ts, which runs as
// plain `node scripts/create-paystack-plan.ts` with no bundler and no
// tsconfig-paths resolution (same constraint as lib/quota/checks.ts).

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackError";
  }
}

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("PAYSTACK_SECRET_KEY is not configured.");
  return key;
}

async function paystackRequest<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json: { status?: boolean; message?: string; data?: T } = await response
    .json()
    .catch(() => ({}));

  // Paystack's wrapper "status" is a boolean (true/false), not the string
  // "success"/"error" Flutterwave used — easy place to silently break
  // error handling if copied from the old client without noticing.
  if (!response.ok || json.status !== true) {
    throw new PaystackError(json.message ?? `Paystack request to ${path} failed.`);
  }

  return json.data as T;
}

export type Plan = {
  id: number;
  name: string;
  plan_code: string;
  amount: number;
  interval: string;
  currency: string;
};

// One-off setup call (see scripts/create-paystack-plan.ts), not something
// the app calls per checkout — a plan is created once, then every
// subscriber's first charge references its plan_code.
export async function createPlan(params: {
  name: string;
  amountKobo: number;
  interval: string;
  currency: string;
}): Promise<Plan> {
  return paystackRequest<Plan>("/plan", "POST", {
    name: params.name,
    amount: params.amountKobo,
    interval: params.interval,
    currency: params.currency,
  });
}

export type CheckoutSession = { authorization_url: string; access_code: string; reference: string };

// FR-33: hosted checkout — redirects the customer to a Paystack-hosted
// page supporting card, bank transfer, and USSD, so we never handle card
// data ourselves. Referencing planCode is what enrolls the customer in
// Paystack-managed recurring billing (see the module comment above).
export async function initiateCheckout(params: {
  reference: string;
  amountKobo: number;
  callbackUrl: string;
  customerEmail: string;
  planCode: string;
}): Promise<CheckoutSession> {
  return paystackRequest<CheckoutSession>("/transaction/initialize", "POST", {
    reference: params.reference,
    email: params.customerEmail,
    amount: params.amountKobo,
    currency: "NGN",
    callback_url: params.callbackUrl,
    plan: params.planCode,
  });
}

export type VerifiedTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer: { email: string };
};

// Never trust the redirect query params alone — always re-fetch the
// transaction from Paystack and compare amount/currency before treating a
// redirect as a successful payment.
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  return paystackRequest<VerifiedTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    "GET"
  );
}

type SubscriptionListItem = {
  id: number;
  subscription_code: string;
  email_token: string;
  status: string;
  customer: { email: string };
  plan: { plan_code: string };
};

// FR-35's cancel button needs both subscription_code AND email_token
// (Paystack's disable-subscription endpoint requires the pair, unlike
// Flutterwave's single numeric id) — neither is reliably present on every
// webhook payload (see the webhook route's comments on that uncertainty),
// so this resolves both fresh at cancel time by listing the customer's
// subscriptions to our one Pro plan.
export async function findActiveSubscription(params: {
  email: string;
  planCode: string;
}): Promise<SubscriptionListItem | undefined> {
  const list = await paystackRequest<SubscriptionListItem[]>(
    `/subscription?plan=${encodeURIComponent(params.planCode)}`,
    "GET"
  );
  return list.find((sub) => sub.customer.email === params.email && sub.status === "active");
}

// FR-35: self-serve cancel. Takes the {code, token} pair resolved via
// findActiveSubscription above, not our cuid or the plan code.
export async function disableSubscription(params: { code: string; token: string }): Promise<void> {
  await paystackRequest<unknown>("/subscription/disable", "POST", {
    code: params.code,
    token: params.token,
  });
}
