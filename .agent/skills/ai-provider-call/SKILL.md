---
name: ai-provider-call
description: How to write or edit any code that sends a prompt to an AI model in UXLens AI — DeepSeek or Claude, in Pass A, Pass B, Pass D, chat, or the keyword-expansion call. Load this skill before adding or changing any AI call site, prompt, model invocation, or LLM request anywhere in the pipeline.
---

# AI Provider Call

Teaches the one call sequence shared by every AI call site, identical for both providers. The laws live in `ai-pipeline.md` (provider boundary, validation, grounding) and `money-and-billing.md` (cost tracking, spend ceiling). This skill teaches the sequence those laws imply but never spell out.

## The procedure

1. Never import a provider SDK at the call site. Every call goes through `/lib/ai/provider.ts`, which resolves the active provider from config. If your code needs to know which provider is running, the interface is leaking — fix the interface.
2. Build the prompt from the shared template for this call type. Provider-specific phrasing (if one model needs different wording to return valid JSON) lives behind the interface as a variant, never as a fork at the call site.
3. Check the spend ceiling before the call: this user's `UsageRecord.costUsd` total for today must be under $2. Over → pause AI features for them with the friendly message, don't call.
4. Make the call through the interface. On 429/5xx, the interface retries with backoff (max 3) — don't add a second retry loop at the call site.
5. Parse the response as JSON (strip anything outside the JSON if the template demands bare JSON).
6. Validate against this call's Zod schema.
7. **On validation failure: retry exactly once**, appending the Zod error to the prompt so the model can self-correct. On second failure: throw `ValidationError` and let the job fail cleanly. Never persist the partial parse. Never retry a third time.
8. Record cost: write a `UsageRecord` (and update `Analysis.costUsd` for pipeline passes) from the response's token usage, whichever provider ran.
9. For chat specifically: post-process `[c:chunkId]` tokens against the chunk IDs actually sent — strip and log any ID the model invented (PRD Stage 5, step 14).

## Skeleton

```typescript
// /lib/pipeline/passB.ts — the pattern; same shape at every call site
import { callModel } from "@/lib/ai/provider"; // the ONLY AI import allowed here
import { passBSchema } from "./schemas";
import { ValidationError } from "@/lib/errors";
import { recordAiCost, checkSpendCeiling } from "@/lib/quota/checks";

export async function runPassB(userId: string, input: PassBInput) {
  await checkSpendCeiling(userId); // $2/day backstop — before the call, not after

  const prompt = buildPassBPrompt(input); // shared template

  let raw = await callModel("synthesis", prompt); // interface resolves DeepSeek vs Claude
  let parsed = passBSchema.safeParse(tryJson(raw));

  if (!parsed.success) {
    // retry ONCE, with the validation error appended
    raw = await callModel("synthesis", prompt + validationFeedback(parsed.error));
    parsed = passBSchema.safeParse(tryJson(raw));
    if (!parsed.success) {
      throw new ValidationError("AI output failed schema validation twice", parsed.error);
    }
  }

  await recordAiCost(userId, raw.usage); // whichever provider ran
  return parsed.data;
}
```

## Traps

- `if (provider === "deepseek")` in application code. The branch belongs inside `/lib/ai/provider.ts` or it doesn't exist.
- Testing only with the configuration you happen to have enabled. A change that works only with Claude on (or only with DeepSeek alone) is a bug, not done — the pipeline must function with DeepSeek alone (`ai-pipeline.md`).
- Retrying validation more than once, or "rescuing" fields from a failed parse. Twice-failed output is discarded, full stop.
- Hardcoding a model string (`deepseek-chat`, `claude-sonnet-4-6`) inside a pass file. Model strings are config the interface owns.
- Sending a whole document in one call. Pass A batches chunks (~30k input tokens per call) — the batch size is a config knob, the batching itself is not optional.
- Skipping cost recording for "cheap" calls like keyword expansion. Every call writes cost; the ceiling and M-10 depend on the total being complete.
- Letting the chat renderer trust `[c:chunkId]` citations without checking them against the sent set.

## Verify before done

- [ ] No provider SDK import outside `/lib/ai/`.
- [ ] Spend ceiling checked before the call.
- [ ] Zod validation with exactly one error-appended retry, then clean failure.
- [ ] Cost recorded on every successful call.
- [ ] Works with DeepSeek alone AND with Claude enabled — both configs actually run, not assumed.
- [ ] Tests: invalid JSON from the model → one retry, then `ValidationError` and nothing persisted; a user at the $2 ceiling → call blocked; a fabricated `[c:chunkId]` in a chat stream → stripped and logged; both provider configs pass the same test suite.