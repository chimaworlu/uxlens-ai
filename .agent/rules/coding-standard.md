---
trigger: always_on
---

# Coding Standard

Source of truth for requirements: `PRD-UXLens-AI.md`. Source of truth for behavior: `AGENTS.md`. This file governs code shape only — how code is written, not what it does.

## Language and runtime

- TypeScript strict mode is on, everywhere. No `any` used to silence an error. If a type is genuinely unknown at a boundary (parsed JSON, an API response), model it as `unknown` and narrow it with a Zod schema before using it.
- No `.js` files in `/app`, `/lib`, `/worker`, or `/prisma`. Config files that must be `.js` or `.mjs` by tool convention (e.g. `next.config.js`) are the only exception.
- Current Node.js LTS. Do not pin to an old version out of habit; do not adopt an experimental/canary feature either.
- Latest stable release of every locked dependency (Next.js, Prisma, etc.) — "locked" means the choice of tool is fixed, not the version.

## Validation boundaries

- Every API route input is validated with a Zod schema before any business logic runs. The schema lives next to the route it validates, not in a shared "all schemas" file.
- Every AI JSON output (Pass A/B/D observations, chat structured fields) is validated with a Zod schema. If validation fails twice, the job fails cleanly — it does not persist partial or best-guess data.
- Client-side validation exists for UX (instant feedback) but is never trusted as the enforcement point. The server re-validates everything the client already checked.

## Errors

- Every thrown error in the pipeline and worker is a typed class (`ExtractionError`, `ProviderError`, `ValidationError`, and others as needed) — never a bare `throw new Error("something broke")` where a typed class is expected.
- Provider errors (429, 5xx) retry with backoff (max 3 attempts) before failing. The failure reason is written to the row's `failureReason` field and logged structurally — never swallowed silently.
- User-facing error messages are specific and honest ("This PDF contains no extractable text" — not "Something went wrong"). Full technical detail goes to logs, not to the user.

## Structure and style

- Small, named functions over clever one-liners. A newcomer should be able to follow a pipeline stage by reading function names, without you explaining it to them.
- No commented-out code left in a commit. Delete it — git history remembers it.
- Comment the "why," not the "what." If a comment explains what a line does, the line should be rewritten to be self-explanatory instead.
- No premature abstraction. Don't build a plugin system, a generic config layer, or a caching layer for something that has exactly one implementation today. The one deliberate exception is the AI provider interface (`/lib/ai/provider.ts`), because the PRD requires DeepSeek/Claude to be swappable by config. A second, non-exempt example: quota checks count `UsageRecord` rows at request time — do not add a counter table, Redis cache, or denormalized running total for this unless a real bottleneck is measured. The PRD explicitly defers that optimization; building it early is scope creep with a technical disguise.

## Testing

- Every rule in `AGENTS.md` Section 3 ("What must never happen") that a task touches gets a test, not just the happy path. A citation-verification change needs a test that proves an unverifiable insight is dropped, not just one that proves a verifiable one renders.
- Tests for quota/cap enforcement assert the server rejects an over-limit request even if a client-side check would have blocked it first — the point is to prove the server doesn't trust the client.

## Definition of done for any code change

- Builds with zero TypeScript errors (`tsc --noEmit` passes).
- No `any`, no bare `Error` throws, no commented-out code, no new abstraction without a named second use case.
- Every new API input and every new AI output has a Zod schema.