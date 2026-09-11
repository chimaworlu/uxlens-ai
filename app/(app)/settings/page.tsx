"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import styles from "./settings.module.css";

type Status = "loading" | "ready" | "error";

export default function SettingsPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch("/api/users/status")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{ name: string | null }>;
      })
      .then((data) => {
        setName(data.name);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleLogOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/auth" });
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/projects" className={`${styles.brand} ds-title-large`}>
          UXLens AI
        </Link>
        {status === "ready" && (
          <span className={`${styles.avatar} ds-label-large`} aria-hidden="true">
            {getInitials(name)}
          </span>
        )}
      </nav>

      <main className={styles.main}>
        <div className={styles.content}>
          {status === "loading" && <p className="ds-body-large">Loading…</p>}

          {status === "error" && (
            <p className="ds-body-large">
              Couldn&apos;t load your account.{" "}
              <Link href="/auth" className={styles.link}>
                Sign in again
              </Link>
              .
            </p>
          )}

          {status === "ready" && (
            <>
              <h1 className={`${styles.heading} ds-headline-small`}>Settings</h1>

              <div className={styles.card}>
                <Link href="/account" className={`${styles.settingsRow} ds-focus-ring`}>
                  <span className={styles.settingsRowIcon}>
                    <UserIcon />
                  </span>
                  <span className={styles.settingsRowText}>
                    <span className={`${styles.settingsRowTitle} ds-title-medium`}>Account</span>
                    <span className={`${styles.settingsRowSubtext} ds-body-medium`}>
                      Name, email, and password
                    </span>
                  </span>
                  <ChevronRightIcon />
                </Link>

                <Link href="/billing" className={`${styles.settingsRow} ds-focus-ring`}>
                  <span className={styles.settingsRowIcon}>
                    <CardIcon />
                  </span>
                  <span className={styles.settingsRowText}>
                    <span className={`${styles.settingsRowTitle} ds-title-medium`}>Billing</span>
                    <span className={`${styles.settingsRowSubtext} ds-body-medium`}>
                      Plan, usage, and payment
                    </span>
                  </span>
                  <ChevronRightIcon />
                </Link>
              </div>

              <button
                type="button"
                onClick={handleLogOut}
                disabled={signingOut}
                className={`${styles.logOutButton} ds-label-large ds-focus-ring`}
              >
                {signingOut ? "Logging out…" : "Log Out"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// Every registered name is already validated at sign-up to be at least two
// words, so first + last word initials (not just the first word) is safe
// to rely on here.
function getInitials(name: string | null): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4 20c1.2-3.6 4.5-6 8-6s6.8 2.4 8 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
