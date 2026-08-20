# PRD: UXLens AI — AI Research Analysis for Product Designers

Brand name confirmed by the founder: UXLens AI.

## 1. Product Summary

UXLens AI is a web application that turns raw UX research documents into structured, citable insights. A product designer creates a project, uploads interview notes, survey exports, and customer feedback (PDF, DOCX, TXT, CSV), and triggers an analysis. The system extracts text, runs a multi-pass AI pipeline (DeepSeek confirmed for all passes; Claude optional as an upgrade for synthesis and chat, see Section 6), and produces: a project summary, ranked recurring themes, pain points, and user suggestions. Every output is linked to the exact source snippet it came from, and clicking a citation reveals the original text. A project-scoped chat lets the designer interrogate the research; answers are grounded in the uploaded documents, and any general UX knowledge the AI adds is visually labeled as such.

The product is single-user at MVP, freemium (2 analyses/month free, paid tier via Flutterwave, NGN only per NG-7), English-only, and built on Next.js (App Router), TypeScript, Prisma, PostgreSQL, BullMQ + Redis, and Cloudflare R2. It serves a dual purpose: a real revenue product and a flagship portfolio piece, so the MVP must be polished enough to demo end-to-end (a public, no-signup demo, see FR-37), not just functional.

## 2. Problem Statement

Product designers routinely collect more research than they can process. A single discovery round produces 5–15 interview transcripts, survey exports, and scattered feedback. Synthesizing this manually (affinity mapping, re-reading transcripts, tagging quotes) takes 1–3 full working days per round [ASSUMPTION: practitioner estimate, unvalidated — see Phase 1 task to confirm with 5 designer interviews], and solo designers and small teams rarely have a dedicated researcher to do it. The result: research sits unread, decisions get made on memory and anecdote, and the same user problems get rediscovered project after project.

Generic AI chatbots don't solve this because (a) they lose track of which document said what, (b) they hallucinate insights that aren't in the data, and (c) they have no persistent project structure, so every session starts from zero. Designers need traceable, source-linked synthesis they can defend in a stakeholder meeting, available on demand.

## 3. Goals and Non-Goals

### Goals
- G-1: Reduce time from "documents uploaded" to "usable, citable insight summary" to under 5 minutes for a typical project (10 documents, ~50 pages total).
- G-2: Make every insight defensible: 100% of generated insights, themes, and chat claims about the research carry at least one clickable citation to source text.
- G-3: Reach first paying customer within 60 days of launch; 5% free-to-paid conversion by month 4.
- G-4: Keep AI cost per full project analysis under $0.20 so free tier is sustainable.
- G-5: Serve as a demonstrable portfolio case study: instrumented funnel, before/after metrics, and a public landing page.

### Non-Goals (MVP)
- NG-1: No team collaboration, sharing, commenting, or multi-seat accounts.
- NG-2: No audio/video transcription and no OCR of scanned images or handwriting.
- NG-3: No automated PII redaction (warning only).
- NG-4: No non-English document analysis.
- NG-5: No integrations (Notion, Dovetail, Figma, Zoom). Upload only.
- NG-6: No fine-tuning or custom models. Prompted API calls only.
- NG-7: No multi-currency billing at MVP. Pricing is NGN only; international cards may pay in NGN via Flutterwave but no USD price is offered. USD/Stripe is the Phase 3 path (see R-4).

## 4. User Personas

### Persona 1 — Ada, freelance product designer (primary)
- 26, Lagos. 3 years' experience. Runs 2–4 client projects at a time, does her own research because clients won't pay for a researcher.
- Pain: spends evenings re-reading interview notes; clients ask "how do you know?" and she has no fast way to point to evidence.
- Needs: fast synthesis, citations she can screenshot into client decks, low monthly price in USD she can expense.
- Success moment: uploads 8 interview docs at 9pm, has a themed, cited summary by 9:05, drops it into tomorrow's client presentation.

### Persona 2 — Tunde, in-house designer on a 3-person product team
- 31, works at a fintech startup. Design team of one. PM sends him raw survey CSVs and support ticket exports.
- Pain: research arrives in inconsistent formats; he can't answer PM questions like "how many users mentioned onboarding?" without manual counting.
- Needs: multi-format ingestion, ability to ask ad-hoc questions in chat, evidence counts per theme ("mentioned in 6 of 9 documents").
- Success moment: PM asks a question in standup; he answers from chat with a cited quote in under a minute.

### Persona 3 — Chidera, design lead evaluating tools (secondary)
- 35, leads a 4-person team. Not the MVP buyer (no team features), but the Phase 2 expansion target. Cares about data privacy and export.
- Include her only to shape Phase 2 requirements; do not build for her in MVP.

## 5. Functional Requirements

