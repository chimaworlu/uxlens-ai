"use client";

import { Suspense, useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./dashboard.module.css";

type Status = "loading" | "ready" | "error";

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [projectLimit, setProjectLimit] = useState(3);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!email) {
      setStatus("error");
      return;
    }

    Promise.all([
      fetch(`/api/users/status?email=${encodeURIComponent(email)}`).then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{
          name: string | null;
          verified: boolean;
          projectLimit: number;
        }>;
      }),
      fetch(`/api/projects?email=${encodeURIComponent(email)}`).then((response) => {
        if (!response.ok) throw new Error("Could not load projects.");
        return response.json() as Promise<{ projects: Project[] }>;
      }),
    ])
      .then(([userData, projectsData]) => {
        setName(userData.name);
        setVerified(userData.verified);
        setProjectLimit(userData.projectLimit);
        setProjects(projectsData.projects);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [email]);

  function handleProjectCreated(project: Project) {
    setProjects((current) => [project, ...current]);
    setShowCreateModal(false);
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <span className={`${styles.brand} ds-title-large`}>UXLens AI</span>
        {status === "ready" && <Avatar name={name} />}
      </nav>

      <main className={styles.main}>
        <div className={styles.content}>
          {status === "loading" && <p className="ds-body-large">Loading…</p>}

          {status === "error" && (
            <p className="ds-body-large">
              Couldn&apos;t load your account.{" "}
              <Link href="/auth" className={styles.resendLink}>
                Sign in again
              </Link>
              .
            </p>
          )}

          {status === "ready" && (
            <>
              <div className={styles.titleRow}>
                <div>
                  <h1 className={`${styles.heading} ds-headline-small`}>Your Projects</h1>
                  <p className={`${styles.quotaText} ds-body-medium`}>
                    {projects.length} of {projectLimit} active projects used
                  </p>
                </div>
                {projects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  >
                    <PlusIcon />
                    New project
                  </button>
                )}
              </div>

              {!verified && (
                <VerifyEmailBanner
                  email={email}
                  onVerified={() => setVerified(true)}
                />
              )}

              {projects.length === 0 ? (
                <div className={styles.emptyState}>
                  <EmptyStateIcon />
                  <h2 className="ds-title-large">No projects yet</h2>
                  <p className="ds-body-medium">
                    Create your first project to upload research documents and get
                    themed, cited findings back in minutes.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  >
                    <PlusIcon />
                    Create your first project
                  </button>
                </div>
              ) : (
                <ul className={styles.projectList}>
                  {projects.map((project) => (
                    <li key={project.id} className={styles.projectRow}>
                      <span className="ds-body-large">{project.name}</span>
                      <span className={`${styles.projectDate} ds-label-small`}>
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </main>

      {showCreateModal && (
        <CreateProjectModal
          email={email}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}

function Avatar({ name }: { name: string | null }) {
  return (
    <div className={`${styles.avatar} ds-label-large`} aria-hidden="true">
      {getInitials(name)}
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

function CreateProjectModal({
  email,
  onClose,
  onCreated,
}: {
  email: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name.trim() }),
      });
      const data: { error?: string; id?: string; name?: string; createdAt?: string } =
        await response.json();
      if (!response.ok || !data.id || !data.name || !data.createdAt) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onCreated({ id: data.id, name: data.name, createdAt: data.createdAt });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-project-heading" className="ds-title-large">
          Create a new project
        </h2>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="project-name" className="ds-label-large">
              Project name
            </label>
            <input
              id="project-name"
              name="project-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="ds-focus-ring"
              autoFocus
            />
          </div>

          {error && (
            <span className={`${styles.errorText} ds-label-medium`} role="alert">
              {error}
            </span>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
            >
              {submitting ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="7" y="2" width="2" height="12" rx="1" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={styles.emptyStateIcon}
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10.5" cy="14.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.3 16.3L14 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function VerifyEmailBanner({
  email,
  onVerified,
}: {
  email: string;
  onVerified: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Doubles as the initial "Verify now" trigger and the later "Resend
  // code" link — nothing is sent at sign-up, so both paths go through the
  // same background job.
  async function handleSend() {
    setError(null);
    setSentMessage(null);
    setSending(true);
    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not send the verification email.");
        return;
      }
      setExpanded(true);
      setSentMessage("A verification code has been sent to your email.");
    } catch {
      setError("Could not send the verification email.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onVerified();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.banner}>
      <div className={styles.bannerRow}>
        <MailIcon />
        <p className={`${styles.bannerText} ds-body-medium`}>
          Verify your email to unlock full access, <strong>{email}</strong>.
        </p>
        {!expanded && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className={`${styles.bannerAction} ds-label-medium ds-focus-ring`}
          >
            {sending ? "Sending…" : "Verify now"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Dismiss verify email notice"
          className={`${styles.dismissButton} ds-focus-ring`}
        >
          <CloseIcon />
        </button>
      </div>

      {expanded && (
        <div className={styles.bannerExpanded}>
          {sentMessage && <span className="ds-label-medium">{sentMessage}</span>}

          <form className={styles.bannerForm} onSubmit={handleVerify}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className={`${styles.codeInput} ds-focus-ring`}
              aria-label="Verification code"
              autoFocus
            />
            <button
              type="submit"
              disabled={code.length !== 6 || submitting}
              className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
            >
              {submitting ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className={`${styles.resendLink} ds-label-medium ds-focus-ring`}
            >
              {sending ? "Sending…" : "Resend code"}
            </button>
          </form>

          {error && (
            <span className={`${styles.errorText} ds-label-medium`} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 7l9 6 9-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2 2l10 10M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
