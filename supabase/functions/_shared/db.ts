// Edge Functions talk to Postgres directly via node-postgres (the same
// driver @prisma/adapter-pg wraps, confirmed working in Deno during the
// Phase 0 spike), with hand-written SQL for each function's small, known
// set of operations — rather than running a second Prisma Client
// generator target for Deno. Prisma stays the app's ORM; this is a
// narrower, Edge-Function-specific tool, same spirit as
// lib/pipeline/passC.ts being pure code instead of an AI call.
import pg from "npm:pg@8";

export function getClient(): InstanceType<typeof pg.Client> {
  const connectionString = Deno.env.get("EDGE_DATABASE_URL");
  if (!connectionString) throw new Error("EDGE_DATABASE_URL is not configured.");
  return new pg.Client({ connectionString });
}