### Auth
- FR-1: Users can sign up and log in with email + password and with Google OAuth. Use Auth.js (NextAuth v5) with the Prisma adapter.
- FR-2: Email verification is required before the first analysis can run (uploads are allowed pre-verification). If a user changes their email via FR-39, emailVerified resets to false and a new verification email is sent, reusing the same verify-pending flow as initial signup. Analysis is gated on re-verification, uploads remain allowed, consistent with the original signup gate.
- FR-3: Password reset via emailed magic link, expiring after 30 minutes. The password reset request confirmation returns the same neutral message regardless of whether the submitted email is registered, to prevent account enumeration.
- FR-4: Sessions are JWT-based with a 30-day max age and sliding expiration.
- FR-38: Users can delete their account from Account settings. Deletion requires the user to type their own email address to confirm, matching the typed-confirmation pattern already established for project deletion (FR-5). The confirmation screen states plainly what will be lost: all projects, documents, analysis versions, and chat history. If the user has an active Pro subscription, it is cancelled immediately as part of this action, not left running against a deleted account. On confirmation, the user is signed out immediately and redirected to the marketing page, which displays a one-time confirmation banner stating the account was deleted and data will be fully removed within 24 hours. The account and all associated data are hard-deleted within 24 hours via the existing cleanup job (see Section 7, Storage and data handling).
- FR-39: Users can edit their name and email from Account settings. Name changes save immediately with no confirmation step. Email changes require re-verification (see amendment to FR-2 below) before analysis can be run again, matching the original signup verification gate.
- FR-40: Signed-in users can set a new password directly from Account settings by entering their current password plus a new one. This is distinct from the email-based reset in FR-3 and requires the current password to prevent a stolen, still-logged-in session from permanently locking out the real account owner.

### Onboarding
- FR-41: First-time users complete a four-step onboarding flow before reaching the dashboard, in this exact order:
  1. What UXLens does — a brief product explanation screen.
  2. The PII notice, using FR-12's exact wording: "Research documents often contain personal data about participants. Remove names and identifying details you don't need. Files are stored privately and never used to train AI models."
  3. Plan limits — displays the five Free-tier figures: 1 active project (FR-7), 1 document per project (FR-9), 30 MB storage (FR-42), 2 analysis runs/month (FR-21), and 30 chat messages/day (FR-31).
  4. Create your first project — this step both creates the project and ends onboarding, landing the user on the dashboard.

### Projects
- FR-5: Users can create, rename, archive, and delete projects. Delete requires typed confirmation and cascades to documents, analyses, insights, and chat history, and deletes R2 objects within 24 hours via a cleanup job.
- FR-6: Project list shows: name, document count, last analysis date, and a status badge. Status badges show processing, ready, or failed, each corresponding to a real Analysis row's status. A project with no Analysis rows yet shows no badge, or a neutral "Not analyzed" label, this is the absence of an analysis, not a fourth status value, and does not correspond to any AnalysisStatus enum member.
- FR-7: Free tier: max 1 active (non-archived) project. Pro tier: max 15. Enforced at creation with an upgrade prompt.

### Upload
- FR-8: Users can upload PDF, DOCX, TXT, CSV. Client validates extension and MIME type; server re-validates MIME via magic bytes and rejects mismatches with a specific error message.
- FR-9: Max file size 20 MB per file; max 20 documents per project (free: 1 per project).
- FR-42: Free tier storage capped at 30 MB per project, Pro at 500 MB per project, enforced server-side at presign time.
- FR-10: Uploads go directly to Cloudflare R2 via presigned PUT URLs generated server-side; the app server never proxies file bytes.
- FR-11: On upload completion, a `document-processing` job is enqueued that extracts text, chunks it, and stores chunks. Document status transitions: `UPLOADED → EXTRACTING → READY` or `→ FAILED` with a user-readable failure reason (e.g. "This PDF contains no extractable text. It may be a scanned image, which isn't supported yet.").
- FR-12: A persistent, non-blocking PII notice appears on every upload screen: "Research documents often contain personal data about participants. Remove names and identifying details you don't need. Files are stored privately and never used to train AI models."
- FR-13: Users can delete individual documents; deletion removes chunks and R2 objects and marks any analysis that used the document as `STALE` with a "re-run analysis" prompt.

### Analysis
- FR-14: Users trigger analysis at the project level with one button. Analysis covers all `READY` documents in the project at run time.
- FR-15: Analysis is asynchronous. The UI shows a progress state with stages (Extracting themes → Synthesizing insights → Mapping citations) driven by job progress events, and the user can leave the page; status is visible from the project list.
- FR-16: Analysis of a project with 10 documents totaling 50 pages (~40k tokens) completes in under 4 minutes at p90.
- FR-17: Analysis output contains exactly these sections: Executive Summary (max 200 words), Themes (3–10, each with title, description, evidence count, and citations), Pain Points (ranked by frequency, each with citations), User Suggestions (each with citations), Contradictions (explicitly listed when documents disagree; empty state says "No contradictions detected").
- FR-18: Every theme, pain point, suggestion, and contradiction stores 1–10 citations. Each citation links to a specific document chunk with character offsets. Clicking a citation opens a panel showing the snippet highlighted inside its surrounding original text and the source document name.
- FR-19: If a claimed citation cannot be matched back to stored source text (verification step, see section 6), the parent insight is dropped and the drop is logged. Insights without verifiable citations must never render.
- FR-20: Re-running analysis creates a new Analysis version, viewable via a version dropdown. Free tier: previous version is replaced (keep 1). Pro tier: keep last 5, prune older. This matches the Section 8 pricing table.
- FR-21: Free tier: 2 analysis runs per calendar month across all projects. Pro: 30 runs/month. Counter and reset date visible in the billing page. Enforced server-side before enqueueing.
- FR-22: Low-signal input handling: if total extracted text across the project is under 300 words, analysis is refused pre-enqueue with the message "There isn't enough research content here to analyze meaningfully. Add more documents or richer notes." No run is consumed.
- FR-22b: High-volume input handling: if total extracted text across the project exceeds 300k tokens, analysis is refused pre-enqueue with the message "This project has more content than a single analysis can process. Remove some documents or split into two projects." No run is consumed. This caps the worst-case cost referenced in G-4 and the Section 6 cost budget.

