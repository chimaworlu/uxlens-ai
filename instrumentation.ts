import * as Sentry from "@sentry/nextjs";

// Next.js App Router's instrumentation hook — register() runs once per
// runtime the moment that runtime boots, before any request is served.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown inside Server Components, Route Handlers, and
// Server Actions — the one class of server-side error that isn't already
// reachable from a try/catch this app already writes explicitly.
export const onRequestError = Sentry.captureRequestError;
