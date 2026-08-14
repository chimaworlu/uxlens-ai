# AGENTS.md — UXLens AI

This file governs how you, the coding agent, behave while building this product. It does not describe features. Features live in the PRD and in the tasks you are given. This file exists to stop you from doing the things agents do when they only have a PRD: picking your own tools, inventing folder structures, building later-phase features early, and quietly breaking business rules while the code still runs.

If a rule here conflicts with something in a task description, this file wins. Stop and ask.

---

## 1. What is this project

UXLens AI is a web app for product designers. A designer uploads research documents (interview notes, survey exports, customer feedback), the system runs those documents through an AI pipeline, and produces themes, pain points, and suggestions — every single one backed by a clickable citation to the exact source text it came from. A project-scoped chat lets the designer ask questions, answered only from their own uploaded research.

You are building the **MVP (Phase 1)** only. Phase 2 and Phase 3 items listed in the PRD's roadmap do not exist yet as far as you are concerned — see Section 7 of this file for what that means in practice.

The product serves two purposes at once: it is a real product Nigerian freelance and in-house designers will pay for in Naira, and it is the founder's flagship portfolio piece. Both purposes depend on the same thing: **every insight the app shows must be traceable back to real source text.** That is the single idea this whole product proves. Protect it above all else.

**Source of truth:** `Docs/prd-uxlens-ai.md` (the reviewed v2, with corrections R-1 through R-11 and FR-1 through FR-42 applied). If this AGENTS.md and the PRD ever disagree on a fact or number, the PRD wins — this file governs behavior, the PRD governs requirements. If they disagree on *how* something must be built, ask before proceeding; do not silently pick one.

---

## 2. What is locked

These choices are already made. You do not evaluate alternatives, propose swaps, "modernize" them, or introduce a competing library that does the same job. If you think one of these is wrong, say so in a comment and keep building with the locked choice. Do not silently substitute your own judgment.

**Stack**
- Next.js, App Router only. Never Pages Router.
- TypeScript everywhere. No `.js` application files, no `any` used to dodge a type error. Pinned to `6.0.3`, not the newer `7.x` line: TypeScript 7 restructured its package (native/Go compiler) and dropped the `lib/typescript.js` entry point that Next.js 16.2.10's TypeScript-setup verifier hardcodes, which makes Next think TypeScript isn't installed and loop on auto-install. Revisit this pin once a Next.js release recognizes TS 7's new layout.
- Prisma as the only ORM. No raw SQL query builders, no second ORM introduced "for this one query" (raw SQL via `prisma.$queryRaw` for the full-text search index is the one named exception — see Section 6 pipeline notes).
- PostgreSQL as the only database. No SQLite for local dev, no MongoDB for "the chat history because it's more flexible."
- BullMQ + Redis as the only job queue. No cron-only solutions, no second queue library.
- Cloudflare R2 as the only file store. Never store uploaded files on local disk or in Postgres.

**Services**
- Flutterwave is the only payment provider. NGN is the only currency. Do not add Stripe, Paystack, or any USD price — that is explicitly out of scope (NG-7) until Phase 3, and only then if a documented trigger in the PRD is hit.
- Auth.js (NextAuth v5) with the Prisma adapter is the only auth system. Do not hand-roll session handling.
- Nodemailer (Gmail SMTP) is the only transactional email provider.
- Sentry for error tracking, pino for structured logs. Do not add a second logging library.

**AI providers**
- DeepSeek (`deepseek-chat`) is the confirmed provider for every pass in the pipeline — extraction, synthesis, and chat. It must work end to end with DeepSeek alone; nothing in the MVP is allowed to require Claude to function.
- Claude (`claude-sonnet-4-6`) is an **optional** upgrade for synthesis (Pass B/D) and chat, switched on by config, never hardcoded as the only path. Both providers sit behind one provider interface — you must be able to swap either one by changing config, not by editing call sites.
- No embedding provider. No vector database. No pgvector extension. Retrieval is PostgreSQL full-text search (`tsvector` + GIN index) plus a DeepSeek keyword-expansion step, and only when the project doesn't fit in context (see Section 6 pipeline). Do not add Voyage, OpenAI embeddings, Pinecone, or any vector store because it would "improve retrieval quality." That tradeoff was made deliberately and is revisited only if metric M-5 fails after launch, and only by a human decision, not by you mid-build.

