import * as Sentry from "@sentry/nextjs";

// Loaded by instrumentation.ts's register() when NEXT_RUNTIME === "edge" —
// covers proxy.ts (the Edge-runtime auth middleware), the one place in
// this app that runs outside the regular Node server runtime.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
});
