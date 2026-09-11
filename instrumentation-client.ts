import * as Sentry from "@sentry/nextjs";

// Browser-side init — Next.js loads this file automatically for every
// client bundle, no explicit import needed anywhere else.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
});
