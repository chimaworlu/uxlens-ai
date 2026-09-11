import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

// FR-25: star toggle. Stars persist within an analysis version only —
// there's nothing here that copies a star across a re-run, that's
// deliberate, not an oversight.
const StarSchema = z.object({
  starred: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: insightId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = StarSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { starred } = parsed.data;

  const insight = await prisma.insight.findFirst({
    where: { id: insightId, analysis: { project: { userId } } },
    select: { id: true },
  });
  if (!insight) return NextResponse.json({ error: "Insight not found." }, { status: 404 });

  const updated = await prisma.insight.update({
    where: { id: insightId },
    data: { starred },
    select: { id: true, starred: true },
  });

  return NextResponse.json(updated);
}
