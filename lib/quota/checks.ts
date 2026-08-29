// Every quota, cap, and limit check in the product lives in this file
// (AGENTS.md Section 4 / Section 3 rule 4). Nothing outside this module
// writes an `if (count >= limit)` check inline in a route handler.
//
// Implemented incrementally as each limit's feature is built:
//   - FR-7  project cap (1 free / 15 pro)
//   - FR-9  document-per-project cap (1 free / 20 pro)
//   - FR-20 version history cap (1 free / 5 pro)
//   - FR-21 monthly analysis run cap (2 free / 30 pro)
//   - FR-22 / FR-22b analysis input word/token floor and ceiling
//   - FR-31 daily chat message cap (30 free / 500 pro)
//   - FR-42 storage cap (30 MB free / 500 MB pro)

// Relative import with an explicit .ts extension, not the "@/" alias —
// this file is reachable from worker/index.ts (via pruneAnalysisVersions,
// called from lib/pipeline/analysis/run.ts), which runs as plain
// `node worker/index.ts` with no bundler. Node's native ESM resolver
// doesn't understand the "@/" path alias (that's a Next.js/tsconfig-paths
// feature) and requires explicit file extensions, unlike Next.js route
// handlers, which is the only context this file originally ran in.
import { prisma } from "../db/prisma.ts";
import type { PlanTier } from "@prisma/client";

export class QuotaExceededError extends Error {
  // Explicit field + constructor-body assignment, not a TS constructor
  // parameter property (`public readonly quota: string` inline in the
  // signature) — that shorthand has real runtime behavior (it implicitly
  // declares and assigns the field), not just an erasable type annotation,
  // so it's not just a stylistic choice: Node's built-in TS type-stripping
  // (used to run worker/index.ts directly via `node`, no bundler) rejects
  // it outright with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Next.js's own
  // compiler (SWC) happens to support it, which is why this only ever
  // surfaced as the worker process failing to start, not the app itself.
  public readonly quota: string;

  constructor(message: string, quota: string) {
    super(message);
    this.name = "QuotaExceededError";
    this.quota = quota;
  }
}

// FR-7: 1 active (non-archived) project on Free, 15 on Pro. Enforced here,
// at creation time, before the Project row is written — never inline in
// the route handler. Exported so UI code can display the limit (e.g. "1 of
// 1 active projects used") without duplicating these numbers elsewhere.
// Free is deliberately a single-project trial, not a small free tier of
// its own — real multi-project usage is the upgrade trigger.
export const PROJECT_LIMITS: Record<PlanTier, number> = { FREE: 1, PRO: 15 };

export type UsageSummary = { used: number; limit: number };

// Shared by checkProjectQuota below and the billing portal (FR-35's usage
// meters) — money-and-billing.md: "a user's usage and remaining quota must
// always be computed from the same source of truth the enforcement check
// uses." One query, two callers, instead of the portal re-deriving its own
// version that could quietly drift from what's actually enforced.
export async function getProjectUsage(userId: string): Promise<UsageSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });
  const used = await prisma.project.count({ where: { userId, archivedAt: null } });
  return { used, limit: PROJECT_LIMITS[user.plan] };
}

export async function checkProjectQuota(userId: string): Promise<void> {
  const { used, limit } = await getProjectUsage(userId);
  if (used >= limit) {
    throw new QuotaExceededError(
      `You've reached your plan's limit of ${limit} active projects. Upgrade to Pro for more.`,
      "projects"
    );
  }
}

// FR-9 / FR-42: per-project caps, not account-wide — 1 document / 30 MB on
// Free, 20 documents / 500 MB on Pro, each measured within the one project
// being uploaded to. Free is a single project with a single document: just
// enough to see a real analysis run on your own data, not enough to run an
// actual research project on — that gap is the upgrade prompt.
export const DOCUMENT_LIMITS: Record<PlanTier, number> = { FREE: 1, PRO: 20 };
export const STORAGE_LIMIT_BYTES: Record<PlanTier, number> = {
  FREE: 30 * 1024 * 1024,
  PRO: 500 * 1024 * 1024,
};

