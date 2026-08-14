import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // max: 10 — explicit pool size per server instance, rather than relying
  // on node-postgres's implicit default of the same value.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 });
  return new PrismaClient({ adapter });
}

// Single Prisma client instance, reused across hot reloads in dev (AGENTS.md Section 4).
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
