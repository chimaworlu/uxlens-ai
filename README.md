# UXLens AI

UXLens AI turns raw UX research documents into structured, citable insights. See [`Docs/prd-uxlens-ai.md`](Docs/prd-uxlens-ai.md) for requirements and [`AGENTS.md`](AGENTS.md) for how this codebase is built.

## Local development setup

1. Copy `.env.example` to `.env` and fill in the values you have (Postgres/Redis defaults already match `docker-compose.yml`).
2. Start Postgres and Redis:
   ```
   docker compose up -d
   ```
3. Apply database migrations:
   ```
   npx prisma migrate dev
   ```
4. Run the Next.js app:
   ```
   npm run dev
   ```
5. Run the worker (separate process, required for uploads/analysis):
   ```
   npm run worker
   ```

## Other commands

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest
- `npm run prisma:generate` — regenerate the Prisma client after a schema change
