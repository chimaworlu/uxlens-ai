---
trigger: glob
---

# AI Pipeline Rules

Every rule in this file is written to hold true regardless of which provider is active. DeepSeek (`deepseek-chat`) is the confirmed provider for the entire pipeline — extraction, synthesis, and chat — and must work correctly alone. Claude (`claude-sonnet-4-6`) is an optional, config-toggled upgrade for synthesis and chat. **A task is not done if it only works with one of the two configurations.** If you write a rule, a prompt, or a piece of logic that only makes sense for one provider, that's a sign it belongs in provider-specific config, not in the shared pipeline.

## The provider boundary

- Every AI call goes through the single provider interface (`/lib/ai/provider.ts`). Nothing else in the codebase imports a provider SDK directly, calls a provider's API URL, or branches on `if (provider === 'deepseek')` outside that one file. If application code needs to know which provider is active, that's a sign the interface is leaking — fix the interface, don't spread the branch.
- Which provider handles which pass is config, not a hardcoded call site. Pass A (extraction) always runs on DeepSeek. Pass B and Pass D (synthesis) and chat run on DeepSeek by default, Claude if enabled. Never hardcode a specific provider's model string inside a pass's logic file — the pass calls the interface, the interface resolves the active provider.
- Claude is never made the default for any pass without first being evaluated against the golden eval set (see "Evaluation" below). Flipping a default without that evaluation is not a config change, it's an unvalidated quality regression risk shipped silently.
- If a task only passes its tests with Claude enabled, or only passes with DeepSeek, that is a bug in the task, not an acceptable outcome. Test both configurations before calling a pipeline change done.

## Citation verification is never delegated to a model

- Pass C (citation verification) is deterministic code — exact match, then normalized match, then fuzzy match (Levenshtein ratio ≥ 0.9) — regardless of which provider produced the upstream observation. This rule does not change based on which model is active, because the entire point is to check the model's output against ground truth, not to ask another model (or the same one) to vouch for itself.
- If every quote in an insight fails verification, the insight is dropped and logged. This holds identically whether the observation came from DeepSeek or Claude — provider identity is never a reason to trust a quote without verifying it.

## Batching and context limits

- Never send a whole document to a model in one call. Pass A processes chunk batches sized to fit comfortably under the active model's context window with headroom for the system prompt and output — the PRD's ~30k-input-token batch size is a starting point tuned for the current models in use, not a magic number to hardcode blindly if the active model's real limit differs.
- If the active provider changes to a model with a meaningfully different context window, the batch size is a config value to revisit, not a reason to rewrite the batching logic itself. The logic (batch, don't send whole documents) is provider-agnostic; the batch size is the provider-specific tuning knob.
- `chunkId` in every Pass A observation always references a real `DocumentChunk.id` — never a fuzzy "hint" for the verification step to guess at. This is a data-integrity rule about the shape of the output, and it applies identically no matter which model produced it.

## Output validation

- Every AI JSON response (Pass A observations, Pass B clustering/contradiction output, Pass D summary, chat structured fields) is validated against its Zod schema, regardless of provider. If validation fails, retry once with the validation error appended to the prompt; if it fails a second time, the job fails cleanly. Never persist a partial or best-guess parse from either provider.
- Prompts that instruct a model to return strict JSON are written once, in a shared prompt template, not duplicated per-provider with slightly different wording. If a specific provider needs different phrasing to reliably return valid JSON, that's a provider-specific prompt variant behind the interface — not a fork of the pipeline logic.

## Grounding and chat

- The chat model — whichever is active — answers only from the chunks it was given (full project context for small projects, full-text-search results for large ones) plus the conversation history. This rule is about what the model is allowed to draw from, not which model it is.
- General knowledge beyond the provided research is wrapped in the `<general_knowledge>` tag by whichever model is active, and rendered in the visually distinct block. If a provider doesn't reliably follow this tag instruction, that's a prompt-tuning problem to solve behind the interface — never a reason to relax the rule that ungrounded content must be labeled.
- If no chunk matches the question (zero results across all keyword variants for large projects, or nothing relevant in the full context for small ones), the answer states the research doesn't cover it. This must hold for both providers — a refusal rate eval case failing only under one provider is a real bug, not noise.

## Evaluation before defaulting

- The 20-case golden eval set (documents + expected insights + out-of-scope chat questions) is run against whichever provider is being considered as default, before that provider becomes the default for any pass. This is what "evaluated against the golden eval set before being made default" (from the PRD) actually means in practice — it is a gate, not a formality.
- Cost is tracked per job (`Analysis.costUsd`, `UsageRecord.costUsd`) regardless of provider, so the G-4 cost target and the money-and-billing.md cost ceiling are checked against real numbers for whichever configuration is running — never assumed from one provider's pricing while the other is active.

## What never depends on the provider

These hold identically no matter which model is behind the call, and should never be special-cased per provider:

- No insight renders without a verified citation.
- No API key is ever sent to or callable from client-side code.
- No user document or chat question is sent to a provider not named in the ToS disclosure.
- No AI JSON output is persisted unvalidated.
- No pipeline stage is skipped, reordered, or merged to save a call — Pass A → Pass B → Pass C → Pass D runs in that order every time, because Pass C's verification depends on Pass A's real `chunkId`s and Pass D depends on Pass C's verified set.