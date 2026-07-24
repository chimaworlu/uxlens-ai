---
name: prisma-migration-workflow
description: How to change the database schema for UXLens AI — any edit to schema.prisma, any new Prisma migration, any raw SQL migration, adding a field, adding an index, or anything touching the searchVector tsvector column. Load this skill before generating any migration, even a "trivial" one.
---

# Prisma Migration Workflow

Teaches the ordered procedure for schema changes in a repo where Prisma-managed migrations and raw SQL migrations coexist. The laws live in `database-schema.md` (what may never change) and AGENTS.md Section 2 (the schema is locked). This skill teaches how to change what's allowed to change without breaking what isn't.

## The procedure

1. Check the change against `database-schema.md` first. Renames, relation restructures, and index drops are forbidden — if the task seems to need one, stop and flag it as a PRD change, don't migrate around it.
2. If adding a field or model: confirm which FR requires it, and note that FR in your summary. Additions without a requirement are scope creep in schema form.
3. Edit `schema.prisma`, following the established conventions: `cuid()` IDs, `createdAt`/`updatedAt`, cascade behavior matching the existing pattern. Do not add a new `onDelete: Cascade` path without flagging it — a new cascade is a new way data disappears.
4. Generate the migration: `npx prisma migrate dev --name <fr-number>-<what-changed>`.
5. **Read the generated SQL before running it.** Look for `DROP COLUMN`, `DROP TABLE`, type changes that truncate, or an unexpected cascade. Any destructive statement gets called out explicitly in your summary before the migration runs — never buried in a feature diff.
6. If the change touches `DocumentChunk`, check whether the raw-SQL companion needs updating. The `searchVector` column's GIN index and its update trigger live in a hand-written SQL migration (the exact statements are in the schema comments), because Prisma's DSL can't manage them. A Prisma-generated migration that recreates or alters `DocumentChunk` can silently drop the trigger — verify it survives.
7. If new raw SQL is needed, create it as its own migration file in the Prisma migrations folder (empty `prisma migrate dev --create-only`, then write the SQL in), so Prisma's migration history stays the single ordered record. Never apply SQL out of band with `psql`.
8. Run the migration against a scratch database first, then run `prisma migrate status` to confirm history is clean.
9. Regenerate the client (`prisma generate`) and run `tsc --noEmit` — a schema change that breaks types must surface now, not at runtime.

## Skeleton

```bash
# Additive change tied to an FR
npx prisma migrate dev --name fr25-insight-starred-field

# Raw SQL companion (e.g., anything touching searchVector's trigger/index)
npx prisma migrate dev --create-only --name fr30-searchvector-trigger
# then edit the generated .sql file by hand:
```

```sql
-- inside the generated migration file — from the schema comments, verbatim:
CREATE INDEX chunk_search_idx ON "DocumentChunk" USING GIN ("searchVector");
CREATE TRIGGER chunk_search_update BEFORE INSERT OR UPDATE ON "DocumentChunk"
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger("searchVector", 'pg_catalog.english', content);
```

## Traps

- Letting Prisma "fix" the `Unsupported("tsvector")` column into something it can manage. It's `Unsupported` on purpose — the trigger and index are raw SQL by design.
- Running a generated migration without reading it. Prisma sometimes expresses a change as drop-and-recreate; that's destructive even when your schema edit looked additive.
- Applying SQL directly with `psql` "just this once." Out-of-band changes desync `prisma migrate status` and poison every future migration.
- Renaming a field because the new name is better. `database-schema.md` forbids it; queries and shipped data depend on the exact names.
- Adding a quota counter/cache table while you're in the schema. Explicitly deferred — count `UsageRecord` rows instead.
- Forgetting `prisma generate` after migrating, then debugging phantom type errors.

## Verify before done

- [ ] Change is additive, or every destructive statement was flagged before running.
- [ ] New fields/models trace to a named FR, stated in the summary.
- [ ] `searchVector`'s GIN index and trigger still exist after the migration (query `pg_indexes` and `pg_trigger` on the scratch DB).
- [ ] `prisma migrate status` clean; no out-of-band SQL.
- [ ] `prisma generate` run; `tsc --noEmit` passes.
- [ ] Tests: full-text search still returns results after the migration (proves the trigger survived); any new field round-trips through a create-and-read; cascade behavior of any touched relation verified (delete parent → children gone, and nothing else).