### Insights View
- FR-23: The insights page renders the five FR-17 sections with anchor navigation, per-theme evidence counts ("mentioned in 6 of 9 documents"), and citation chips inline.
- FR-24: Users can copy any insight (with its citations formatted as "Document name, snippet") to clipboard, and export the full analysis as PDF.
- FR-25: Users can mark an insight as "starred"; starred insights surface at the top. Stars persist within an analysis version only. Cross-version star persistence is a Phase 2 item (see Section 13), not attempted at MVP.

### Chat
- FR-26: Each project has one persistent chat thread scoped to that project's latest analysis and document chunks. History persists across sessions.
- FR-27: Chat answers stream token-by-token. First token in under 3 seconds at p90.
- FR-28: Grounded answering: the model receives the project's chunks (all of them for typical projects; the top-ranked full-text-search results for large projects, see section 6) and must answer only from that content, citing chunks inline. Citations render as clickable chips identical to the insights view.
- FR-29: If the model supplements with general UX knowledge, that portion renders inside a visually distinct block labeled "General knowledge — not from your research." Enforced by prompting the model to wrap such content in a `<general_knowledge>` tag that the renderer styles.
- FR-30: If no chunk matches any keyword variant (zero results from full-text search across all variants), the answer must say the research doesn't cover the question, and may optionally add a labeled general-knowledge note. It must never fabricate a research-grounded answer. Any additional relevance floor beyond "zero matches" is tuned empirically against the M-5 eval set post-launch, not fixed as a hardcoded `ts_rank` number in this PRD — `ts_rank` has no stable absolute scale across documents of different lengths.
- FR-31: Free tier: 30 chat messages/day per user. Pro: 500/day. Enforced server-side; the input is disabled with an upgrade prompt when exhausted.
- FR-32: Users can clear a project's chat history (soft delete, hard-deleted after 30 days).

### Billing
- FR-33: Flutterwave subscription checkout for the Pro plan, priced in Naira (NGN), card + bank transfer options as supported by Flutterwave in the user's region. Payment plan created via Flutterwave Payment Plans API; recurring charges handled by Flutterwave.
- FR-34: Webhook endpoint verifies Flutterwave signatures (verif-hash header), is idempotent by transaction reference, and handles: successful charge (activate/extend), failed charge (grace period 5 days, then downgrade), cancellation (downgrade at period end).
- FR-35: Billing page shows current plan, usage meters (analyses used/limit, chat messages today/limit, projects, storage), next billing date, and cancel button. Cancellation is self-serve, no email required.
- FR-36: Downgrade behavior: projects over the free cap become read-only (viewable, not analyzable — upload and analysis disabled) rather than deleted. Chat remains available on read-only projects within the free tier's daily chat cap (FR-31), since it costs little and is the strongest re-upgrade pull. Nothing is ever deleted by a downgrade.

### Demo Mode
- FR-37: A single seeded demo project is viewable read-only at a public, unauthenticated route: full insights view with working citations, and a chat capped at 5 messages per browser session. This session-based cap is distinct from FR-31's daily reset cap for authenticated users' chat messages — the demo cap does not reset daily, it is scoped per browser session, not per calendar day. Rate limited to 20 requests/min/IP. No uploads and no analysis triggers are possible in demo mode. Supports the portfolio goal (G-5) and the public landing page (Section 8).

### Navigation
- Every project-scoped screen uses a breadcrumb-plus-tabs pattern: breadcrumb reads "Projects / [project name]", with Documents, Insights, and Chat tabs beneath it.
- Top-bar controls vary by tab: Version dropdown appears only on Insights. Export and Re-run analysis appear on Insights and Chat. None of the three (Version dropdown, Export, Re-run analysis) appear on Documents.
- Settings is a flat list — Account, Billing, Sign out — reached directly from the top bar, with no dropdown menu.
- Billing lives inside Settings, not as a top-level destination, and has its own breadcrumb back to Settings ("Settings / Billing").

## 6. AI Processing Pipeline

Provider split: DeepSeek (`deepseek-chat`) is confirmed for all passes — extraction, synthesis, and chat — behind a single provider interface (per R-6). Claude (`claude-sonnet-4-6` via Anthropic API) is an optional upgrade for Pass B/D (synthesis) and chat, toggled by config, used where quality and instruction-following benefit most. [ASSUMPTION] Claude is not required for MVP to function; if enabled, it is evaluated against the golden eval set (see Section 13) before being made the default rather than swapped in silently. [ASSUMPTION] No embedding provider. Typical projects skip retrieval entirely: the full project text is sent to the model, which is the strongest possible grounding. Large projects fall back to PostgreSQL built-in full-text search (tsvector + GIN index). No vector extension; everything stays inside the locked stack. Tradeoff: keyword matching instead of semantic matching, mitigated by an AI keyword-expansion step at query time (Stage 5) and by always giving chat the full analysis JSON as context. Revisit and add embeddings only if chat retrieval quality (M-5) underperforms.

