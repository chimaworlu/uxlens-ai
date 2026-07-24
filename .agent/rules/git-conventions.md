---
trigger: always_on
---

# Git Conventions

## Hard rules

- **Never commit a secret.** No API keys (DeepSeek, Anthropic, Flutterwave, Resend, R2, database URL, session secret) in any tracked file, ever — not in a config file, not in a test fixture, not "temporarily" to unblock a test run. All of these come from environment variables, loaded from `.env` files that are git-ignored from the first commit of the repo. If a secret is ever committed, it must be treated as compromised and rotated — do not just delete it from the file in a follow-up commit and consider it handled.
- **Never commit directly to `main`.** Every change goes through a branch and a pull request, even small ones, even from you. This is what makes "what changed and why" reconstructable later.
- **Never force-push to a shared branch.** Rewriting shared history destroys the ability to trace what happened, which matters more here than usual because so many rules in this project depend on being able to prove, after the fact, that a rule wasn't broken.

## Commit messages

- Every commit message names the PRD requirement(s) it implements or fixes (e.g. `FR-19: drop insights with unverifiable citations`). A commit that touches business logic with no FR reference is a sign the work wasn't scoped from the PRD — stop and check.
- Commit messages describe what changed and why, in plain language. Format (Conventional Commits or otherwise) is a team preference, not a hard rule — consistency within a single PR matters more than which convention is chosen.
- Squash noisy in-progress commits ("wip", "fix typo", "try again") before merging, so the merged history reads as a sequence of intentional changes.

## Branches and PRs

- Branch names reference the task or FR they implement (e.g. `fr-19-citation-verification`, `fr-33-flutterwave-checkout`) so it's obvious from the branch list what's in flight.
- A PR description lists the FR/rule numbers it addresses and explicitly states which `AGENTS.md` Section 3 rules were relevant and how they were satisfied — this is not bureaucracy, it's the paper trail that lets a human verify a rule wasn't quietly broken.
- Migrations (see `database-schema.md`) are their own reviewable diff within the PR, never buried inside an unrelated feature commit.

## What this file does not cover

- Code style, lint rules, and formatting are `coding-standard.md`'s job, not this file's. Don't add commit hooks or CI rules here that belong there.