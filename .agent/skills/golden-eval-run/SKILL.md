---
name: golden-eval-run
description: How to run and score the 20-case golden eval set for UXLens AI. Load this skill for the weekly eval run, before any proposal to change which AI provider is default for any pass, before enabling Claude for synthesis or chat, and when building the eval set itself in week 3. Triggers include eval, golden set, provider switch, provider default, quality regression, or M-3/M-5 measurement.
---

# Golden Eval Run

Teaches the procedure for running the eval set that gates provider decisions and launch. The laws live in `ai-pipeline.md` (eval before defaulting), the PRD Section 13 (week-3 build, gates launch), R-6 (weekly cadence), and metrics M-3/M-5. This skill teaches how a run actually happens and what a pass means.

## The eval set — what it contains (PRD Section 13)

Twenty cases, three kinds:
- **Documents with expected insights**: research documents paired with the themes/pain points/suggestions a correct analysis should surface, including paraphrase cases where the document's wording differs from the expected theme's wording (R-10).
- **Expected citations**: for each expected insight, the source passages a correct citation should point into.
- **Out-of-scope chat questions**: questions the documents do not answer, where the correct behavior is a grounded refusal (FR-30), plus in-scope questions with expected grounded answers.

## The procedure

1. Record the configuration under test before running: which provider is active for each pass, model strings, and the git commit. A score without its configuration is noise.
2. Load the 20 cases from the eval fixtures. Never edit a case mid-run to make it pass — a case change is its own reviewed commit.
3. Run the full real pipeline on each document case: Pass A → B → C → D, through `/lib/ai/provider.ts`, with the config under test. No shortcuts around Pass C — the drop rate is one of the two numbers this run exists to produce.
4. Score insights: for each case, compare produced insights to expected ones (match on theme substance, not exact wording). Record hits, misses, and hallucinations-caught (insights Pass C dropped).
5. Compute the drop rate: insights removed by Pass C ÷ insights generated. **Target < 10%, alert at 15%** (M-3).
6. Run the chat cases against each document set's completed analysis. Score refusal correctness: every out-of-scope question must produce a refusal (with at most a labeled general-knowledge note), every in-scope question a cited, grounded answer. **Pass bar: zero fabricated research-grounded answers** (M-5).
7. Record results per run: date, configuration, per-case outcomes, drop rate, refusal score. Append; never overwrite history — the weekly cadence (R-6) only detects drift if history exists.
8. Apply the gate:
   - **Weekly run**: drop rate ≥ 15% or any fabricated grounded answer → flag it as a quality regression for a human; do not silently retune prompts to pass.
   - **Provider-default change**: the candidate configuration must meet both bars, and not score worse than the current default on insight hits. Only then may the config default change — and the change is a flagged, human-approved commit, never a silent flip (`ai-pipeline.md`).

## Skeleton

```typescript
// /tests/eval/run-golden-set.ts — invoked weekly and before any default change
const config = captureConfig(); // provider per pass, models, commit — FIRST

const results = [];
for (const evalCase of loadGoldenSet()) {           // 20 cases, fixtures are read-only here
  const analysis = await runFullPipeline(evalCase.documents, config); // real Pass A→D, real Pass C
  const insightScore = scoreInsights(analysis.insights, evalCase.expectedInsights);
  const chatScore = await scoreChat(analysis, evalCase.chatCases);   // refusals + grounded answers
  results.push({ case: evalCase.id, insightScore, chatScore, dropped: analysis.droppedCount });
}

const dropRate = totalDropped(results) / totalGenerated(results);
const fabrications = countFabricatedGroundedAnswers(results);

appendRunRecord({ date: new Date(), config, results, dropRate, fabrications }); // append, never overwrite

if (dropRate >= 0.15 || fabrications > 0) flagQualityRegression({ dropRate, fabrications }); // human decision, not auto-retune
```

## Traps

- Editing an eval case so the current configuration passes. The set measures the pipeline; the pipeline doesn't get to grade itself on a curve.
- Bypassing Pass C "because this is just an eval." The drop rate IS the measurement; skipping verification produces a score of nothing.
- Comparing insights by exact string match. Models phrase the same theme differently run to run — score substance, and keep the paraphrase cases in, since they exist to catch R-10's keyword-retrieval weakness.
- Running only the insight half and skipping chat refusals. M-5's zero-fabrication bar is half the gate.
- Flipping the provider default in config after one good run, without the flagged human-approved commit.
- Losing run history. One score proves nothing; the weekly trend is what R-6 watches.

## Verify before done

- [ ] Configuration recorded before the run; results appended with it.
- [ ] All 20 cases run through the real pipeline, Pass C included.
- [ ] Drop rate computed and checked against the 10%/15% thresholds (M-3).
- [ ] Zero fabricated grounded answers, or the regression is flagged (M-5).
- [ ] No eval case modified during the run.
- [ ] Tests: the scorer itself gets tests — a known-fabricated answer fixture scores as a fabrication; a paraphrased-but-correct insight scores as a hit; a Pass-C-dropped insight counts toward drop rate and never toward hits.