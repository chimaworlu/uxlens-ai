"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { getUnmetPasswordRequirements } from "@/lib/validation/auth";
import styles from "./account.module.css";

type Status = "loading" | "ready" | "error";

export default function AccountPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/users/status")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{ name: string | null; email: string }>;
      })
      .then((data) => {
        setName(data.name ?? "");
        setEmail(data.email);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/projects" className={`${styles.brand} ds-title-large`}>
          UXLens AI
        </Link>
        {status === "ready" && (
          <Link href="/settings" className={`${styles.avatarLink} ds-focus-ring`} aria-label="Settings">
            <span className={`${styles.avatar} ds-label-large`} aria-hidden="true">
              {getInitials(name)}
            </span>
          </Link>
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
              <div className={`${styles.breadcrumb} ds-label-medium`}>
                <Link href="/settings" className={styles.breadcrumbLink}>
                  Settings
                </Link>
                <span aria-hidden="true"> / </span>
                <span className={styles.breadcrumbCurrent}>Account</span>
              </div>
              <h1 className={`${styles.heading} ds-headline-small`}>Account</h1>

              <ProfileCard email={email} name={name} onNameSaved={setName} />
              <PasswordCard />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileCard({
  email,
  name,
  onNameSaved,
}: {
  email: string;
  name: string;
  onNameSaved: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(name), [name]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      const data: { error?: string; name?: string } = await response.json();
      if (!response.ok || !data.name) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onNameSaved(data.name);
      setSaved(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className="ds-title-medium">Profile</h2>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="account-name" className="ds-label-large">
            Name
          </label>
          <input
            id="account-name"
            name="name"
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            className="ds-focus-ring"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="account-email" className="ds-label-large">
            Email
          </label>
          <input
            id="account-email"
            name="email"
            type="email"
            value={email}
            disabled
            className="ds-focus-ring"
          />
        </div>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}
        {saved && !error && (
          <span className={`${styles.successText} ds-label-medium`} role="status">
            Saved.
          </span>
        )}

        <button
          type="submit"
          disabled={!value.trim() || value.trim() === name || submitting}
          className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit =
    newPassword.length > 0 &&
    getUnmetPasswordRequirements(newPassword).length === 0 &&
    newPassword === confirmPassword;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/users/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data: { error?: string; updated?: boolean } = await response.json();
      if (!response.ok || !data.updated) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className="ds-title-medium">Password</h2>
      <p className={`${styles.cardSubtext} ds-body-medium`}>Change the password used to sign in.</p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="new-password" className="ds-label-large">
            New password
          </label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setSaved(false);
            }}
            className="ds-focus-ring"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="confirm-new-password" className="ds-label-large">
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            name="confirm-new-password"
            type="password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setSaved(false);
            }}
            className="ds-focus-ring"
          />
        </div>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}
        {saved && !error && (
          <span className={`${styles.successText} ds-label-medium`} role="status">
            Password updated.
          </span>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
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
