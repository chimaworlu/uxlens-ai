"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";

type Status = "loading" | "ready" | "error";

type AnalysisStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "STALE";

type Project = {
  id: string;
  name: string;
  createdAt: string;
  documentCount: number;
  analysisStatus: AnalysisStatus | null;
  analysisCompletedAt: string | null;
};

export default function DashboardPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [projectLimit, setProjectLimit] = useState(3);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCapModal, setShowCapModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/users/status").then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{
          name: string | null;
          email: string;
          verified: boolean;
          projectLimit: number;
        }>;
      }),
      fetch("/api/projects").then((response) => {
        if (!response.ok) throw new Error("Could not load projects.");
        return response.json() as Promise<{ projects: Project[] }>;
      }),
    ])
      .then(([userData, projectsData]) => {
        setName(userData.name);
        setEmail(userData.email);
        setVerified(userData.verified);
        setProjectLimit(userData.projectLimit);
        setProjects(projectsData.projects);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function handleProjectCreated(project: Project) {
    setProjects((current) => [project, ...current]);
    setShowCreateModal(false);
  }

  function handleProjectDeleted(projectId: string) {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setDeleteTarget(null);
  }

  function handleNewProjectClick() {
    if (projects.length >= projectLimit) {
      setShowCapModal(true);
    } else {
      setShowCreateModal(true);
    }
  }

  function showVerificationSnackbar() {
    setSnackbarMessage("Email Verified Successfully!");
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <span className={`${styles.brand} ds-title-large`}>UXLens AI</span>
        {status === "ready" && (
          <Link href="/settings" className={`${styles.avatarLink} ds-focus-ring`} aria-label="Settings">
            <Avatar name={name} />
          </Link>
        )}
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
                    onClick={handleNewProjectClick}
                    className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  >
                    <PlusIcon />
                    New project
                  </button>
                )}
              </div>

              {projects.length === 0 ? (
                // The banner overlays here rather than sitting in normal
                // flow, so the empty state below always centers itself
                // against the full available height — its position can't
                // shift depending on whether the banner happens to be
                // showing or dismissed.
                <div className={styles.contentBody}>
                  {!verified && (
                    <div className={styles.bannerOverlay}>
                      <VerifyEmailBanner
                        email={email}
                        onVerified={() => {
                          setVerified(true);
                          showVerificationSnackbar();
                        }}
                      />
                    </div>
                  )}
                  <div className={styles.emptyState}>
                    <EmptyStateIcon />
                    <h2 className="ds-title-large">No projects yet</h2>
                    <p className="ds-body-medium">
                      Create your first project to upload research documents and get
                      themed, cited findings back in minutes.
                    </p>
                    <button
                      type="button"
                      onClick={handleNewProjectClick}
                      className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                    >
                      <PlusIcon />
                      Create your first project
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {!verified && (
                    <VerifyEmailBanner
                      email={email}
                      onVerified={() => {
                        setVerified(true);
                        showVerificationSnackbar();
                      }}
                    />
                  )}
                  <ul className={styles.projectGrid}>
                    {projects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onDelete={() => setDeleteTarget(project)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

      {showCapModal && (
        <ProjectCapModal isPro={projectLimit > 3} onClose={() => setShowCapModal(false)} />
      )}

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleProjectDeleted}
        />
      )}

      {snackbarMessage && (
        <Snackbar
          message={snackbarMessage}
          onClose={() => setSnackbarMessage(null)}
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
  onClose,
  onCreated,
}: {
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
        body: JSON.stringify({ name: name.trim() }),
      });
      const data: { error?: string; id?: string; name?: string; createdAt?: string } =
        await response.json();
      if (!response.ok || !data.id || !data.name || !data.createdAt) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onCreated({
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        documentCount: 0,
        analysisStatus: null,
        analysisCompletedAt: null,
      });
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

const STATUS_BADGE_CLASS = {
  ready: styles.badgeReady,
  processing: styles.badgeProcessing,
  failed: styles.badgeFailed,
};

function getStatusMeta(
  analysisStatus: AnalysisStatus | null,
  analysisCompletedAt: string | null
): { label: string; tone: "ready" | "processing" | "failed"; subtext: string | null } | null {
  if (analysisStatus === "READY" || analysisStatus === "STALE") {
    const dateText = analysisCompletedAt
      ? new Date(analysisCompletedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;
    return { label: "Ready", tone: "ready", subtext: dateText ? `Last analyzed ${dateText}` : null };
  }

  if (analysisStatus === "PROCESSING" || analysisStatus === "QUEUED") {
    return { label: "Processing", tone: "processing", subtext: "Analysis in progress" };
  }

  if (analysisStatus === "FAILED") {
    return { label: "Failed", tone: "failed", subtext: "Analysis failed" };
  }

  return null;
}

function ProjectCard({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const meta = getStatusMeta(project.analysisStatus, project.analysisCompletedAt);
  const docLabel = `${project.documentCount} document${project.documentCount === 1 ? "" : "s"}`;

  return (
    <li className={styles.projectCard}>
      <div className={styles.cardHeader}>
        {meta ? (
          <span className={`${styles.badge} ${STATUS_BADGE_CLASS[meta.tone]} ds-label-small`}>
            {meta.tone === "processing" && <ProcessingIcon />}
            {meta.label}
          </span>
        ) : (
          <span />
        )}

        <div className={styles.kebabWrap} ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={`${styles.kebabButton} ds-focus-ring`}
            aria-label={`Actions for ${project.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <KebabIcon />
          </button>
          {menuOpen && (
            <div className={styles.kebabMenu} role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className={`${styles.kebabMenuItem} ds-label-medium`}
              >
                Delete project
              </button>
            </div>
          )}
        </div>
      </div>

      <Link href={`/projects/${project.id}`} className={styles.cardLink}>
        <h3 className={`${styles.projectName} ds-title-medium`}>{project.name}</h3>
        <p className={`${styles.projectSubtext} ds-body-small`}>
          {meta?.subtext ? `${docLabel} · ${meta.subtext}` : docLabel}
        </p>

        <div className={styles.cardDivider} />

        <div className={`${styles.cardFooter} ds-label-small`}>
          <DocumentIcon />
          {docLabel}
        </div>
      </Link>
    </li>
  );
}

function ProjectCapModal({ isPro, onClose }: { isPro: boolean; onClose: () => void }) {
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalCentered}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cap-reached-heading"
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

        <span className={`${styles.dialogIcon} ${styles.dialogIconWarning}`}>
          <LockIcon />
        </span>

        <h2 id="cap-reached-heading" className="ds-title-large">
          You&apos;ve reached your project limit
        </h2>
        <p className={`${styles.modalBodyText} ds-body-medium`}>
          {isPro
            ? "You've used all of your plan's active project slots. Delete a project to free up space."
            : "Free plan includes 1 active project. Upgrade to Pro for up to 15 active projects, so you can keep every research project running at once."}
        </p>

        {!isPro && (
          <Link href="/billing" className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}>
            Upgrade to Pro
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: (projectId: string) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docLabel = `${project.documentCount} document${project.documentCount === 1 ? "" : "s"}`;
  const canDelete = confirmText.trim() === project.name;

  async function handleDelete() {
    if (!canDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data: { error?: string } = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onDeleted(project.id);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalCentered}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-heading"
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

        <h2 id="delete-project-heading" className="ds-title-large">
          Delete this project?
        </h2>
        <p className={`${styles.modalBodyText} ds-body-medium`}>
          This will permanently delete <strong>{project.name}</strong>, including all{" "}
          {docLabel}, every analysis version, and the full chat history. This cannot be undone.
        </p>

        <div className={styles.field}>
          <label htmlFor="confirm-project-name" className="ds-label-large">
            Type the project name to confirm
          </label>
          <input
            id="confirm-project-name"
            name="confirm-project-name"
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={project.name}
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
          {submitting ? "Deleting…" : "Delete project"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
        >
          Cancel
        </button>
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
  // sessionStorage, not plain state: dismissal should survive navigating
  // around within the same browser session, but reset the moment a new
  // one starts (browser closed and reopened) — sessionStorage is cleared
  // exactly on that boundary, which is exactly the behavior wanted. Keyed
  // per email so a shared browser can't leak one account's dismissal to
  // another.
  const dismissKey = `verify-banner-dismissed:${email}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(dismissKey) === "true";
  });
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Doubles as the initial "Verify" trigger and the later "Resend code"
  // link — nothing is sent at sign-up, so both paths go through the same
  // background job.
  async function handleSend() {
    setError(null);
    setCode("");
    setSending(true);
    try {
      const response = await fetch("/api/auth/verify/resend", { method: "POST" });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not send the verification email.");
        return;
      }
      setExpanded(true);
    } catch {
      setError("Could not send the verification email.");
    } finally {
      setSending(false);
    }
  }

  // Auto-submits the moment all 6 digits are in — no separate submit
  // button, matching how OTP entry works in most modern apps.
  useEffect(() => {
    if (code.length !== OTP_LENGTH) {
      return;
    }

    let cancelled = false;

    async function verify() {
      setError(null);
      setSubmitting(true);
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data: { error?: string } = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          setCode("");
          return;
        }
        onVerified();
      } catch {
        if (!cancelled) {
          setError("Something went wrong. Please try again.");
          setCode("");
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Dismissing just hides the nudge for the rest of this browser session —
  // it's not gating anything, so there's nothing to "unlock" by keeping it
  // on screen. Persisted in sessionStorage (see dismissKey above), not a
  // database, so it reappears once a new browser session starts, same as
  // it would on a real site that reminds you again next time rather than
  // never again.
  if (dismissed) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem(dismissKey, "true");
        }}
        aria-label="Dismiss verify email notice"
        className={`${styles.dismissButton} ds-focus-ring`}
      >
        <CloseIcon />
      </button>

      <div className={styles.bannerRow}>
        <span className={styles.iconBadge}>
          <MailIcon />
        </span>

        <div className={styles.bannerBody}>
          <div className={styles.bannerHeaderRow}>
            <div>
              <p className={`${styles.bannerHeading} ds-label-large`}>
                Verify your email address
              </p>
              <p className={`${styles.bannerSubtext} ds-body-medium`}>
                {sending ? (
                  <>
                    Sending a code to <strong>{email}</strong>…
                  </>
                ) : expanded ? (
                  <>
                    We sent a code to <strong>{email}</strong>.
                  </>
                ) : (
                  "Confirm your email to unlock full access."
                )}
              </p>
            </div>

            {!expanded && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className={`${styles.verifyButton} ds-label-large ds-focus-ring`}
              >
                Verify
              </button>
            )}
          </div>

          {expanded && (
            <div className={styles.otpSection}>
              <OtpInput value={code} onChange={setCode} autoFocus />

              {error && (
                <span className={`${styles.errorText} ds-label-medium`} role="alert">
                  {error}
                </span>
              )}

              <button
                type="button"
                onClick={handleSend}
                disabled={sending || submitting}
                className={`${styles.resendLink} ds-label-medium ds-focus-ring`}
              >
                {sending ? "Sending…" : submitting ? "Verifying…" : "Resend code"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Snackbar({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onClose();
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={styles.snackbar} role="status" aria-live="polite">
      <span className={styles.snackbarMessage}>{message}</span>
      <button
        type="button"
        className={`${styles.snackbarClose} ds-focus-ring`}
        aria-label="Dismiss notification"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

const OTP_LENGTH = 6;

function OtpInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, digit: string) {
    const chars = value.padEnd(OTP_LENGTH, " ").split("");
    chars[index] = digit;
    onChange(chars.join("").trimEnd());
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) {
      setDigit(index, "");
      return;
    }
    setDigit(index, digits[digits.length - 1] ?? "");
    if (index < OTP_LENGTH - 1) {
      boxRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    onChange(digits);
    boxRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
  }

  return (
    <div className={styles.otpInput}>
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            boxRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] ?? ""}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          autoFocus={autoFocus && index === 0}
          className={`${styles.otpBox} ds-focus-ring`}
          aria-label={`Digit ${index + 1} of verification code`}
        />
      ))}
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

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ProcessingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M21 3v6h-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 21 19.5H3L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.7" r="1" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
    </svg>
  );
}
