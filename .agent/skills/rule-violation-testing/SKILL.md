---
name: rule-violation-testing
description: How to write tests for any UXLens AI task, per the AGENTS.md done-checklist. Load this skill at the test-writing step of every task — especially any task touching citations, quotas, uploads, billing, chat grounding, the demo route, or anything in AGENTS.md Section 3. Use it even when the task "obviously" only needs a happy-path test, because that instinct is exactly the failure mode this skill exists to correct.
---

# Rule Violation Testing

Teaches violation-first test writing. The laws are AGENTS.md Section 3 (the 17 never-rules) and the done-checklist ("tests exist for the rules the task touches, not just the happy path"). This skill teaches the order: attempt the forbidden thing first, prove it's rejected, then test that the allowed thing works.

## The procedure

1. List which Section 3 rules the task touches. Read the rule numbers, don't recall them. A route touches rule 4 (quotas) and usually 5–6; billing touches 7, 11, 12; anything rendering insights touches 1–3; uploads touch 5, 8; demo touches 16.
2. For each touched rule, write the violation attempt as a test **before** writing any happy-path test:
   - State what the forbidden action is (over-quota enqueue, unverifiable citation render, duplicate webhook, oversized file, unauthenticated demo upload).
   - Perform it through the real code path — the actual route handler or job processor, not a mocked shortcut around the gate you're testing.
   - Assert the rejection: the right status code or thrown error, AND the absence of the side effect (no job enqueued, no row written, no charge applied, nothing rendered).
3. Assert the absence explicitly. "Returns 403" is half a test; "returns 403 AND the queue received nothing" is the test. The side effect not happening is the rule.
4. Then write the happy path: the same action, under allowed conditions, succeeds.
5. For boundary rules, test the boundary itself: the 3rd analysis this month succeeds, the 4th is refused; a 299-word project is refused, a 301-word one runs; message 30 sends, message 31 is blocked.
6. For AI-touching tasks, run the violation tests under both provider configs (DeepSeek-only, Claude-enabled) — a grounding refusal that only works under one config is a real bug (`ai-pipeline.md`).
7. In the task summary, map each test to its rule number, matching the done-checklist's traceability requirement.

## Skeleton

```typescript
// tests mirror /lib and /app structure (AGENTS.md Section 4)
describe("FR-21 / AGENTS.md rule 4 — analysis quota", () => {
  // VIOLATION FIRST
  it("refuses the run over quota and enqueues nothing", async () => {
    await seedAnalysisRuns(user.id, 3); // free tier cap reached
    const res = await POST(analysisRequest(project.id, user));
    expect(res.status).toBe(403);
    expect(await queueDepth("analysis")).toBe(0);        // absence of side effect
    expect(await countUsageRecords(user.id, "analysis_run")).toBe(3); // refusal consumed nothing (FR-22 pattern)
  });

  // BOUNDARY
  it("allows run 3, refuses run 4", async () => {
    await seedAnalysisRuns(user.id, 2);
    expect((await POST(analysisRequest(project.id, user))).status).toBe(200); // 3rd: ok
    expect((await POST(analysisRequest(project.id, user))).status).toBe(403); // 4th: refused
  });

  // HAPPY PATH LAST
  it("enqueues under quota", async () => {
    const res = await POST(analysisRequest(project.id, user));
    expect(res.status).toBe(200);
    expect(await queueDepth("analysis")).toBe(1);
  });
});
```

## Traps

- Writing the happy path first and the violation test "if there's time." The order in this skill's name is the method.
- Mocking away the gate under test. A quota test that stubs `checkAnalysisQuota` to return false tests the mock, not the enforcement.
- Asserting only the status code. The forbidden side effect not occurring is the actual rule; assert its absence.
- Testing rule 1 (citation firewall) by feeding Pass C only verifiable quotes. The test is an *unverifiable* quote → insight dropped, logged, never rendered.
- Seeding test users with elevated limits "to make setup easier." Test accounts obey the same caps — rule 4 says including your own.
- Skipping the second provider config because the first one passed.

## Verify before done

- [ ] Every touched Section 3 rule has a violation test, written through the real code path.
- [ ] Every violation test asserts the rejection AND the absence of the side effect.
- [ ] Boundary rules tested at the boundary (N passes, N+1 refused).
- [ ] AI-touching tests run under both provider configs.
- [ ] Summary maps each test to its rule number.
- [ ] Tests to write: this skill IS the test-writing procedure — the checklist above is the list.