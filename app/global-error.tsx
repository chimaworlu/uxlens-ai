"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

// Next.js's last-resort error boundary: only mounts if the root layout
// itself throws, which is why it renders its own <html>/<body> instead of
// relying on layout.tsx. Every other error in the app is already caught
// by instrumentation.ts's onRequestError or an explicit try/catch — this
// is the one gap those can't reach.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <h1 className="ds-headline-small">Something went wrong</h1>
          <p className="ds-body-large">
            We&apos;ve been notified and are looking into it. Please try reloading the page.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="ds-label-large">
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