**Data model**
- The Prisma schema in the PRD (Section 10) is locked. Every model, enum, field name, and index in it is authoritative. You may add fields the PRD's functional requirements clearly require and the schema is missing (flag it when you do), but you do not rename existing fields, restructure relations, or drop indexes to suit a different query pattern you prefer.
- `DocumentChunk.searchVector` and its GIN index and update trigger are created via raw SQL migration, not through the Prisma schema DSL (`Unsupported("tsvector")` is intentional). Do not try to model it as a normal Prisma-managed column.

**Architecture shape**
- One Next.js app for UI and API routes. One separate, long-running Node worker process (its own entry point, e.g. `worker/index.ts`) for BullMQ consumers. These are two deployable processes, not one. Never move queue consumers into a Next.js API route or a serverless function — BullMQ needs a persistent process.
- Analysis status updates are delivered by polling (`GET /api/projects/:id/analysis/status`, ~3s interval), not websockets or server-sent events for status. This is a deliberate MVP simplicity choice, not an oversight — do not add a websocket layer for status updates because it seems like the more modern approach. (Chat responses are the one place SSE streaming is used, per FR-27/FR-28 — that's a different, already-decided mechanism and doesn't change this rule.)

If a task asks you to add a tool or service not on this list, stop and flag it instead of adding it.

---

## 3. What must never happen

Every rule below is a hard boundary. **Breaking any rule on this list means the task has failed, even if the code compiles, the tests pass, and the feature demos correctly.** A working feature built on top of a broken rule is not a smaller bug — it is the whole product's core promise failing quietly. Treat these with the same seriousness as a security hole, because for this product, several of them are one.

1. **Never render an insight that lacks a verified citation.** Citation verification (Pass C) runs as deterministic code, never as an AI judgment call. If every quote in an insight fails matching against stored source text, that insight is dropped and logged — it must never reach the UI. *(FR-19, the hallucination firewall — this is the single most important rule in this file.)*

2. **Never let the chat fabricate a research-grounded answer.** If no chunk matches the question, the chat must say the research doesn't cover it. It may add general knowledge, but only inside a visually distinct, clearly labeled block — never blended in as if it came from the user's documents. *(FR-29, FR-30)*

3. **Never call an insight, theme, pain point, or chat answer "from the research" unless it is.** The general-knowledge/research-grounded distinction is not cosmetic. Do not merge the two code paths to simplify rendering.

4. **Never let analysis or chat bypass a quota, cap, or size limit, for any user, under any condition — including your own test accounts.** This includes: free tier's 3 projects / 3 analyses per month / 10 documents per project / 100 MB storage / 30 chat messages per day / 1 kept analysis version; Pro's corresponding higher limits (50 projects / 30 analyses per month / 25 documents / 2 GB / 500 chat messages per day / 5 kept analysis versions); the 300-word minimum and 300k-token maximum on analysis input; and the file size and document count caps on upload. Every one of these is enforced **server-side**, before the expensive work is queued — never trust a client-side check alone, and never skip the check because "it's obviously under the limit." *(FR-7, FR-9, FR-20, FR-21, FR-22, FR-22b, FR-31, FR-42)*

5. **Never proxy uploaded file bytes through the application server.** Uploads go directly from the browser to Cloudflare R2 via a presigned URL the server generates. If you find yourself writing code that reads a file into the Next.js server and re-uploads it, stop — that is the wrong pattern.

6. **Never call an AI provider from client-side code.** All provider API keys live server-side only, in the worker or in server-only API routes. If a key would ever end up in a bundle shipped to the browser, that's a stop-everything problem, not a code review comment.