### Stage 1 — Ingestion
1. Client requests presigned R2 URL → uploads file → notifies server → `Document` row created with status `UPLOADED` → `document-processing` job enqueued (queue: `doc-processing`, concurrency 5).

### Stage 2 — Text extraction
2. Worker downloads from R2. Extraction by type: PDF via `pdf-parse` (fail if extracted text < 50 chars/page average → likely scanned → status `FAILED` with reason); DOCX via `mammoth`; TXT read directly (UTF-8, fall back to latin1); CSV via `csv-parse`, converted to row-wise text ("Row 14: Q: …, A: …") preserving headers as field labels.
3. Extracted text is normalized (whitespace collapse, page markers retained for PDFs) and stored on the Document row (`extractedText`).

### Stage 3 — Chunking and indexing
4. Text is chunked at ~800 tokens with 100-token overlap, split on paragraph boundaries where possible. Each chunk stores document ID, ordinal index, char start/end offsets into `extractedText`, and page number when known.
5. Each chunk's `searchVector` (tsvector of its content, English config) is populated by a database trigger on insert; a GIN index supports fast full-text search.
6. Document status → `READY`.

### Stage 4 — Analysis passes (queue: `analysis`, concurrency 2 per user, 1 job per project at a time)
7. **Pass A (map, DeepSeek):** runs per batch of chunks (max ~30k input tokens per call, so large documents are split across multiple calls rather than sent whole), parallelized 4 batches at a time. Extracts candidate observations as JSON: `{ type: theme|pain|suggestion, statement, verbatim_quote, chunkId }`. Quotes must be verbatim substrings; `chunkId` references the real `DocumentChunk.id` the quote came from (not a hint), which makes Pass C's matching cheaper and more precise.
8. **Pass B (reduce, DeepSeek by default; Claude if enabled):** all Pass A observations plus document metadata are sent to cluster into 3–10 themes, rank pain points by cross-document frequency, list suggestions, and detect contradictions. Output is strict JSON matching a Zod schema; invalid JSON is retried once with the validation error appended, then the job fails cleanly.
9. **Pass C (citation verification, code, no AI):** every `verbatim_quote` is located in source text via exact match, then normalized match (case/whitespace), then fuzzy match (Levenshtein ratio ≥ 0.9 over a sliding window). Matches produce Citation rows with real offsets. Insights whose every quote fails matching are dropped and logged (`citation_drop` event) — this is the hallucination firewall (FR-19).
10. **Pass D (summary, DeepSeek by default; Claude if enabled):** executive summary generated from the verified insight set only, so the summary cannot reference dropped content.
11. Analysis status → `READY`; UI notified via polling (`GET /api/projects/:id/analysis/status`, 3s interval while processing). [ASSUMPTION] Polling over websockets at MVP for simplicity.

### Stage 5 — Chat retrieval flow (no embedding provider)
12. Project size check first: if the project's total chunk content is ≤ 100k tokens (true for most projects at the 25-document cap), skip search entirely — all chunks are sent to the model with their IDs. Grounding does not require search when everything fits in context, and this mode gives the strongest grounding. Steps 12b–12c apply only to larger projects.
12b. User question → one cheap DeepSeek call rewrites it into 3–5 keyword search variants (e.g. "why do people struggle with sign-up?" → "sign-up", "onboarding", "registration confusing", "account creation") → each variant runs through `websearch_to_tsquery` → results merged, top 8 chunks by `ts_rank` across the project, plus the current analysis JSON as context.
12c. Per FR-30, if zero chunks match any keyword variant, the refusal path triggers.
13. The chat model (DeepSeek by default; Claude if enabled) receives: system prompt (grounding rules, citation format `[c:chunkId]`, `<general_knowledge>` tag rule), retrieved chunks with IDs, analysis summary, last 10 chat turns, and the question. Response streams via SSE.
14. Server post-processes the stream: `[c:chunkId]` tokens are validated against actually-retrieved chunk IDs (invalid ones stripped and logged) and transformed into citation chips.

### Cost budget per full analysis (10 docs, ~40k tokens — typical case, DeepSeek + Claude)
- DeepSeek Pass A: ~45k in / 8k out ≈ $0.02
- Claude Pass B + D: ~15k in / 4k out ≈ $0.11
- Total ≈ $0.13, within the G-4 budget of $0.20. Chat: ≈ $0.01–0.02 per message including the DeepSeek keyword-expansion call (negligible, ~$0.0002).
- **Worst case at the FR-22b cap (300k tokens, DeepSeek + Claude):** ≈ $0.45. G-4's $0.20 target is a median/typical-case target tracked via M-10 at p90, not a hard ceiling; FR-22b is the hard ceiling on input size, not on cost per se.
- **If Claude is not enabled (DeepSeek-only pipeline):** costs are lower across the board since DeepSeek is cheaper per token than Claude; the tradeoff is Pass B clustering/contradiction-detection quality, which is why enabling Claude is evaluated against the golden eval set rather than assumed to be better by default.

## 7. Technical Requirements

