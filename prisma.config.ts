import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: schema.prisma's datasource block carries no `url` line.
// The CLI (migrate/introspect) reads the connection string from here.
// The application runtime instead connects via the @prisma/adapter-pg
// driver adapter, configured in /lib/db/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
