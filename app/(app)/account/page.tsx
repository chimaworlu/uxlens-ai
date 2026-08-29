"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { validateEmail, validateFullName, getUnmetPasswordRequirements } from "@/lib/validation/auth";
import styles from "./account.module.css";

type Status = "loading" | "ready" | "error";

export default function AccountPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(true);

  useEffect(() => {
    fetch("/api/users/status")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{ name: string | null; email: string; hasPassword: boolean }>;
      })
      .then((data) => {
        setName(data.name ?? "");
        setEmail(data.email);
        setHasPassword(data.hasPassword);
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

              <ProfileCard
                name={name}
                email={email}
                onSaved={(nextName, nextEmail) => {
                  setName(nextName);
                  setEmail(nextEmail);
                }}
              />

              {hasPassword ? (
                <PasswordCard />
              ) : (
                <p className={`${styles.googleNote} ds-body-medium`}>
                  You signed in with Google. Password changes are managed through your Google account.
                </p>
              )}

              <DeleteAccountCard email={email} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileCard({
  name,
  email,
  onSaved,
}: {
  name: string;
  email: string;
  onSaved: (name: string, email: string) => void;
}) {
  const [nameValue, setNameValue] = useState(name);
  const [emailValue, setEmailValue] = useState(email);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setNameValue(name), [name]);
  useEffect(() => setEmailValue(email), [email]);

  const trimmedName = nameValue.trim();
  const trimmedEmail = emailValue.trim().toLowerCase();
  const nameInvalid = trimmedName.length > 0 && validateFullName(trimmedName) !== null;
  const emailInvalid = trimmedEmail.length > 0 && validateEmail(trimmedEmail) !== null;
  const unchanged = trimmedName === name && trimmedEmail === email;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName || !trimmedEmail || nameInvalid || emailInvalid || unchanged) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      });
      const data: { error?: string; name?: string; email?: string; emailChanged?: boolean } =
        await response.json();
      if (!response.ok || !data.name || !data.email) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onSaved(data.name, data.email);
      setMessage(
        data.emailChanged
          ? "Saved. We sent a verification code to your new email address — you'll need to verify it before running another analysis."
          : "Saved."
      );
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
            value={nameValue}
            onChange={(event) => {
              setNameValue(event.target.value);
              setMessage(null);
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
            value={emailValue}
            onChange={(event) => {
              setEmailValue(event.target.value);
              setMessage(null);
            }}
            className="ds-focus-ring"
          />
        </div>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}
        {message && !error && (
          <span className={`${styles.successText} ds-label-medium`} role="status">
            {message}
          </span>
        )}

        <button
          type="submit"
          disabled={
            !trimmedName || !trimmedEmail || nameInvalid || emailInvalid || unchanged || submitting
          }
          className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
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
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data: { error?: string; updated?: boolean } = await response.json();
      if (!response.ok || !data.updated) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setCurrentPassword("");
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
          <label htmlFor="current-password" className="ds-label-large">
            Current password
          </label>
          <input
            id="current-password"
            name="current-password"
            type="password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setSaved(false);
            }}
            className="ds-focus-ring"
          />
        </div>

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

function DeleteAccountCard({ email }: { email: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <section className={styles.dangerCard}>
      <h2 className="ds-title-medium">Delete account</h2>
      <p className={`${styles.dangerCardText} ds-body-medium`}>
        Permanently delete your account, including every project, document, analysis version, and
        chat message. If you have an active Pro subscription, it will be cancelled immediately as
        part of this action. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`${styles.dangerLink} ds-label-large ds-focus-ring`}
      >
        Delete my account
      </button>

      {showModal && <DeleteAccountModal email={email} onClose={() => setShowModal(false)} />}
    </section>
  );
}

function DeleteAccountModal({ email, onClose }: { email: string; onClose: () => void }) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!canDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/users/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim().toLowerCase() }),
      });
      if (!response.ok) {
        const data: { error?: string } = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // FR-38: signed out immediately, redirected to the marketing page,
      // which shows a one-time confirmation banner (see
      // app/(marketing)/page.tsx's ?accountDeleted=1 handling).
      await signOut({ callbackUrl: "/?accountDeleted=1" });
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalCentered}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={`${styles.dialogCloseButton} ds-focus-ring`}
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <span className={`${styles.dialogIcon} ${styles.dialogIconDanger}`}>
          <WarningIcon />
        </span>

        <h2 id="delete-account-heading" className="ds-title-large">
          Delete your account?
        </h2>
        <p className={`${styles.modalBodyText} ds-body-medium`}>
          This will permanently delete your account, every project, document, analysis version,
          and chat history. Your Pro subscription will be cancelled immediately. This cannot be
          undone.
        </p>

        <div className={styles.field}>
          <label htmlFor="confirm-account-email" className="ds-label-large">
            Type your email to confirm
          </label>
          <input
            id="confirm-account-email"
            name="confirm-account-email"
            type="email"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={email}
            className="ds-focus-ring"
            autoFocus
          />
        </div>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete || submitting}
          className={`${styles.buttonDanger} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 21 19.5H3L12 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.7" r="1" fill="currentColor" />
    </svg>
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