export async function checkDocumentQuota(
  projectId: string,
  userId: string,
  incomingSizeBytes: number
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const [count, aggregate] = await Promise.all([
    prisma.document.count({ where: { projectId } }),
    prisma.document.aggregate({ where: { projectId }, _sum: { sizeBytes: true } }),
  ]);

  const docLimit = DOCUMENT_LIMITS[user.plan];
  if (count >= docLimit) {
    throw new QuotaExceededError(
      `This project has reached its limit of ${docLimit} documents. Upgrade to Pro for more.`,
      "documents"
    );
  }

  const storageLimit = STORAGE_LIMIT_BYTES[user.plan];
  const currentBytes = aggregate._sum.sizeBytes ?? 0;
  if (currentBytes + incomingSizeBytes > storageLimit) {
    throw new QuotaExceededError(
      "This upload would exceed this project's storage limit. Upgrade to Pro for more space.",
      "storage"
    );
  }
}

// FR-21: 2 analysis runs per calendar month across all of a user's
// projects on Free, 30/month on Pro. Resets on the 1st of each month —
// not a permanent lockout, and nothing else in the product is blocked
// while this quota is maxed out. Counted from UsageRecord rows for the
// current month rather than a separate counter table (see that model's
// own note in prisma/schema.prisma for why).
export const ANALYSIS_LIMITS: Record<PlanTier, number> = { FREE: 2, PRO: 30 };

export async function getAnalysisUsage(userId: string): Promise<UsageSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const used = await prisma.usageRecord.count({
    where: { userId, kind: "analysis_run", createdAt: { gte: startOfMonth } },
  });

  return { used, limit: ANALYSIS_LIMITS[user.plan] };
}

export async function checkAnalysisQuota(userId: string): Promise<void> {
  const { used, limit } = await getAnalysisUsage(userId);
  if (used >= limit) {
    throw new QuotaExceededError(
      `You've used all ${limit} analysis runs this month. Upgrade to Pro for more, or wait for next month's reset.`,
      "analysis"
    );
  }
}

// FR-20: version dropdown on the Insights view keeps only the latest
// version on Free, up to 5 on Pro. Enforced by deleting the overflow right
// after each run completes (cascades to that version's insights/citations)
// rather than a separate nightly sweep — the cap holds immediately instead
// of drifting until the next cleanup pass.
export const VERSION_LIMITS: Record<PlanTier, number> = { FREE: 1, PRO: 5 };

// FR-31: 30 chat messages/day per user on Free, 500/day on Pro. A daily
// (UTC calendar day) boundary, not the monthly one checkAnalysisQuota uses
// — same UsageRecord-counting idiom, just a narrower window.
export const CHAT_MESSAGE_LIMITS: Record<PlanTier, number> = { FREE: 30, PRO: 500 };

export async function getChatUsage(userId: string): Promise<UsageSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const used = await prisma.usageRecord.count({
    where: { userId, kind: "chat_message", createdAt: { gte: startOfDay } },
  });

  return { used, limit: CHAT_MESSAGE_LIMITS[user.plan] };
}

export async function checkChatQuota(userId: string): Promise<void> {
  const { used, limit } = await getChatUsage(userId);
  if (used >= limit) {
    throw new QuotaExceededError(
      `You've reached your daily message limit. Upgrade to Pro for up to ${CHAT_MESSAGE_LIMITS.PRO} messages a day.`,
      "chat"
    );
  }
}

// Storage is enforced per-project (checkDocumentQuota, FR-42) — there's no
// single account-wide storage quota to enforce. This is a display-only
// aggregate for the billing page (FR-35 asks for one "storage used" meter),
// summing every active project's usage against what each of those projects
// is individually capped at. It never changes what's enforced; it's the
// same STORAGE_LIMIT_BYTES constant checkDocumentQuota already uses,
// applied per project and added up for one summary number.
export async function getStorageUsage(
  userId: string
): Promise<{ usedBytes: number; limitBytesPerProject: number; projectCount: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const projectCount = await prisma.project.count({ where: { userId, archivedAt: null } });
  const aggregate = await prisma.document.aggregate({
    where: { project: { userId, archivedAt: null } },
    _sum: { sizeBytes: true },
  });

  return {
    usedBytes: aggregate._sum.sizeBytes ?? 0,
    limitBytesPerProject: STORAGE_LIMIT_BYTES[user.plan],
    projectCount,
  };
}

export async function pruneAnalysisVersions(projectId: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { user: { select: { plan: true } } },
  });

  const versions = await prisma.analysis.findMany({
    where: { projectId, status: { in: ["READY", "STALE"] } },
    orderBy: { version: "desc" },
    select: { id: true },
    skip: VERSION_LIMITS[project.user.plan],
  });

  if (versions.length === 0) return;

  await prisma.analysis.deleteMany({
    where: { id: { in: versions.map((version) => version.id) } },
  });
}
