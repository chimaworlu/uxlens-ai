"use client";

import { Suspense, useRef, useState, type TouchEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./onboarding.module.css";

const TOTAL_STEPS = 3;

const STEP_LABELS = {
  1: "What UXLens does",
  2: "Privacy note",
  3: "Get started",
} as const;

const PLAN_LIMITS: { label: string; value: string }[] = [
  { label: "Active projects", value: "3" },
  { label: "Documents per project", value: "10" },
  { label: "Storage per project", value: "100 MB" },
  { label: "Analysis runs per month", value: "3" },
  { label: "Chat messages per day", value: "30" },
];

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [step, setStep] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function goNextStep() {
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function goPreviousStep() {
    setStep((current) => Math.max(current - 1, 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (deltaX < 0) {
      goNextStep();
    } else {
      goPreviousStep();
    }
  }

  function goToDashboard() {
    // No real session yet (see AGENTS.md gap flagged in conversation) —
    // carrying the email through as a query param is a placeholder stand-in
    // for a real logged-in session, not a security boundary.
    router.push(`/projects?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <span className={`${styles.brand} ds-title-large`}>UXLens AI</span>
      </nav>

      <main className={styles.main}>
        <div
          className={styles.card}
          aria-label={`Onboarding step ${step} of ${TOTAL_STEPS}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className={`${styles.dot} ${n === step ? styles.dotActive : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <span className={`${styles.stepLabel} ds-label-medium`}>
            Step {step} of {TOTAL_STEPS}
          </span>
          <span className={`${styles.stepPurpose} ds-label-medium`}>
            {STEP_LABELS[step as keyof typeof STEP_LABELS]}
          </span>

          {step === 1 && (
            <>
              <button
                type="button"
                className={`${styles.stepSkipButton} ds-label-large ds-focus-ring`}
                onClick={() => router.push(`/projects?email=${encodeURIComponent(email)}`)}
              >
                Skip for now
              </button>
              <h1 className={`${styles.heading} ds-headline-small`}>
                Welcome to UXLens AI
              </h1>
              <p className={`${styles.body} ds-body-large`}>
                Upload your interview notes, survey results, and customer
                feedback. UXLens reads through your documents and returns
                organized themes, key pain points, and suggestions, each one
                linked back to the exact sentence it came from, so you can
                trust what you&apos;re looking at.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  onClick={goNextStep}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <span className={styles.iconBadge}>
                <ShieldIcon />
              </span>
              <button
                type="button"
                className={`${styles.stepSkipButton} ds-label-large ds-focus-ring`}
                onClick={() => router.push(`/projects?email=${encodeURIComponent(email)}`)}
              >
                Skip for now
              </button>
              <h1 className={`${styles.heading} ds-headline-small`}>
                A quick note about privacy
              </h1>
              <p className={`${styles.body} ds-body-large`}>
                Research documents often contain personal data about
                participants. Remove names and identifying details you do not
                need. Files are processed privately and used only to generate
                your analysis.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  onClick={goNextStep}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className={`${styles.buttonLink} ds-label-medium ds-focus-ring`}
                  onClick={goPreviousStep}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={`${styles.heading} ds-headline-small`}>
                You&apos;re ready to start
              </h1>
              <p className={`${styles.body} ds-body-medium`}>
                Your account is ready. Create your first project to begin uploading research.
              </p>
              <div className={styles.planTable} aria-label="Free plan limits">
                {PLAN_LIMITS.map((row) => (
                  <div key={row.label} className={`${styles.planRow} ds-body-medium`}>
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className={`${styles.body} ds-label-small`}>
                You can upgrade to Pro anytime for higher limits.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
                  onClick={goPreviousStep}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  onClick={goToDashboard}
                >
                  Continue
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