### Architecture
- Next.js App Router monorepo. UI + API routes in one Next.js app; a separate long-running Node worker process (same repo, `worker/` entry point) consumes BullMQ queues. Deploy: Next.js app on a Node host or serverless; worker on a persistent Node host (e.g. Railway/Fly/VPS) because BullMQ requires a long-lived process. [ASSUMPTION] Single-region deployment; Redis and Postgres managed services in the same region.
- All AI provider keys live server-side only. No AI calls from the client.
- [ASSUMPTION] Transactional email via Resend, for verification emails (FR-2) and password-reset magic links (FR-3). Neither FR is buildable without an email provider, and none was previously named in this PRD.

### API routes (App Router route handlers)
| Route | Method | Purpose |
|---|---|---|
| /api/auth/[...nextauth] | * | Auth.js |
| /api/projects | GET, POST | list/create projects |
| /api/projects/:id | PATCH, DELETE | rename/archive/delete |
| /api/projects/:id/documents/presign | POST | presigned R2 upload URL |
| /api/projects/:id/documents/confirm | POST | confirm upload, enqueue processing |
| /api/documents/:id | DELETE | delete document |
| /api/projects/:id/analysis | POST | enqueue analysis (quota check) |
| /api/projects/:id/analysis/status | GET | poll status + progress stage |
| /api/analyses/:id | GET | fetch analysis payload |
| /api/analyses/:id/export | GET | PDF export |
| /api/projects/:id/chat | POST | ask question (SSE stream) |
| /api/projects/:id/chat/history | GET, DELETE | fetch/clear history |
| /api/billing/checkout | POST | create Flutterwave payment link |
| /api/billing/webhook | POST | Flutterwave webhook (signature-verified) |
| /api/billing/portal | GET | plan + usage summary |
| /api/demo | GET | public read-only seeded demo project (FR-37), no auth |

### Queues (BullMQ on Redis)
- `doc-processing`: concurrency 5, attempts 3, exponential backoff (5s base), job timeout 5 min.
- `analysis`: concurrency 2, attempts 2, timeout 10 min, per-project lock so a project can't have two concurrent analyses.
- `cleanup`: scheduled repeatable jobs — R2 orphan deletion (daily), stale chat hard-delete (daily), analysis version pruning (daily), billing-enforcement (daily: downgrades any subscription that has been `PAST_DUE` for more than 5 days per FR-34; without this job the grace period never actually ends).
- All failures write the reason to the related row's `failureReason` and emit a structured log event.

### Rate limits (server-enforced, Redis-backed sliding window)
- Upload presign: 30/hour/user. Analysis enqueue: quota per FR-21 plus max 1 concurrent per project. Chat: FR-31 daily caps plus 10/min burst. Auth endpoints: 10/min/IP.

### Error handling
- Every job stage wraps in try/catch with typed error classes (`ExtractionError`, `ProviderError`, `ValidationError`). Provider 429/5xx retries with backoff (max 3); on final failure the job fails with a user-safe message and full detail in logs.
- Zod validation on every API input and every AI JSON output. AI output that fails validation twice fails the job; partial results are never persisted.
- Sentry for error tracking; structured JSON logs via pino.

### Storage and data handling
- R2 bucket private; all reads via short-lived presigned GET URLs (15 min). Object keys: `users/{userId}/projects/{projectId}/docs/{documentId}/{sanitizedFilename}`.
- Free tier storage cap 30 MB/project, Pro 500 MB/project, enforced at presign time. See FR-42.
- Account deletion (user-initiated, in settings) hard-deletes all rows and R2 objects within 24 hours via a `cleanup` job. See FR-38 for the full account deletion flow, including subscription cancellation and confirmation requirements.
- Explicit product commitment surfaced in UI and ToS: user documents are never used to train models; API calls to any enabled provider use training opt-out defaults of their commercial API terms. ToS names DeepSeek as the confirmed processor for all research content and questions, and Claude as an optional processor for synthesis/chat if enabled (see R-11 and Section 6).

## 8. Business Model

Purpose is dual (revenue + portfolio), so pricing is real but deliberately simple: one paid tier, no annual plan at MVP. All customer-facing prices are in Nigerian Naira (NGN); AI and infrastructure costs remain in USD, which creates the FX exposure tracked in R-8.

| | Free | Pro — ₦3,000/month (NGN) |
|---|---|---|
| Active projects | 1 | 15 |
| Documents per project | 1 | 20 |
| Analysis runs / month | 2 | 30 |
| Chat messages / day | 30 | 500 |
| Storage per project | 30 MB | 500 MB |
| Analysis version history | last 1 | last 5 |
| PDF export | ✅ | ✅ |

