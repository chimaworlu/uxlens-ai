import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // DB_POOL_MAX: connections per running instance. Serverless (Vercel) runs
  // many instances at once, so it should be 1 there; the long-running worker
  // keeps the default of 10.
  //
  // keepAlive — local dev only, but load-bearing here: Docker Desktop's
  // WSL2 port-forwarding layer resets idle pooled connections to the
  // Postgres container after ~30s, which surfaced as random "Server has
  // closed the connection" errors (including mid-login, since the
  // Credentials provider's authorize() hits the DB). TCP keepalive probes
  // keep the pooled connections looking active so that layer doesn't
  // reap them.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

// Single Prisma client instance, reused across hot reloads in dev (AGENTS.md Section 4).
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