7. **Never delete anything on downgrade.** When a user's plan drops below what their data needs, the excess becomes read-only (chat still works within the free daily cap; upload and analysis are disabled). Data is deleted only on explicit user action (document delete, project delete with typed confirmation, account deletion) — never as a side effect of a billing state change. *(FR-36)*

8. **Never accept a file by trusting its extension.** Validate MIME type via magic bytes server-side, even though the client already validated the extension. A mismatch is rejected with a specific error message, not silently coerced. *(FR-8)*

9. **Never train, fine-tune, or send user documents to any provider outside the terms disclosed in the ToS.** DeepSeek is the confirmed processor for all research content and chat questions; Claude is used only if explicitly enabled, and only for synthesis/chat, never for anything the ToS doesn't name. Both must be called with training opt-out defaults. *(FR-12, R-11)*

10. **Never charge, price, or display an amount in any currency other than NGN.** No USD price anywhere in the product, even as a secondary display, at MVP. *(NG-7)*

11. **Never let a webhook be processed twice.** The Flutterwave webhook handler is idempotent by transaction reference — verify the signature, then check whether that `txRef` has already been processed before acting on it. *(FR-34)*

12. **Never let a `PAST_DUE` subscription stay Pro forever.** The grace period (5 days) must actually end via the daily billing-enforcement job. If you build the grace period without also building the job that terminates it, you have built half a feature that behaves like a bug.

13. **Never persist partial or unvalidated AI output.** Every AI JSON response is validated against its Zod schema. If it fails validation twice, the job fails cleanly — it does not save whatever partial data it managed to parse.

14. **Never skip the PII notice on the upload screen**, and never claim data is anonymized, redacted, or safe from containing personal information — automated PII redaction does not exist at MVP (NG-3). The notice is a warning, not a guarantee; don't let copy or UI imply otherwise.

15. **Never build a feature from Phase 2 or Phase 3 into the MVP**, even if it looks like "just a small addition" while you're already in that part of the code. This includes: PDF export, OCR, audio transcription, team workspaces, integrations (Notion/Dovetail/Figma/Zoom), automated PII redaction, multi-language support, annual billing, a second payment provider, or cross-version star persistence (FR-25 keeps starring scoped to a single analysis version at MVP — do not add fuzzy title-matching across versions). If a task seems to require one of these to feel "complete," stop and flag it — the incompleteness is intentional scope, not a gap for you to fill. *(NG-1 through NG-7, Phase 2/3 roadmap)*

16. **Never let the public demo route (FR-37) do anything beyond read-only viewing.** It is the one unauthenticated surface in the entire product. No uploads, no analysis triggers, no path into the real pipeline or provider APIs beyond the capped demo chat. Enforce the 5-messages-per-session chat cap and the 20 req/min/IP rate limit on this route specifically — a gap here is a direct cost and abuse exposure with no login wall behind it.

17. **Never delete a project without the user typing a confirmation first.** Project deletion cascades to documents, analyses, insights, and chat history — that's irreversible, and it must require typed confirmation before it runs, not just a confirm dialog with an OK button. *(FR-5)*

18. **Never delete a user's account without typed email confirmation first.** Never leave a Pro subscription active against a deleted account, cancel it as part of the same action, not as a separate cleanup step. *(FR-38)*

---

## 4. How is the work arranged

