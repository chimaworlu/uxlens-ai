import pino from "pino";

// Single shared logger, reused everywhere (same convention as
// lib/db/prisma.ts's shared Prisma client). PRD Section 7: "structured
// JSON logs via pino" — plain JSON lines in every environment, which is
// what a log aggregator (Sentry, CloudWatch, etc.) actually wants to
// ingest, rather than a dev-only pretty-printed format that would then
// need its own separate production path.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