- Payments: Flutterwave Payment Plans (monthly recurring, NGN). [ASSUMPTION] ₦3,000/mo (≈ $2.17 at ~₦1,380/$, July 2026); validate against Nigerian designer willingness-to-pay before launch and revisit after 50 paying users. Price is reviewed quarterly against the NGN/USD rate (see R-8).
- Upgrade triggers (in-product): hitting the analysis quota (strongest intent moment — show upgrade modal with the exact insight they're blocked from generating), hitting the project cap, hitting daily chat cap, storage cap at upload.
- Unit economics check: revenue is in NGN but AI costs are in USD. At ~₦1,380/$ (July 2026), ₦3,000 ≈ $2.17. Pro user worst case = 30 analyses × $0.13 + heavy chat ≈ $5.00 AI cost against ~$2.17 revenue — **a loss of ≈ $2.83/user; worst-case AI cost is ≈ 230% of revenue.** Median expected usage (8 analyses/mo) ≈ $1.20 AI cost against ~$2.17 revenue (≈ 45% margin), but that puts median-usage AI cost at ≈ 55% of revenue, within a few points of the 60%-of-Pro-revenue trigger in R-8 that calls for a price raise or lower analysis cap — at *median* usage, not only the extreme. **[FLAG] At ₦15,000/month this margin held at the extreme; at ₦3,000/month it does not — it's negative at the extreme and thin even at median.** This is a structural change from the prior price point, not a rounding difference, and the existing mitigations (run cap, M-10 monitoring, quarterly review) were sized against the old price's much larger cushion. Recommend revisiting the price, the Pro analysis-run cap (currently 30/month), or both before this ships, rather than waiting for the quarterly review to catch an already-underwater price.
- Portfolio requirement: public landing page with live demo project (read-only, seeded data) so recruiters and clients can try the product without signing up.

## 9. Risks and Mitigations

- R-1 **Hallucinated insights destroy trust.** Mitigation: Pass C citation verification is code, not AI; unverifiable insights are dropped (FR-19); drop rate is a tracked metric with alerting above 15%.
- R-2 **Scanned/image PDFs fail extraction and feel like product breakage.** Mitigation: detect low text density, fail fast with a specific, honest message (FR-11); OCR is a named Phase 2 item.
- R-3 **AI cost blowout from abusive or extreme usage.** Mitigation: hard caps at every layer (file size, doc count, run quota, chat quota, burst limits), per-user daily AI spend ceiling ($2/day) that pauses AI features with a friendly message, cost logged per job.
- R-4 **Flutterwave recurring billing edge cases (failed renewals, currency issues on international cards).** Mitigation: 5-day grace period, webhook idempotency, downgrade-not-delete policy (FR-36), manual reconciliation dashboard query in week one; keep Stripe as a documented fallback in Phase 3 if international card failure rate exceeds 10%.
- R-5 **Privacy: users upload participant PII.** Mitigation: upload warning (FR-12), private bucket, presigned short-lived URLs, hard delete on request, no-training commitment in ToS; automated redaction is Phase 3.
- R-6 **Provider dependency (DeepSeek availability/quality drift), since DeepSeek is the confirmed processor for the entire pipeline.** Mitigation: provider layer behind a single interface so any pass can switch providers (e.g. to Claude, already wired as the optional path per Section 6) with a config change, not a rewrite; per-pass eval set (20 golden documents) run weekly against whichever provider is active.
- R-7 **Single founder bandwidth (design + build + support).** Mitigation: MVP scope is intentionally narrow (see Non-Goals); support via a single shared inbox; status page.
- R-8 **FX squeeze: revenue in NGN, AI/infra costs in USD.** Naira depreciation silently compresses margin without any change in usage. Mitigation: cost dashboard shown in both currencies, quarterly price review pegged to the NGN/USD rate and written into ToS ("prices may be adjusted with 30 days' notice"), and a documented trigger — if AI cost exceeds 60% of Pro revenue equivalent for two consecutive months, raise the NGN price or lower the analysis cap.
- R-9 **Chat gives confident answers to questions the research doesn't cover.** Mitigation: retrieval-threshold refusal path (FR-30) with logged refusal rate; prompt eval cases for out-of-scope questions.
- R-10 **Keyword-based retrieval misses semantically relevant chunks** (user asks about "sign-up", transcript says "onboarding"). Mitigation: AI keyword-expansion step in Stage 5; M-5 eval set includes paraphrase cases; embeddings are the documented upgrade path if M-5 fails.
- R-11 **Research data and chat questions are processed by DeepSeek (confirmed, all passes) and optionally Anthropic (if Claude is enabled for synthesis/chat).** DeepSeek's jurisdiction and data-handling policies may be unacceptable to privacy-sensitive customers, including Persona 3's segment. Mitigation: explicit disclosure in ToS and privacy page naming both providers and which is used for what; the provider abstraction (R-6) supports a Claude-only or DeepSeek-only mode via config; offering a "no DeepSeek" processing tier is evaluated in Phase 2 if demand appears from privacy-sensitive buyers.

## 10. Prisma Data Model

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PlanTier {
  FREE
  PRO
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
}

enum DocumentStatus {
  UPLOADED
  EXTRACTING
  READY
  FAILED
}

enum DocumentType {
  PDF
  DOCX
  TXT
  CSV
}

enum AnalysisStatus {
  QUEUED
  PROCESSING
  READY
  FAILED
  STALE
}

enum InsightType {
  THEME
  PAIN_POINT
  SUGGESTION
  CONTRADICTION
}

enum ChatRole {
  USER
  ASSISTANT
}

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  emailVerified DateTime?
  passwordHash  String?
  name          String?
  image         String?
  plan          PlanTier      @default(FREE)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  projects      Project[]
  subscription  Subscription?
  usageRecords  UsageRecord[]
  accounts      Account[]
  sessions      Session[]
}

// Auth.js standard models
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Project {
  id         String    @id @default(cuid())
  userId     String
  name       String
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  documents    Document[]
  analyses     Analysis[]
  chatMessages ChatMessage[]

  @@index([userId, archivedAt])
}

