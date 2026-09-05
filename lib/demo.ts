// Extension'd relative import (not the "@/" alias) — same reason as
// lib/quota/checks.ts: this module is reachable from scripts/seed-demo.ts,
// which runs as plain `node`, not through Next.js's bundler.
import { prisma } from "./db/prisma.ts";

// FR-37: identifies the single public demo project without adding schema
// (e.g. an isDemo column) — it's just "the one project owned by this fixed
// user account", the same way PAYSTACK_PRO_PLAN_CODE identifies "the one
// Pro plan" via a fixed external reference rather than a new column.
// Seeded by scripts/seed-demo.ts. `.local` is never a resolvable, real
// delivery domain, so even a password-reset request against this address
// (no real passwordHash exists for it anyway — see that script) can never
// actually reach an inbox.
export const DEMO_USER_EMAIL = "demo@uxlens.local";
export const DEMO_PROJECT_NAME = "Coinly Budgeting App Research";

// One indexed lookup per call rather than a cached ID — the demo project
// is reseeded rarely enough (scripts/seed-demo.ts is idempotent) that
// correctness after a reseed matters more than saving one query on a
// public route this app expects light traffic on.
export async function getDemoProject(): Promise<{ id: string } | null> {
  return prisma.project.findFirst({
    where: { user: { email: DEMO_USER_EMAIL }, name: DEMO_PROJECT_NAME },
    select: { id: true },
  });
}
