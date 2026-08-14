// Every quota, cap, and limit check in the product lives in this file
// (AGENTS.md Section 4 / Section 3 rule 4). Nothing outside this module
// writes an `if (count >= limit)` check inline in a route handler.
//
// Implemented incrementally as each limit's feature is built:
//   - FR-7  project cap (3 free / 50 pro)
//   - FR-9  document-per-project cap (10 free / 25 pro)
//   - FR-21 monthly analysis run cap (3 free / 30 pro)
//   - FR-22 / FR-22b analysis input word/token floor and ceiling
//   - FR-31 daily chat message cap (30 free / 500 pro)
//   - FR-42 storage cap (100 MB free / 2 GB pro)

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

// FR-7: 3 active (non-archived) projects on Free, 50 on Pro. Enforced here,
// at creation time, before the Project row is written — never inline in
// the route handler. Exported so UI code can display the limit (e.g. "0 of
// 3 active projects used") without duplicating these numbers elsewhere.
export const PROJECT_LIMITS: Record<PlanTier, number> = { FREE: 3, PRO: 50 };

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