```
/app                        # Next.js App Router — UI + API routes only
  /(marketing)
    /page.tsx                # landing page
    /demo/page.tsx            # FR-37 public demo, no auth
  /(app)
    /projects/...
    /projects/[id]/insights/...
    /projects/[id]/chat/...
    /billing/...
  /api
    /auth/[...nextauth]/route.ts
    /projects/route.ts
    /projects/[id]/route.ts
    /projects/[id]/documents/presign/route.ts
    /projects/[id]/documents/confirm/route.ts
    /documents/[id]/route.ts
    /projects/[id]/analysis/route.ts
    /projects/[id]/analysis/status/route.ts
    /analyses/[id]/route.ts
    /analyses/[id]/export/route.ts
    /projects/[id]/chat/route.ts
    /projects/[id]/chat/history/route.ts
    /billing/checkout/route.ts
    /billing/webhook/route.ts
    /billing/portal/route.ts
    /demo/route.ts

/worker                     # separate long-running process, own entry point
  index.ts                   # starts all BullMQ consumers
  /queues
    doc-processing.ts
    analysis.ts
    cleanup.ts

/lib
  /ai
    provider.ts               # single interface — DeepSeek/Claude swap happens here only
    deepseek.ts
    claude.ts
  /pipeline
    extract.ts                # Stage 2: text extraction by file type
    chunk.ts                  # Stage 3: chunking + search vector
    passA.ts / passB.ts / passC.ts / passD.ts   # Stage 4
    retrieval.ts               # Stage 5: size check → full-context or FTS+keyword-expansion
  /billing
    flutterwave.ts
  /email
    nodemailer.ts
  /storage
    r2.ts                      # presign, object key builder
  /db
    prisma.ts                  # single Prisma client instance
  /quota
    checks.ts                  # every FR-7/FR-9/FR-21/FR-22/FR-22b/FR-31 check lives here, called from API routes before enqueueing anything

/prisma
  schema.prisma                # locked, see Section 2

/tests
  # mirrors /lib and /app structure

AGENTS.md                     # this file
Docs/prd-uxlens-ai.md         # source of truth for requirements
```

Rules about this layout:
- **Quota and limit checks live in one place** (`/lib/quota`), not scattered inline in route handlers. Every enforcement point in Section 3, rule 4, calls into this module. If you're about to write `if (count >= limit)` somewhere outside `/lib/quota`, stop and put the check there instead.
- **The AI provider interface (`/lib/ai/provider.ts`) is the only place that knows which provider is active.** Nothing else imports `deepseek.ts` or `claude.ts` directly.
- **Never send a whole document to an AI model in one call.** Pass A (`passA.ts`) processes chunk batches (max ~30k input tokens per call), never a full document at once — a single large PDF can exceed a model's context window, and this must not be discovered in production. If a task touches Pass A, confirm the batching logic is present, not "the document fit fine in my test file."
- **Never fetch `Document.extractedText` by default.** It can hold megabytes of text. Any Prisma query on `Document` for lists, statuses, or metadata must explicitly `select` only the fields it needs. `extractedText` is fetched only by the worker (chunking) and the citation panel (surrounding-text lookup).
- **Pass C (citation verification) lives in `/lib/pipeline/passC.ts` and contains no AI calls.** It is pure code: string matching, normalization, fuzzy matching. If you find yourself asking an LLM to "double check" a citation, that is the wrong file.
- **The worker and the Next.js app share `/lib` and `/prisma` but nothing else.** The worker never imports from `/app`. The app never runs a BullMQ consumer in-process.

---

## 5. How should the code look

- **TypeScript strict mode on.** No `any` as an escape hatch — if a type is genuinely unknown, model it with `unknown` and narrow it.
- **Current LTS Node.js.** Use whatever the active Node LTS is at the time of building; do not pin to an old version out of habit, and do not adopt an experimental/canary Node feature either.
- **Current stable major versions of Next.js, Prisma, and other locked dependencies** — "locked" in Section 2 means the *choice* of tool is fixed, not that you should use an outdated version of it. Use the latest stable release of each locked tool.
- **Small, named functions over clever one-liners.** Someone reading this code for the first time should be able to follow the pipeline stage by stage without needing you to explain it.
- **Every error class is typed** (`ExtractionError`, `ProviderError`, `ValidationError`, etc.) — no throwing bare strings or generic `Error` where a typed class is expected by the error-handling design.
- **Zod for every boundary**: every API input, every AI JSON output. Validation lives next to the schema it validates, not duplicated across files.
- **No commented-out code left in.** Delete it; git history remembers it.
- **No premature abstraction.** Don't build a plugin system for something that has exactly one implementation. The provider interface in Section 4 is the one deliberate exception, because the PRD requires it. Concretely: quota checks (FR-21, FR-31) count `UsageRecord` rows for the current period at request time via the existing index — do not build a separate counter table, cache, or denormalized running total for this unless it's demonstrated to be a real bottleneck; the PRD explicitly defers that optimization.
- **Comment the "why," not the "what."** Code should be readable enough that a comment explaining what a line does is a sign the line should be rewritten instead.

