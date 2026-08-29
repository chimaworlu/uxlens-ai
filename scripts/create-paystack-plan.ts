// One-off setup: creates the single recurring Plan every Pro subscriber's
// checkout references (see lib/billing/paystack.ts's module comment for
// why this targets Paystack's Plan/Subscription objects). Run once per
// environment (sandbox, then again for live) after real Paystack keys
// are in .env:
//
//   node scripts/create-paystack-plan.ts
//
// Prints the created plan's plan_code — copy it into
// PAYSTACK_PRO_PLAN_CODE. Re-running this creates a SECOND plan rather
// than updating the first one (Paystack has no "get or create" for
// plans), so don't run it more than once per environment; if you do by
// mistake, disable the duplicate plan in the Paystack dashboard rather
// than leaving two live Pro plans for future checkouts to accidentally
// reference.
//
// Plain `node` execution, same constraints as worker/index.ts: relative
// imports with explicit .ts extensions, no "@/" alias, .env loaded
// manually.
import "dotenv/config";
import { createPlan } from "../lib/billing/paystack.ts";

async function main() {
  const plan = await createPlan({
    name: "UXLens AI Pro",
    amountKobo: 3000 * 100,
    interval: "monthly",
    currency: "NGN",
  });

  console.log("Created Paystack plan:");
  console.log(plan);
  console.log(`\nSet this in .env: PAYSTACK_PRO_PLAN_CODE="${plan.plan_code}"`);
}

main().catch((error) => {
  console.error("Failed to create plan:", error.message);
  process.exit(1);
});
