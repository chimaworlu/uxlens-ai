// FR-32: "clear chat history" is a soft delete (ChatMessage.deletedAt set,
// see app/api/projects/[id]/chat/history/route.ts's DELETE handler) —
// this is the other half, the daily sweep that turns a 30-day-old soft
// delete into an actual hard delete. A soft-delete flag with no job to
// close it out is a bug that looks like generosity but never frees the
// row, the same shape as AGENTS.md rule 12's grace-period warning.
//
// Relative import with an explicit .ts extension, not the "@/" alias —
// runs inside the worker process, same constraint as lib/quota/checks.ts.
import { prisma } from "../../db/prisma.ts";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function pruneDeletedChatMessages(): Promise<{ pruned: number }> {
  const cutoff = new Date(Date.now() - RETENTION_MS);

  // Citation rows pointing at these messages cascade on delete
  // (Citation.chatMessage onDelete: Cascade in schema.prisma) — no
  // separate cleanup needed for them.
  const { count } = await prisma.chatMessage.deleteMany({
    where: { deletedAt: { not: null, lte: cutoff } },
  });

  return { pruned: count };
}