---

## 6. What counts as done

Before you consider any task complete, produce a checklist covering everything below that applies to the task, and confirm each item:

- [ ] The code builds with zero errors and zero TypeScript errors (`tsc --noEmit` passes).
- [ ] Every functional requirement (FR-#) the task was scoped to implement is fully implemented — not partially, not with a TODO standing in for the hard part.
- [ ] Every quota, cap, and limit relevant to the task is enforced **server-side** and routes through `/lib/quota` (Section 3, rule 4).
- [ ] If the task touches insight generation, chat, or citations: no insight or chat answer can render without a verified citation, and this was checked by tracing the actual code path, not assumed.
- [ ] If the task touches billing: the webhook handler is idempotent, and the grace-period-to-downgrade path is wired to the `cleanup` queue's billing-enforcement job.
- [ ] If the task touches uploads: MIME validation happens both client-side and server-side (magic bytes), and files never pass through the app server.
- [ ] If the task touches AI calls: they go through `/lib/ai/provider.ts`, never a direct provider SDK call from application code.
- [ ] Zod schemas validate every new API input and every new AI JSON output.
- [ ] No Phase 2 or Phase 3 feature was added, even partially, even as a "nice to have while I was in there."
- [ ] No locked tool, service, or schema decision (Section 2) was swapped, added to, or "improved."
- [ ] If the task has a stated performance target (e.g. FR-16's 4-minute analysis p90, FR-27's 3-second first-token p90), it was actually measured against realistic data, not assumed from a small test case.
- [ ] Every price, amount, or currency symbol shown to the user is NGN, with no USD anywhere on the screen or in an API response.
- [ ] Tests exist for the rules in Section 3 that the task touches, not just for the happy path.
- [ ] The task's own PRD requirement numbers are listed in the summary, so the correspondence between "what was asked" and "what was built" is checkable.

---

## 7. What to do when unsure

You do not have permission to guess your way past ambiguity by inventing scope. When you hit a genuine unknown:

1. **Do not add a new feature to fill the gap.** If the PRD or a task is silent on something, that silence is not an invitation.
2. **Do not expand scope "to be safe."** Building more than was asked is not a safer default — it's untested surface area nobody requested and nobody reviewed.
3. **Do not write a quick, ugly version "just to unblock yourself" and move on.** If you don't know the right way to do it, half-doing it and leaving spaghetti behind is worse than stopping. A messy stopgap becomes tomorrow's foundation whether anyone intended that or not.
4. **Stop and ask a specific question.** Name the exact ambiguity, name the PRD section or FR number it relates to, and propose the smallest reasonable interpretation — but wait for confirmation before building on top of a guess for anything that touches Section 3's rules, the data model, or a locked choice.
5. **The PRD's Open Questions (OQ-1 through OQ-6) are explicitly undecided — not defaults for you to fill in.** These include the refund policy wording, data residency commitments, and the email sending domain. If a task requires one of these to be resolved to proceed, stop and ask; do not pick an answer and build as if it were settled.
6. **If the ambiguity is minor and doesn't touch Section 3, the data model, a locked choice, or an open question above**, make the smallest reasonable assumption, implement it, and flag the assumption clearly in your summary so a human can correct it cheaply — the same way the PRD itself flags `[ASSUMPTION]` items rather than hiding them.

The test for all of the above: if you're not sure whether something counts as "unsure enough to stop," ask yourself whether guessing wrong here would look like a rule violation from Section 3 a week from now. If yes, stop. If it's genuinely cosmetic, proceed and flag it.
