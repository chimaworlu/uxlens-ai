---
name: api-route-creation
description: How to add or modify any API route handler under /app/api in the UXLens AI codebase. Load this skill before writing the first line of any new route, endpoint, route handler, or API change — including edits to existing routes for projects, documents, analysis, chat, billing, or demo. Use it even for "small" route changes, because the gate order it teaches is where small changes go wrong.
---

# API Route Creation

Teaches the fixed gate order every route follows before doing real work. The laws live in `security.md` (auth, ownership), `coding-standard.md` (Zod, typed errors), and `money-and-billing.md` (quota placement). This skill teaches the order, which none of them state.

## The procedure

1. Check the route exists in the PRD Section 7 route table. If it doesn't, stop — a new route is new scope. Flag it, don't build it (AGENTS.md, Section 7).
2. Create the handler at the exact path from the table, under `/app/api/.../route.ts`.
3. **Gate 1 — Auth.** Resolve the session via Auth.js first. No session → 401. Exception: `/api/demo` and `/api/billing/webhook` are unauthenticated by design; nothing else is.
4. **Gate 2 — Ownership.** Load the resource by ID, then verify `resource.userId === session.user.id` (or walk the relation: document → project → userId). Mismatch → 404, not 403 — don't confirm the resource exists to a stranger.
5. **Gate 3 — Input validation.** Parse the body/params with the route's Zod schema, defined next to this route file. Invalid → 400 with the Zod issues summarized in a user-safe message.
6. **Gate 4 — Quota.** Call the relevant check from `/lib/quota/checks.ts`. Never write an inline `if (count >= limit)` in the route. Over quota → 403 with the upgrade-prompt payload.
7. **Only now: business logic.** Enqueue the job, run the query, build the response. Expensive work (AI calls, job enqueues, presigns) must sit after all four gates.
8. Wrap in typed errors. Catch `ValidationError` / `ProviderError` / route-specific classes; return a user-safe message; log full detail with pino.
9. Add the route's rate limit if the PRD names one (presign 30/hr/user, chat 10/min burst, auth 10/min/IP, demo 20/min/IP), using the Redis sliding-window helper.

## Skeleton

```typescript
// /app/api/projects/[id]/analysis/route.ts
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { checkAnalysisQuota } from "@/lib/quota/checks";

const bodySchema = z.object({ /* route-specific fields */ });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Gate 1: auth
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in required" }, { status: 401 });

  // Gate 2: ownership
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true }, // never select extractedText-adjacent bulk here
  });
  if (!project || project.userId !== session.user.id)
    return Response.json({ error: "Not found" }, { status: 404 });

  // Gate 3: input validation
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid request", issues: parsed.error.flatten() }, { status: 400 });

  // Gate 4: quota — always via /lib/quota, always before expensive work
  const quota = await checkAnalysisQuota(session.user.id, project.id);
  if (!quota.ok)
    return Response.json({ error: quota.message, upgrade: true }, { status: 403 });

  // Business logic — only after all gates
  // ... enqueue, query, respond
}
```

## Traps

- Enqueueing the job, then checking quota. The queue accepts it before the gate fires. Quota is Gate 4, before any enqueue.
- Returning 403 on ownership mismatch. That confirms the resource exists. Return 404.
- Trusting the URL's userId or a body field for identity. Identity comes from the session only.
- Copying an ownership check inline for a nested resource (chunk → document) and skipping the walk up to `project.userId`.
- Selecting full `Document` rows (with `extractedText`) in a list/status route. Explicit `select` always (`database-schema.md`).
- Treating `/api/demo` as a template for other routes. It is the only public route; its shape is the exception, not the pattern.

## Verify before done

- [ ] Route path matches the PRD Section 7 table exactly.
- [ ] All four gates present, in order, before any expensive work.
- [ ] Quota logic lives in `/lib/quota`, not inline.
- [ ] Every error path returns a user-safe message; full detail goes to logs.
- [ ] Rate limit applied if the PRD names one for this route.
- [ ] Tests: one per gate — unauthenticated request → 401; other user's resource → 404; malformed body → 400; over-quota user → 403 and **no job enqueued**; then the happy path. Write the gate tests first (see `rule-violation-testing`).