model Document {
  id            String         @id @default(cuid())
  projectId     String
  filename      String
  type          DocumentType
  status        DocumentStatus @default(UPLOADED)
  failureReason String?
  r2Key         String         @unique
  sizeBytes     Int
  pageCount     Int?
  extractedText String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  project Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  chunks  DocumentChunk[]

  @@index([projectId, status])
  // Note: extractedText can be large (full document text). It must be excluded
  // from default Prisma selects on Document (use an explicit `select` that omits
  // it for list/status queries); fetch it explicitly only where needed — the
  // worker (chunking) and the citation panel (surrounding-text lookup).
}

model DocumentChunk {
  id         String                       @id @default(cuid())
  documentId String
  ordinal    Int
  content    String
  charStart  Int
  charEnd    Int
  pageNumber   Int?
  searchVector Unsupported("tsvector")?

  document  Document   @relation(fields: [documentId], references: [id], onDelete: Cascade)
  citations Citation[]

  @@unique([documentId, ordinal])
  @@index([documentId])
  // Created via raw SQL migration:
  // CREATE INDEX chunk_search_idx ON "DocumentChunk" USING GIN ("searchVector");
  // CREATE TRIGGER chunk_search_update BEFORE INSERT OR UPDATE ON "DocumentChunk"
  //   FOR EACH ROW EXECUTE FUNCTION
  //   tsvector_update_trigger("searchVector", 'pg_catalog.english', content);
}

model Analysis {
  id               String         @id @default(cuid())
  projectId        String
  version          Int
  status           AnalysisStatus @default(QUEUED)
  failureReason    String?
  progressStage    String?
  executiveSummary String?
  costUsd          Decimal?       @db.Decimal(8, 4)
  documentCount    Int            @default(0)
  createdAt        DateTime       @default(now())
  completedAt      DateTime?

  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  insights Insight[]

  @@unique([projectId, version])
  @@index([projectId, status])
}

model Insight {
  id            String      @id @default(cuid())
  analysisId    String
  type          InsightType
  title         String
  description   String
  rank          Int
  evidenceCount Int         @default(1)
  starred       Boolean     @default(false)

  analysis  Analysis   @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  citations Citation[]

  @@index([analysisId, type, rank])
}

model Citation {
  id            String  @id @default(cuid())
  insightId     String?
  chatMessageId String?
  chunkId       String
  quote         String
  charStart     Int
  charEnd       Int

  insight     Insight?      @relation(fields: [insightId], references: [id], onDelete: Cascade)
  chatMessage ChatMessage?  @relation(fields: [chatMessageId], references: [id], onDelete: Cascade)
  chunk       DocumentChunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)

  @@index([insightId])
  @@index([chatMessageId])
  @@index([chunkId])
}

model ChatMessage {
  id        String    @id @default(cuid())
  projectId String
  role      ChatRole
  content   String
  deletedAt DateTime?
  createdAt DateTime  @default(now())

  project   Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  citations Citation[]

  @@index([projectId, createdAt])
}

model Subscription {
  id                    String             @id @default(cuid())
  userId                String             @unique
  status                SubscriptionStatus
  flutterwavePlanId     String
  flutterwaveCustomerId String?
  currentPeriodEnd      DateTime
  cancelAtPeriodEnd     Boolean            @default(false)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UsageRecord {
  id        String   @id @default(cuid())
  userId    String
  kind      String   // "analysis_run" | "chat_message"
  costUsd   Decimal? @db.Decimal(8, 4)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, kind, createdAt])
  // Note: FR-21's monthly quota and FR-31's daily chat cap are enforced by
  // counting UsageRecord rows for the current period via this index at
  // request time. No separate counter/cache table at MVP; revisit only if
  // this query shows up as a bottleneck.
}

