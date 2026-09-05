"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./upload.module.css";

type DocumentStatus = "UPLOADED" | "EXTRACTING" | "READY" | "FAILED";

type DocumentRow = {
  id: string;
  filename: string;
  status: DocumentStatus;
  failureReason: string | null;
  sizeBytes: number;
  createdAt: string;
};

type UploadingFile = {
  key: string;
  name: string;
  sizeBytes: number;
  progress: number;
  controller: AbortController;
};

type Status = "loading" | "ready" | "error";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".csv"];

export default function ProjectUploadPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState<string | null>(null);
  const [plan, setPlan] = useState<"FREE" | "PRO">("FREE");
  const [projectName, setProjectName] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentLimit, setDocumentLimit] = useState(1);
  const [storageLimitBytes, setStorageLimitBytes] = useState(30 * 1024 * 1024);
  const [readOnly, setReadOnly] = useState(false);
  const [nearCapWarningExpired, setNearCapWarningExpired] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) {
      setStatus("error");
      return;
    }

    Promise.all([
      fetch("/api/users/status").then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{
          name: string | null;
          plan: "FREE" | "PRO";
          documentLimit: number;
          storageLimitBytes: number;
        }>;
      }),
      fetch(`/api/projects/${projectId}`).then((response) => {
        if (!response.ok) throw new Error("Could not load project.");
        return response.json() as Promise<{ name: string; readOnly: boolean }>;
      }),
      fetch(`/api/projects/${projectId}/documents`).then((response) => {
        if (!response.ok) throw new Error("Could not load documents.");
        return response.json() as Promise<{ documents: DocumentRow[] }>;
      }),
    ])
      .then(([userData, projectData, documentsData]) => {
        setName(userData.name);
        setPlan(userData.plan);
        setDocumentLimit(userData.documentLimit);
        setStorageLimitBytes(userData.storageLimitBytes);
        setProjectName(projectData.name);
        setReadOnly(projectData.readOnly);
        setDocuments(documentsData.documents);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [projectId]);

  // While any document is still extracting, poll the list until it isn't —
  // otherwise a document that finishes processing in the background never
  // updates its badge from "Extracting" to "Ready" without a full reload.
  useEffect(() => {
    if (!documents.some((document) => document.status === "EXTRACTING")) return;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/documents`);
        if (!response.ok) return;
        const data: { documents: DocumentRow[] } = await response.json();
        setDocuments(data.documents);
      } catch {
        // Next poll tick will retry.
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [documents, projectId]);

  const readyCount = documents.filter((document) => document.status === "READY").length;
  const storageUsedBytes = documents.reduce((sum, document) => sum + document.sizeBytes, 0);
  const atDocumentCap = documents.length >= documentLimit;
  const atStorageCap = storageUsedBytes >= storageLimitBytes;
  const atCap = atDocumentCap || atStorageCap;
  const remainingDocumentSlots = documentLimit - documents.length;
  // Pro's cap (20) is large enough that "3 remaining" is a meaningful
  // early warning. Free's cap is just 1 document, so there's no "almost
  // full" moment to warn about between 0 and the hard cap — the locked
  // dropzone at atCap already communicates that. Threshold 0 means the
  // near-cap condition below can never be true for Free.
  const nearCapThreshold = plan === "PRO" ? 3 : 0;
  const nearDocumentCap =
    !atDocumentCap && remainingDocumentSlots > 0 && remainingDocumentSlots <= nearCapThreshold;
  const showNearCapWarning = nearDocumentCap && !nearCapWarningExpired;

  // Ephemeral nudge, not a persistent state — disappears on its own after
  // a few minutes rather than staying up for the rest of the session.
  useEffect(() => {
    if (!nearDocumentCap || nearCapWarningExpired) return;
    const timer = setTimeout(() => setNearCapWarningExpired(true), 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [nearDocumentCap, nearCapWarningExpired]);

  async function startUpload(file: File) {
    const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
    const controller = new AbortController();

    setUploadingFiles((current) => [
      ...current,
      { key, name: file.name, sizeBytes: file.size, progress: 0, controller },
    ]);

    let documentId: string | null = null;

    try {
      const presignResponse = await fetch(`/api/projects/${projectId}/documents/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, sizeBytes: file.size }),
        signal: controller.signal,
      });
      const presignData: {
        error?: string;
        documentId?: string;
        uploadUrl?: string;
        contentType?: string;
      } = await presignResponse.json();
      if (!presignResponse.ok || !presignData.documentId || !presignData.uploadUrl) {
        throw new Error(presignData.error ?? "Upload failed. Please try again.");
      }
      documentId = presignData.documentId;

      await putFileToR2(
        presignData.uploadUrl,
        file,
        presignData.contentType ?? "application/octet-stream",
        controller,
        (progress) => {
          setUploadingFiles((current) =>
            current.map((entry) => (entry.key === key ? { ...entry, progress } : entry))
          );
        }
      );

      const confirmResponse = await fetch(`/api/projects/${projectId}/documents/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
        signal: controller.signal,
      });
      const confirmed: (DocumentRow & { error?: string }) | { error: string } =
        await confirmResponse.json();
      if (!confirmResponse.ok || !("id" in confirmed)) {
        throw new Error(confirmed.error ?? "Upload failed. Please try again.");
      }

      setDocuments((current) => [confirmed, ...current]);
    } catch (error) {
      if (documentId) {
        fetch(`/api/documents/${documentId}`, { method: "DELETE" }).catch(() => {});
      }
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setUploadError(error instanceof Error ? error.message : "Upload failed. Please try again.");
      }
    } finally {
      setUploadingFiles((current) => current.filter((entry) => entry.key !== key));
    }
  }

  function handleFiles(fileList: FileList | File[]) {
    if (atCap) return;
    setUploadError(null);
    Array.from(fileList).forEach((file) => {
      startUpload(file);
    });
  }

  function cancelUpload(key: string) {
    setUploadingFiles((current) => {
      current.find((entry) => entry.key === key)?.controller.abort();
      return current.filter((entry) => entry.key !== key);
    });
  }

  async function handleDeleteDocument(documentId: string) {
    const previous = documents;
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setDocuments(previous);
      setUploadError("Couldn't delete that document. Please try again.");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (readOnly || atCap || !event.dataTransfer.files.length) return;
    handleFiles(event.dataTransfer.files);
  }

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
              Couldn&apos;t load this project.{" "}
              <Link href="/projects" className={styles.link}>
                Back to your projects
              </Link>
              .
            </p>
          )}

          {status === "ready" && (
            <>
              <div className={`${styles.breadcrumb} ds-label-medium`}>
                <Link href="/projects" className={styles.breadcrumbLink}>
                  Projects
                </Link>
                <span aria-hidden="true"> / </span>
                <span className={styles.breadcrumbCurrent}>{projectName}</span>
              </div>

              <div className={styles.tabs}>
                <span className={`${styles.tab} ${styles.tabActive} ds-label-large`}>Documents</span>
                <Link href={`/projects/${projectId}/insights`} className={`${styles.tab} ds-label-large`}>
                  Insights
                </Link>
                <Link href={`/projects/${projectId}/chat`} className={`${styles.tab} ds-label-large`}>
                  Chat
                </Link>
              </div>

              <div className={styles.titleRow}>
                <div>
                  <h1 className={`${styles.heading} ds-headline-small`}>Upload documents</h1>
                  <p className={`${styles.quotaText} ds-body-medium`}>
                    {documents.length} of {documentLimit} documents used ·{" "}
                    {formatBytes(storageUsedBytes)} of {formatBytes(storageLimitBytes)} storage used
                  </p>
                  {showNearCapWarning && (
                    <p className={`${styles.nearCapWarning} ds-label-small`}>
                      Only {remainingDocumentSlots} document slot
                      {remainingDocumentSlots === 1 ? "" : "s"} left in this project.{" "}
                      {plan === "FREE"
                        ? "Consider starting a new project or upgrading your plan for more space."
                        : "Consider starting a new project for additional documents."}
                    </p>
                  )}
                </div>
                <div className={styles.runAnalysisGroup}>
                  <Link
                    href={
                      readOnly || readyCount === 0 ? "#" : `/projects/${projectId}/insights?trigger=1`
                    }
                    aria-disabled={readOnly || readyCount === 0}
                    onClick={(event) => {
                      if (readOnly || readyCount === 0) event.preventDefault();
                    }}
                    className={`${styles.buttonPrimary} ds-label-large`}
                    style={readOnly || readyCount === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  >
                    <PlayIcon />
                    Run analysis
                  </Link>
                  <span className={`${styles.runAnalysisHint} ds-label-small`}>
                    {readOnly
                      ? "This project is read-only"
                      : readyCount === 0
                        ? "Upload at least one document to begin"
                        : `${readyCount} document${readyCount === 1 ? "" : "s"} ready to analyze`}
                  </span>
                </div>
              </div>

              <div className={styles.infoBanner}>
                <AlertIcon />
                <p className="ds-body-medium">
                  Research documents often contain personal data about participants. Remove names
                  and identifying details you don&apos;t need. Files are stored privately and
                  never used to train AI models.
                </p>
              </div>

              {readOnly ? (
                <div className={styles.dropzoneLocked}>
                  <LockIcon />
                  <p className="ds-title-medium">This project is read-only</p>
                  <p className={`${styles.dropzoneLockedText} ds-body-medium`}>
                    This project is over your plan&apos;s active project limit, so uploads and
                    analysis are disabled here. Nothing has been deleted — archive or delete another
                    active project to free up a slot, or{" "}
                    <button
                      type="button"
                      onClick={() => setShowUpgradeModal(true)}
                      className={`${styles.linkButton} ds-body-medium`}
                    >
                      upgrade to Pro
                    </button>{" "}
                    for up to {PROJECT_LIMIT_PRO} active projects.
                  </p>
                </div>
              ) : atCap ? (
                <div className={styles.dropzoneLocked}>
                  <LockIcon />
                  <p className="ds-title-medium">You&apos;ve reached your project limit</p>
                  <p className={`${styles.dropzoneLockedText} ds-body-medium`}>
                    This project has reached its{" "}
                    {atDocumentCap && atStorageCap
                      ? "document and storage limits"
                      : atDocumentCap
                        ? "document limit"
                        : "storage limit"}
                    . Delete a file to free up space, or{" "}
                    <button
                      type="button"
                      onClick={() => setShowUpgradeModal(true)}
                      className={`${styles.linkButton} ds-body-medium`}
                    >
                      upgrade to Pro
                    </button>{" "}
                    for up to {DOCUMENT_LIMIT_PRO} documents and {STORAGE_LIMIT_PRO_LABEL} per
                    project.
                  </p>
                </div>
              ) : (
                <div
                  className={`${styles.dropzone} ${isDraggingOver ? styles.dropzoneActive : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={handleDrop}
                >
                  <CloudUploadIcon />
                  <p className="ds-title-medium">Drag and drop files here</p>
                  <span className={`${styles.dropzoneOr} ds-body-medium`}>or</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
                  >
                    Browse files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      if (event.target.files) handleFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <span className={`${styles.dropzoneHint} ds-label-small`}>
                    PDF, DOCX, TXT, or CSV · Max 20 MB per file
                  </span>
                </div>
              )}

              {uploadError && (
                <span className={`${styles.errorText} ds-label-medium`} role="alert">
                  {uploadError}
                </span>
              )}

              {(documents.length > 0 || uploadingFiles.length > 0) && (
                <div className={styles.documentSection}>
                  <p className={`${styles.documentSectionHeading} ds-label-large`}>
                    Uploaded documents
                  </p>
                  <div className={styles.documentList}>
                    {uploadingFiles.map((file) => (
                      <div key={file.key} className={styles.documentRow}>
                        <span className={styles.fileIcon} aria-hidden="true" />
                        <div className={styles.documentInfo}>
                          <span className="ds-body-large">{file.name}</span>
                          <span className={`${styles.documentMeta} ds-label-small`}>
                            {formatBytes(file.sizeBytes)}
                          </span>
                        </div>
                        <div className={styles.uploadProgress}>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <span className={`${styles.progressLabel} ds-label-small`}>
                            {file.progress}%
                          </span>
                          <button
                            type="button"
                            onClick={() => cancelUpload(file.key)}
                            className={`${styles.cancelLink} ds-label-small`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}

                    {documents.map((document) => (
                      <div key={document.id} className={styles.documentRow}>
                        <span className={styles.fileIcon} aria-hidden="true" />
                        <div className={styles.documentInfo}>
                          <span className="ds-body-large">{document.filename}</span>
                          <span className={`${styles.documentMeta} ds-label-small`}>
                            {formatBytes(document.sizeBytes)}
                          </span>
                          {document.status === "FAILED" && document.failureReason && (
                            <span className={`${styles.failureReason} ds-label-small`}>
                              {document.failureReason}
                            </span>
                          )}
                        </div>
                        <div className={styles.documentActions}>
                          <StatusBadge status={document.status} />
                          {document.status !== "EXTRACTING" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(document.id)}
                              className={`${styles.trashButton} ds-focus-ring`}
                              aria-label={`Delete ${document.filename}`}
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showUpgradeModal && <UpgradeFeaturesModal onClose={() => setShowUpgradeModal(false)} />}
    </div>
  );
}

const DOCUMENT_LIMIT_PRO = 20;
const STORAGE_LIMIT_PRO_LABEL = "500 MB";
const PROJECT_LIMIT_PRO = 15;

function StatusBadge({ status }: { status: DocumentStatus }) {
  if (status === "READY") {
    return <span className={`${styles.badge} ${styles.badgeReady} ds-label-small`}>Ready</span>;
  }
  if (status === "FAILED") {
    return (
      <span className={`${styles.badge} ${styles.badgeFailed} ds-label-small`}>
        <SmallWarningIcon />
        Failed
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles.badgeExtracting} ds-label-small`}>
      <ClockIcon />
      Extracting
    </span>
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

// Uploads the file body directly to the presigned R2 URL — the app server
// never sees these bytes. XHR, not fetch, because it's the only web API
// that exposes upload progress events for the progress bar.
function putFileToR2(
  uploadUrl: string,
  file: File,
  contentType: string,
  controller: AbortController,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const abortHandler = () => xhr.abort();
    controller.signal.addEventListener("abort", abortHandler);

    function cleanup() {
      controller.signal.removeEventListener("abort", abortHandler);
    }

    xhr.open("PUT", uploadUrl);
    // Must exactly match the Content-Type the presigned URL was signed
    // with — R2 rejects the PUT with a signature mismatch otherwise.
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed. Please try again."));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Upload failed. Please try again."));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };

    xhr.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function CloudUploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 13v8m-4-4 4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5-9-5.5z" fill="currentColor" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function SmallWarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 21 19.5H3L12 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PRO_FEATURES = [
  "15 active projects",
  "15 analysis runs a month",
  "500 chat messages a day",
  "500 MB storage per project",
  "Keep up to 5 analysis versions",
];

// Same modal as the dashboard's (app/(app)/projects/page.tsx) — duplicated
// rather than shared, per this app's convention of keeping each page's
// pieces self-contained.
function UpgradeFeaturesModal({ onClose }: { onClose: () => void }) {
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setUpgrading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const result: { link?: string; error?: string } = await response.json();
      if (!response.ok || !result.link) {
        setError(result.error ?? "Couldn't start checkout. Please try again.");
        setUpgrading(false);
        return;
      }
      window.location.href = result.link;
    } catch {
      setError("Couldn't start checkout. Please try again.");
      setUpgrading(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalCentered}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-features-heading"
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

        <span className={`${styles.dialogIcon} ${styles.dialogIconPrimary}`}>
          <StarIcon />
        </span>

        <h2 id="upgrade-features-heading" className="ds-title-large">
          Upgrade to Pro
        </h2>
        <p className={`${styles.modalBodyText} ds-body-medium`}>
          ₦3,000/month. Cancel anytime, no email required.
        </p>

        <ul className={styles.featureList}>
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className={styles.featureItem}>
              <CheckIcon />
              <span className="ds-body-medium">{feature}</span>
            </li>
          ))}
        </ul>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={upgrading}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {upgrading ? "Redirecting…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={upgrading}
          className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
        >
          Maybe later
        </button>
      </div>
    </div>
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

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.47 5.18 5.53.68-4.06 3.86 1.1 5.6L12 15.9l-4.94 2.92 1.1-5.6-4.06-3.86 5.53-.68L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
