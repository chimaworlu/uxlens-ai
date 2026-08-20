import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // max: 10 — explicit pool size per server instance, rather than relying
  // on node-postgres's implicit default of the same value.
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
    max: 10,
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
