// Every quota, cap, and limit check in the product lives in this file
// (AGENTS.md Section 4 / Section 3 rule 4). Nothing outside this module
// writes an `if (count >= limit)` check inline in a route handler.
//
// Implemented incrementally as each limit's feature is built:
//   - FR-7  project cap (1 free / 15 pro)
//   - FR-9  document-per-project cap (1 free / 20 pro)
//   - FR-21 monthly analysis run cap (2 free / 30 pro)
//   - FR-22 / FR-22b analysis input word/token floor and ceiling
//   - FR-31 daily chat message cap (30 free / 500 pro)
//   - FR-42 storage cap (30 MB free / 500 MB pro)

import { prisma } from "@/lib/db/prisma";
import type { PlanTier } from "@prisma/client";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly quota: string,
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

// FR-7: 1 active (non-archived) project on Free, 15 on Pro. Enforced here,
// at creation time, before the Project row is written — never inline in
// the route handler. Exported so UI code can display the limit (e.g. "1 of
// 1 active projects used") without duplicating these numbers elsewhere.
// Free is deliberately a single-project trial, not a small free tier of
// its own — real multi-project usage is the upgrade trigger.
export const PROJECT_LIMITS: Record<PlanTier, number> = { FREE: 1, PRO: 15 };

export async function checkProjectQuota(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const activeCount = await prisma.project.count({
    where: { userId, archivedAt: null },
  });

  const limit = PROJECT_LIMITS[user.plan];
  if (activeCount >= limit) {
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

export async function checkAnalysisQuota(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  });

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const count = await prisma.usageRecord.count({
    where: { userId, kind: "analysis_run", createdAt: { gte: startOfMonth } },
  });

  const limit = ANALYSIS_LIMITS[user.plan];
  if (count >= limit) {
    throw new QuotaExceededError(
      `You've used all ${limit} analysis runs this month. Upgrade to Pro for more, or wait for next month's reset.`,
      "analysis"
    );
  }
}
