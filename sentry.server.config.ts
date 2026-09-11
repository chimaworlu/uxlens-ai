import * as Sentry from "@sentry/nextjs";

// Loaded by instrumentation.ts's register() when NEXT_RUNTIME === "nodejs".
// An empty/missing dsn makes Sentry.init a safe no-op, matching this app's
// existing "empty env var = feature off" convention (e.g. Google OAuth's
// GOOGLE_CLIENT_ID/SECRET) — nothing else needs to branch on whether
// Sentry is actually configured.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Error tracking only, per the PRD (Section 7) — no performance tracing
  // requested, so this stays off rather than sending unrequested data.
  tracesSampleRate: 0,
});
