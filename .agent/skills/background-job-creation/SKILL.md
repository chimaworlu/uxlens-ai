---
name: background-job-creation
description: How to add or modify any BullMQ job, queue consumer, worker, or scheduled/repeatable job in /worker for UXLens AI. Load this skill before defining a new job, editing queue config, changing concurrency, timeouts, retry behavior, or touching the doc-processing, analysis, or cleanup queues.
---

# Background Job Creation

Teaches the assembly order for every worker job. The laws live in the PRD Section 7 (queue configs), `coding-standard.md` (typed errors), and `AGENTS.md` Section 2 (worker is a separate process). This skill teaches how the pieces snap together.

## The procedure

1. Confirm the job belongs to one of the three queues: `doc-processing`, `analysis`, or `cleanup`. A fourth queue is new architecture — flag it, don't add it.
2. Apply that queue's locked config from PRD Section 7, exactly:
   - `doc-processing`: concurrency 5, attempts 3, exponential backoff (5s base), timeout 5 min.
   - `analysis`: concurrency 2, attempts 2, timeout 10 min, plus the per-project lock.
   - `cleanup`: repeatable daily jobs (R2 orphans, stale chat hard-delete, version pruning, billing-enforcement).
3. Write the processor in `/worker/queues/<queue>.ts`. It imports only from `/lib` and `/prisma` — never from `/app` (AGENTS.md Section 4).
4. For `analysis` jobs: acquire the per-project lock before work starts (one analysis per project at a time), and release it in a `finally`.
5. Emit progress events at each named stage so the UI's polling endpoint can show "Extracting themes → Synthesizing insights → Mapping citations" (FR-15).
6. Wrap every stage in try/catch with typed error classes. On final failure (after retries): write a user-safe reason to the row's `failureReason`, set the status enum (`FAILED`), and emit a structured pino log. Never leave a row stuck in a processing state.
7. Make re-runnable jobs idempotent. Cleanup jobs run daily and must be safe to run twice: billing-enforcement checks current state before downgrading; orphan deletion re-derives orphans each run rather than trusting a stale list.
8. Register the job in `/worker/index.ts` — the single entry point that starts all consumers.

## Skeleton

```typescript
// /worker/queues/analysis.ts
import { Worker } from "bullmq";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/db/redis";
import { ProviderError, ValidationError } from "@/lib/errors";

export const analysisWorker = new Worker(
  "analysis",
  async (job) => {
    const { projectId, analysisId } = job.data;

    const lockKey = `analysis-lock:${projectId}`;
    const locked = await redis.set(lockKey, job.id!, "EX", 660, "NX"); // timeout + margin
    if (!locked) throw new Error("Project already has a running analysis"); // per-project lock, PRD S7

    try {
      await job.updateProgress({ stage: "Extracting themes" });
      // Pass A ...
      await job.updateProgress({ stage: "Synthesizing insights" });
      // Pass B ...
      await job.updateProgress({ stage: "Mapping citations" });
      // Pass C, Pass D ...
      await prisma.analysis.update({ where: { id: analysisId }, data: { status: "READY", completedAt: new Date() } });
    } catch (err) {
      const reason = err instanceof ProviderError || err instanceof ValidationError
        ? err.userSafeMessage
        : "Analysis failed. Please try again.";
      await prisma.analysis.update({ where: { id: analysisId }, data: { status: "FAILED", failureReason: reason } });
      throw err; // let BullMQ count the attempt
    } finally {
      await redis.del(lockKey);
    }
  },
  { connection: redis, concurrency: 2 } // locked config, PRD S7
);
```

## Traps

- Running a consumer inside a Next.js API route or serverless function. BullMQ needs the long-lived `/worker` process — this is a locked architecture decision (AGENTS.md Section 2).
- Swallowing the error after writing `failureReason`. Re-throw it so BullMQ counts the attempt and retries per config.
- Forgetting the `finally` on the analysis lock. A crashed job then blocks that project's analyses until the lock TTL expires.
- Writing a cleanup job that isn't safe to run twice. Daily repeatables will eventually double-fire; idempotency is not optional.
- Building the 5-day grace period without wiring billing-enforcement into the daily cleanup schedule — the "half a feature that behaves like a bug" from AGENTS.md rule 12.
- Inventing new concurrency/timeout numbers. The PRD's numbers are locked config, not suggestions.

## Verify before done

- [ ] Queue config matches PRD Section 7 numbers exactly.
- [ ] Processor imports from `/lib` and `/prisma` only, never `/app`.
- [ ] Failure path writes `failureReason`, sets the status enum, logs structurally, and re-throws.
- [ ] Analysis jobs acquire and always release the per-project lock.
- [ ] Repeatable jobs proven safe to run twice.
- [ ] Tests: a job that fails mid-stage leaves the row in `FAILED` with a reason (never stuck in `PROCESSING`); a second concurrent analysis for the same project is rejected; the relevant cleanup job run twice produces the same end state as run once.