---
trigger: always_on
---

# Database Schema Rules

The Prisma schema defined in the PRD (Section 10) is the locked source of truth for every model, enum, field, and index. This file governs how you change it.

## What you may never do

- **Never rename an existing field, model, or enum value.** Downstream code, queries, and (once shipped) production data depend on the exact names in the PRD. If a name genuinely needs to change, that's a PRD change to propose, not a schema edit to make unilaterally.
- **Never restructure a relation** (e.g. turning a one-to-many into a many-to-many, or collapsing two models into one) to make a query easier to write. Write the query to fit the schema, not the other way around.
- **Never drop an index that exists in the locked schema**, even if your new query pattern doesn't need it — another query probably does.
- **Never model `DocumentChunk.searchVector` as a Prisma-managed column.** It is `Unsupported("tsvector")` on purpose. The GIN index and the update trigger that populates it are created via raw SQL migration, not the Prisma schema DSL. If you find yourself trying to make Prisma "properly" manage this field, stop — that's the wrong direction.
- **Never add a default `SELECT *` query path that returns `Document.extractedText`.** It can hold megabytes of text per row. Every query against `Document` for lists, statuses, or metadata must use an explicit `select` that omits `extractedText`. It is fetched only by the worker (chunking) and the citation panel (surrounding-text lookup) — nowhere else.
- **Never build a separate counter, cache table, or denormalized total for quota tracking.** `UsageRecord` rows are counted for the current period at request time via the `[userId, kind, createdAt]` index. This is a documented, deliberate MVP decision — optimize it only when a real bottleneck is measured, not preemptively.

## What you may do

- Add new fields to an existing model when a functional requirement clearly needs one and the schema doesn't have it — but flag it explicitly in your summary (which FR required it, why the existing schema didn't cover it).
- Add new indexes when a query pattern genuinely needs one, as long as you're not removing an existing one to do it.
- Add new models for genuinely new entities a task introduces, following the naming and relation conventions already established (e.g. `cuid()` IDs, `createdAt`/`updatedAt` timestamps, cascade deletes matching the pattern used elsewhere).

## Migrations

- Every schema change ships with a Prisma migration, generated and reviewed — never a manual `ALTER TABLE` applied out of band, except for the two raw-SQL cases the PRD names explicitly (the `searchVector` trigger/index).
- Migrations are additive by default. A destructive migration (dropping a column, changing a type in a way that loses data) requires an explicit call-out in your summary before it runs — never a silent part of a larger change.
- Cascade delete behavior (`onDelete: Cascade`) mirrors what's already in the locked schema: deleting a `Project` cascades to `Document`, `Analysis`, `ChatMessage`; deleting a `Document` cascades to `DocumentChunk`; deleting an `Analysis` cascades to `Insight`. Do not add a cascade path that isn't already there without flagging it — a new cascade is a new way data can disappear.

## Data integrity

- Every citation (`Citation` row) must reference a real, existing `DocumentChunk.id`. Never create a `Citation` from an unverified quote — that's Pass C's entire job (see `AGENTS.md`, rule 1).
- Money and cost fields (`Analysis.costUsd`, `UsageRecord.costUsd`) are `Decimal(8, 4)`, matching the locked schema — never `Float`, which introduces rounding error in exactly the fields where it matters most for the unit-economics tracking in the PRD (M-10).