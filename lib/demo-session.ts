// FR-37: the demo's 3-messages-per-browser-session chat cap is scoped to
// an anonymous visitor, not a signed-in user — there's no userId to key
// on. This cookie (minted by GET /api/demo, see that route) stands in for
// one, and lib/security/rate-limit.ts's existing Redis counter enforces
// the cap against it, the same way it enforces every other limit in the
// app — no new schema, no new infra.
export const DEMO_SESSION_COOKIE = "demo_session";

// A long fixed window rather than a true "until the browser closes"
// boundary — Redis has no concept of cookie lifetime. Paired with the
// cookie itself carrying no maxAge (a real session cookie), this is a
// reasonable stand-in: any single sitting stays capped at 3, and it clears
// on its own well before a returning visitor would call it stale.
export const DEMO_CHAT_SESSION_WINDOW_SECONDS = 24 * 60 * 60;
// Lowered from the PRD's original 5: the demo is unauthenticated and
// unlimited in number of visitors (only rate-limited per IP), so its per-
// message AI cost has no revenue offset at all, same reasoning as the
// free-tier chat cap above. 3 is still enough to show the chat feature
// actually works without materially raising the anonymous-traffic cost
// surface.
export const DEMO_CHAT_SESSION_LIMIT = 3;
