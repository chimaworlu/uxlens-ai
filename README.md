# UXLens AI

UXLens AI turns raw UX research documents into structured, citable insights. See [`Docs/prd-uxlens-ai.md`](Docs/prd-uxlens-ai.md) for requirements and [`AGENTS.md`](AGENTS.md) for how this codebase is built.

This repository is public for portfolio purposes only — see [`LICENSE`](LICENSE). It is not open source.

## Local development setup

1. Copy `.env.example` to `.env` and fill in the values you have (Postgres defaults already match `docker-compose.yml`). Document processing, the analysis pipeline, R2 cleanup, and the daily billing/chat-prune jobs run on Supabase (Edge Functions + pgmq + pg_cron) — see `supabase/functions/` — so those need a Supabase project, not anything in this compose file.
2. Start Postgres:
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

## Other commands

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest
- `npm run prisma:generate` — regenerate the Prisma client after a schema change