model WebhookEvent {
  id         String   @id @default(cuid())
  provider   String   // "flutterwave"
  txRef      String   @unique
  payload    Json
  processed  Boolean  @default(false)
  receivedAt DateTime @default(now())
}
```

## 11. Success Metrics

Instrument all of these from day one (portfolio goal G-5 depends on real numbers).

**Activation**
- M-1: Time-to-first-insight (signup → first READY analysis viewed). Target: median < 15 minutes.
- M-2: Signup → first analysis conversion. Target: ≥ 40% within 7 days.

**Quality / trust**
- M-3: Citation drop rate (insights removed by Pass C ÷ insights generated). Target: < 10%; alert at 15%.
- M-4: Citation engagement rate per analysis session. Target: ≥ 25% of sessions include at least one citation open. (This measures engagement, not trust directly — a click can signal either confidence-building or skepticism. Trust is read through M-3's drop rate and M-9's retention.)
- M-5: Chat grounded-refusal correctness: on the 20-case eval set, 0 fabricated research-grounded answers.

**Engagement**
- M-6: Weekly active projects (projects with an analysis run that week, OR ≥ 5 chat messages that week including at least 1 citation opened). North-star metric. The citation-open requirement on the chat path filters out unproductive back-and-forth from counting as "active."
- M-7: Analyses per active user per month. Target: ≥ 2 by month 3.

**Revenue**
- M-8: Free → Pro conversion. Target: 5% by month 4.
- M-9: Month-2 paid retention ≥ 80%.
- M-10: AI cost per analysis, tracked per job. Target: p90 ≤ $0.20 (G-4).

**Performance**
- M-11: Analysis completion p90 < 4 min (FR-16); chat first-token p90 < 3 s (FR-27).

## 12. Assumptions

All assumptions added by this PRD beyond the prompt, consolidated:

- A-2: Auth.js (NextAuth v5) with Prisma adapter for authentication (FR-1). **[CONFIRMED]**
- A-3: PDF export at MVP (FR-24).
- A-4: Retrieval via PostgreSQL full-text search with AI keyword expansion; no embeddings provider (Section 6). Rationale: keeps the stack exactly as locked with zero new vendors; embeddings are the upgrade path only if M-5 underperforms.
- A-5: deepseek-chat confirmed for all passes (extraction, synthesis, chat) behind a provider interface; claude-sonnet-4-6 optional as a config-toggled upgrade for synthesis/chat, evaluated against the golden eval set before being made default (Section 6). This reflects the founder's confirmed choice: "DeepSeek, and maybe Claude, for integrations."
- A-6: Status updates via polling, not websockets, at MVP (Section 6).
- A-7: Single-region deployment; worker on a persistent Node host because BullMQ needs a long-lived process (Section 7).
- A-8: Sentry + pino for observability (Section 7). **[CONFIRMED]**
- A-9: Pro price ₦3,000/month NGN (≈ $2.17 at ~₦1,380/$, July 2026), single paid tier, monthly only, 30 analysis runs/month, quarterly FX-pegged price review (Section 8). At this price the Section 8 unit economics check no longer clears at worst-case usage — flagged there, not resolved here.
- A-10: Per-user daily AI spend ceiling of $2 as an abuse backstop (R-3).
- A-11: Resend for transactional email (verification, password reset, billing notices) (Section 7). Required for FR-2 and FR-3, which had no email provider named.
- A-12: Hard ceiling of 300k total extracted tokens per project analysis (FR-22b), bounding worst-case cost against G-4 and setting the worst-case figure in the Section 6 cost budget.

## 13. Phased Roadmap

### Phase 1 — MVP (weeks 1–8): "Upload → cited insights → chat"
Ships: auth, projects, upload (4 formats), full analysis pipeline with citation verification, insights view, grounded chat, PDF export, free tier limits, Flutterwave Pro checkout, public demo mode (FR-37), analytics instrumentation.
Why: this is the complete core loop and the smallest thing that is both sellable and portfolio-worthy.

**Priority order within Phase 1** (for a solo founder — if the schedule slips, cut from the bottom, not at random):
1. Core loop: auth, upload, analysis pipeline, citation verification, insights view, chat.
2. Limits and quotas: FR-7, FR-9, FR-21, FR-22, FR-22b, FR-31, FR-42.
3. Landing page + public demo mode (FR-37).
4. Automated Flutterwave billing (checkout, webhook, grace period, downgrade). If this slips past week 8, launch on the free tier only and take the first Pro payments manually via Flutterwave payment links, wiring up automated billing in weeks 9–10. This still allows G-3 (first paying customer within 60 days) to hold.

**Also in Phase 1, not part of the shippable product but required before launch:**
- Week 3: build the 20-case golden eval set (documents + expected insights + out-of-scope chat questions). This gates launch and is a dependency of M-5, R-6, and R-10 — none of which can be measured without it.
- Validate the "1–3 working days" synthesis-time estimate (Section 2) via 5 short interviews with product designers; use the real number in landing page copy instead of the placeholder estimate.

### Phase 2 — Trust and stickiness (weeks 9–16)
Ships: PDF export of analyses, audio transcript upload (accept .vtt/.srt and plain transcripts; no transcription yet), OCR for scanned PDFs (evaluate Textract vs Tesseract by cost), insight starring improvements and cross-version insight tracking, annual billing, email digest ("your research, one week later"), Persona-3-informed groundwork: shareable read-only analysis links.
Why: deepens the trust moat (export + OCR remove the two loudest MVP failure modes) and adds the first viral surface (share links) without full team features.

### Phase 3 — Expansion (weeks 17+)
Ships: team workspaces (multi-seat, roles), integrations (Notion import first, then Dovetail/Google Docs), automated PII redaction at upload (opt-in), multi-language analysis, Stripe as secondary payment provider if R-4 threshold is hit, API access for power users.
Why: moves upmarket toward Chidera-type buyers once single-player value is proven by M-6 and M-8.

## 14. Open Questions

- OQ-1: Should the free tier require a card at signup? (Recommendation: no. It kills M-2 activation; abuse is contained by quotas and the spend ceiling.)
- OQ-2: (Resolved by FR-37 — demo is fully public, no email capture, to maximize portfolio reach. Revisit only if lead capture becomes a priority post-launch.)
- OQ-3: Data residency: any commitment to a specific region (EU users may ask)? MVP assumes one region, unspecified.
- OQ-4: Which sending domain and sender identity to use for transactional email (Resend, per A-11)? Affects deliverability of verification emails to Nigerian inboxes specifically.
- OQ-5: Refund policy wording for Flutterwave subscriptions (pro-rated vs none). Needs a decision before ToS is written.
- OQ-6: Domain availability for "UXLens AI" (name is decided; the domain is not).
