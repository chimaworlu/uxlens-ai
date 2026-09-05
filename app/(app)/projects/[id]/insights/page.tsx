"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
  type SubmitEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import layout from "../upload.module.css";
import styles from "./insights.module.css";
import { CitationPanel, type CitationDetail } from "../CitationPanel";

type AnalysisStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "STALE";
type Refusal =
  | "too-little"
  | "too-much"
  | "quota"
  | "in-progress"
  | "unverified"
  | "read-only"
  | "ai-spend";
type InsightType = "THEME" | "PAIN_POINT" | "SUGGESTION" | "CONTRADICTION";

type StatusResponse =
  | { status: "none" }
  | {
      analysisId: string;
      status: AnalysisStatus;
      progressStage: string | null;
      failureReason: string | null;
      version: number;
    };

type Citation = {
  id: string;
  chunkId: string;
  quote: string;
  charStart: number;
  charEnd: number;
  chunk: { document: { filename: string } };
};

type Insight = {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  rank: number;
  evidenceCount: number;
  starred: boolean;
  citations: Citation[];
};

type AnalysisPayload = {
  id: string;
  version: number;
  status: AnalysisStatus;
  executiveSummary: string | null;
  documentCount: number;
  staleDocuments: string[];
  insights: Insight[];
};

type VersionEntry = {
  id: string;
  version: number;
  status: AnalysisStatus;
  createdAt: string;
  documentCount: number;
};


type ViewState =
  | { kind: "loading" }
  | { kind: "load-error" }
  | { kind: "empty" }
  | { kind: "in-progress"; progressStage: string | null }
  | { kind: "ready"; analysis: AnalysisPayload }
  | { kind: "failed"; reason: string | null }
  | { kind: "refusal"; reason: Refusal; resetsOn?: string };

const POLL_INTERVAL_MS = 3000;

const SECTION_ORDER: { type: InsightType; id: string; label: string }[] = [
  { type: "THEME", id: "themes", label: "Themes" },
  { type: "PAIN_POINT", id: "pain-points", label: "Pain Points" },
  { type: "SUGGESTION", id: "suggestions", label: "Suggestions" },
  { type: "CONTRADICTION", id: "contradictions", label: "Contradictions" },
];

export default function ProjectInsightsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectInsightsContent />
    </Suspense>
  );
}

function ProjectInsightsContent() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projectName, setProjectName] = useState("");
  const [plan, setPlan] = useState<"FREE" | "PRO">("FREE");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [hasDocuments, setHasDocuments] = useState(true);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationDetail | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  // FR-2 verification gate on running/re-running analysis (see
  // triggerAnalysis below): sendingVerifyCode/verifyLinkError cover the
  // "Verify your email" link itself (send-then-open, same pattern as the
  // sign-up flow's "Verify email" link); the modal has its own internal
  // state once open.
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [sendingVerifyCode, setSendingVerifyCode] = useState(false);
  const [verifyLinkError, setVerifyLinkError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);

  const loadAnalysis = useCallback(async (analysisId: string) => {
    const response = await fetch(`/api/analyses/${analysisId}`);
    if (!response.ok) {
      setView({ kind: "load-error" });
      return;
    }
    const analysis: AnalysisPayload = await response.json();
    setView({ kind: "ready", analysis });
  }, []);

  const loadVersions = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/analysis/versions`);
    if (!response.ok) return;
    const data: { versions: VersionEntry[] } = await response.json();
    setVersions(data.versions);
  }, [projectId]);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/analysis/status`);
    if (!response.ok) {
      setView({ kind: "load-error" });
      return;
    }
    const data: StatusResponse = await response.json();

    if (data.status === "none") {
      setView({ kind: "empty" });
      return;
    }
    if (data.status === "QUEUED" || data.status === "PROCESSING") {
      setView({ kind: "in-progress", progressStage: data.progressStage });
      pollTimer.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      return;
    }
    if (data.status === "FAILED") {
      setView({ kind: "failed", reason: data.failureReason });
      return;
    }
    // READY or STALE: fetch the full payload and the version list.
    await Promise.all([loadAnalysis(data.analysisId), loadVersions()]);
  }, [projectId, loadAnalysis, loadVersions]);

  const triggerAnalysis = useCallback(async (options?: { verified?: boolean }) => {
    // FR-2: checked client-side first (not just left to the server's own
    // 403 — see app/api/projects/[id]/analysis/route.ts) so both the
    // first-run "Run analysis" button and the top-nav "Re-run analysis"
    // button funnel through this one gate rather than one of them relying
    // on a round-trip failure. Re-checked here (not just hidden/disabled
    // in the UI) because emailVerified can flip back to false after an
    // email change (FR-39), including for an account that already has a
    // completed analysis.
    //
    // options?.verified lets a caller assert "yes, definitely verified"
    // instead of relying on the closed-over emailVerified state: right
    // after setEmailVerified(true), this callback is still the one from
    // the prior render (state updates aren't visible mid-handler), so
    // reading emailVerified here would see the stale `false` and bounce
    // straight back to the refusal view. See handleEmailVerified below.
    const verified = options?.verified ?? emailVerified;
    if (!verified) {
      setView({ kind: "refusal", reason: "unverified" });
      return;
    }
    setView({ kind: "in-progress", progressStage: null });
    const response = await fetch(`/api/projects/${projectId}/analysis`, { method: "POST" });

    if (response.status === 202) {
      pollTimer.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      setView({ kind: "refusal", reason: "in-progress" });
    } else if (response.status === 422 && data.reason === "too-little") {
      setView({ kind: "refusal", reason: "too-little" });
    } else if (response.status === 422 && data.reason === "too-much") {
      setView({ kind: "refusal", reason: "too-much" });
    } else if (response.status === 429 && data.reason === "quota") {
      setView({ kind: "refusal", reason: "quota" });
    } else if (response.status === 403 && data.reason === "read-only") {
      setView({ kind: "refusal", reason: "read-only" });
    } else if (response.status === 429 && data.reason === "ai-spend") {
      setView({ kind: "refusal", reason: "ai-spend" });
    } else {
      setView({ kind: "failed", reason: data.error ?? "Something went wrong. Please try again." });
    }
  }, [projectId, fetchStatus, emailVerified]);

  // Send-then-open, same pattern as the sign-up flow's "Verify email" link
  // (app/(marketing)/auth/page.tsx's handleVerifyEmailClick): a code is
  // sent before the modal ever opens, so the modal's own resend cooldown
  // starts already counting down instead of a redundant first send.
  const handleVerifyClick = useCallback(async () => {
    setSendingVerifyCode(true);
    setVerifyLinkError(null);
    try {
      const response = await fetch("/api/auth/verify/resend", { method: "POST" });
      const data: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setVerifyLinkError(data.error ?? "Could not send a verification code. Please try again.");
        return;
      }
      setShowVerifyModal(true);
    } catch {
      setVerifyLinkError("Could not send a verification code. Please try again.");
    } finally {
      setSendingVerifyCode(false);
    }
  }, []);

  const handleEmailVerified = useCallback(() => {
    setEmailVerified(true);
    setShowVerifyModal(false);
    // Passing { verified: true } instead of relying on the emailVerified
    // state just set above: triggerAnalysis's own closure over
    // emailVerified is still `false` here (this render hasn't happened
    // yet), so an unqualified call would immediately bounce back to the
    // "unverified" refusal view instead of starting the run.
    triggerAnalysis({ verified: true });
  }, [triggerAnalysis]);

  const handleSelectVersion = useCallback(
    (analysisId: string) => {
      setView({ kind: "loading" });
      loadAnalysis(analysisId);
    },
    [loadAnalysis]
  );

  const handleToggleStar = useCallback(
    (insightId: string, nextStarred: boolean) => {
      setView((current) => {
        if (current.kind !== "ready") return current;
        return {
          ...current,
          analysis: {
            ...current.analysis,
            insights: current.analysis.insights.map((insight) =>
              insight.id === insightId ? { ...insight, starred: nextStarred } : insight
            ),
          },
        };
      });
      fetch(`/api/insights/${insightId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: nextStarred }),
      }).catch(() => {
        // Best-effort; a failed toggle just reverts on next full reload.
      });
    },
    []
  );

  const handleCopyInsight = useCallback((insight: Insight) => {
    const lines = [insight.title, "", insight.description, ""];
    for (const citation of insight.citations) {
      lines.push(`${citation.chunk.document.filename}, "${citation.quote}"`);
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }, []);

  const handleOpenCitation = useCallback(
    async (citationId: string) => {
      setActiveCitationId(citationId);
      setActiveCitation(null);
      setCitationLoading(true);
      const response = await fetch(`/api/citations/${citationId}`);
      if (response.ok) {
        setActiveCitation(await response.json());
      }
      setCitationLoading(false);
    },
    []
  );

  const handleCloseCitation = useCallback(() => {
    setActiveCitationId(null);
    setActiveCitation(null);
  }, []);

  const handleOpenFullDocument = useCallback(
    async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/download`);
      if (!response.ok) return;
      const { url } = await response.json();
      window.open(url, "_blank", "noopener,noreferrer");
    },
    []
  );

  useEffect(() => {
    if (!projectId) {
      setPageStatus("error");
      return;
    }

    Promise.all([
      fetch("/api/users/status").then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{ email: string; plan: "FREE" | "PRO"; verified: boolean }>;
      }),
      fetch(`/api/projects/${projectId}`).then((response) => {
        if (!response.ok) throw new Error("Could not load project.");
        return response.json() as Promise<{ name: string; documentCount: number }>;
      }),
    ])
      .then(([userData, projectData]) => {
        setPlan(userData.plan);
        setEmail(userData.email);
        setEmailVerified(userData.verified);
        setProjectName(projectData.name);
        setHasDocuments(projectData.documentCount > 0);
        setPageStatus("ready");
      })
      .catch(() => setPageStatus("error"));
  }, [projectId]);

  useEffect(() => {
    if (!versionMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (versionMenuRef.current && !versionMenuRef.current.contains(event.target as Node)) {
        setVersionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [versionMenuOpen]);

  useEffect(() => {
    if (!showOverflowMenu) return;
    function handleClickOutside(event: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(event.target as Node)) {
        setShowOverflowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOverflowMenu]);

  useEffect(() => {
    if (pageStatus !== "ready") return;

    if (searchParams.get("trigger") === "1") {
      router.replace(`/projects/${projectId}/insights`);
      triggerAnalysis();
    } else {
      fetchStatus();
    }

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // Only re-run when the page itself becomes ready — triggerAnalysis and
    // fetchStatus are intentionally not deps here, this effect owns the
    // one-time "how did we land on this page" decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus]);

  const isReady = view.kind === "ready";

  return (
    <div className={layout.page}>
      <nav className={layout.nav}>
        <div className={styles.navLeft}>
          <Link href="/projects" className={`${layout.brand} ds-title-large`}>
            UXLens AI
          </Link>
          {pageStatus === "ready" && (
            <div className={`${layout.breadcrumb} ds-label-medium`}>
              <Link href="/projects" className={layout.breadcrumbLink}>
                Projects
              </Link>
              <span aria-hidden="true"> / </span>
              <span className={layout.breadcrumbCurrent}>{projectName}</span>
            </div>
          )}
          {isReady && versions.length > 0 && (
            <VersionDropdown
              menuRef={versionMenuRef}
              open={versionMenuOpen}
              onToggle={() => setVersionMenuOpen((current) => !current)}
              versions={versions}
              currentAnalysisId={view.analysis.id}
              plan={plan}
              onSelect={(id) => {
                setVersionMenuOpen(false);
                handleSelectVersion(id);
              }}
              onUpgradeClick={() => setShowUpgradeModal(true)}
            />
          )}
        </div>
        {pageStatus === "ready" && (
          <div className={styles.navActions}>
            {isReady && (
              <>
                {/* Desktop only (hidden on mobile via .desktopOnlyAction) —
                    replaced below by the overflow menu on narrow viewports,
                    same pattern as the Chat tab's top bar. */}
                <a
                  href={`/api/analyses/${view.analysis.id}/export`}
                  className={`${layout.buttonOutlined} ${styles.exportButton} ${styles.desktopOnlyAction} ds-label-large`}
                >
                  <DownloadIcon />
                  Export
                </a>
                <button
                  type="button"
                  onClick={() => triggerAnalysis()}
                  className={`${layout.buttonPrimary} ${styles.rerunButton} ds-label-large`}
                >
                  <RerunIcon />
                  Re-run analysis
                </button>

                {/* Mobile only — collapses Export into an overflow menu next
                    to Re-run analysis. Placed AFTER Re-run analysis, not
                    before: with .navActions right-aligned on mobile, the
                    trigger's right edge has to land flush with the row's
                    own right edge so the right-anchored 160px menu below
                    has room to open leftward without going off-screen. */}
                <div className={styles.overflowWrap} ref={overflowMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowOverflowMenu((open) => !open)}
                    className={`${styles.overflowButton} ds-focus-ring`}
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={showOverflowMenu}
                  >
                    <KebabIcon />
                  </button>
                  {showOverflowMenu && (
                    <div className={styles.overflowMenu} role="menu">
                      <a
                        href={`/api/analyses/${view.analysis.id}/export`}
                        role="menuitem"
                        className={`${styles.overflowMenuItem} ds-label-medium`}
                        onClick={() => setShowOverflowMenu(false)}
                      >
                        Export
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {isReady && view.analysis.status === "STALE" && (
        <div className={`${styles.staleBanner} ds-body-medium`}>
          <span className={styles.staleBannerText}>
            <WarningIcon />
            {view.analysis.staleDocuments.length > 0
              ? `${view.analysis.staleDocuments.join(", ")} was removed since this analysis ran. Results may be out of date.`
              : "A document was removed since this analysis ran. Results may be out of date."}
          </span>
          <button type="button" onClick={() => triggerAnalysis()} className={styles.staleBannerLink}>
            Re-run
          </button>
        </div>
      )}

      <main className={layout.main}>
        <div className={layout.content}>
          {pageStatus === "loading" && <p className="ds-body-large">Loading…</p>}

          {pageStatus === "error" && (
            <p className="ds-body-large">
              Couldn&apos;t load this project.{" "}
              <Link href="/projects" className={layout.link}>
                Back to your projects
              </Link>
              .
            </p>
          )}

          {pageStatus === "ready" && (
            <>
              <div className={layout.tabs}>
                <Link href={`/projects/${projectId}`} className={`${layout.tab} ds-label-large`}>
                  Documents
                </Link>
                <span className={`${layout.tab} ${layout.tabActive} ds-label-large`}>Insights</span>
                <Link href={`/projects/${projectId}/chat`} className={`${layout.tab} ds-label-large`}>
                  Chat
                </Link>
              </div>

              <InsightsBody
                view={view}
                projectId={projectId}
                onRunAnalysis={triggerAnalysis}
                onToggleStar={handleToggleStar}
                onCopyInsight={handleCopyInsight}
                onOpenCitation={handleOpenCitation}
                activeCitationId={activeCitationId}
                hasDocuments={hasDocuments}
                onVerifyClick={handleVerifyClick}
                sendingVerifyCode={sendingVerifyCode}
                verifyLinkError={verifyLinkError}
                onUpgradeClick={() => setShowUpgradeModal(true)}
              />
            </>
          )}
        </div>
      </main>

      {activeCitationId && (
        <>
          <div className={styles.citationOverlay} onClick={handleCloseCitation} />
          <CitationPanel
            loading={citationLoading}
            citation={activeCitation}
            onClose={handleCloseCitation}
            onOpenOther={handleOpenCitation}
            onOpenFullDocument={handleOpenFullDocument}
          />
        </>
      )}

      {showVerifyModal && (
        <VerifyEmailModal
          email={email}
          onClose={() => setShowVerifyModal(false)}
          onVerified={handleEmailVerified}
        />
      )}

      {showUpgradeModal && <UpgradeFeaturesModal onClose={() => setShowUpgradeModal(false)} />}
    </div>
  );
}

function InsightsBody({
  view,
  projectId,
  onRunAnalysis,
  onToggleStar,
  onCopyInsight,
  onOpenCitation,
  activeCitationId,
  hasDocuments,
  onVerifyClick,
  sendingVerifyCode,
  verifyLinkError,
  onUpgradeClick,
}: {
  view: ViewState;
  projectId: string;
  onRunAnalysis: () => void;
  onToggleStar: (insightId: string, nextStarred: boolean) => void;
  onCopyInsight: (insight: Insight) => void;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
  hasDocuments: boolean;
  onVerifyClick: () => void;
  sendingVerifyCode: boolean;
  verifyLinkError: string | null;
  onUpgradeClick: () => void;
}) {
  const backToDocuments = `/projects/${projectId}`;

  if (view.kind === "loading") {
    return <p className="ds-body-large">Loading…</p>;
  }

  if (view.kind === "load-error") {
    return <p className="ds-body-large">Couldn&apos;t load analysis status. Please try again.</p>;
  }

  if (view.kind === "empty") {
    // Email verification is no longer checked here — clicking "Run
    // analysis" unverified now routes through triggerAnalysis's own gate
    // into the "unverified" refusal view below, which is where the
    // clickable verify link actually lives. Blocking (and disabling the
    // button) proactively still makes sense for missing documents: there's
    // no action to offer inline for that one, just "go upload something."
    const blockedOnDocuments = !hasDocuments;

    return (
      <div className={styles.emptyState}>
        <DocumentIcon />
        <h2 className="ds-headline-small">
          {blockedOnDocuments ? "Add a document to get started" : "Ready to analyze"}
        </h2>
        <p className="ds-body-large">
          {blockedOnDocuments
            ? "Upload at least one document before you can run an analysis."
            : "Run an analysis to turn your uploaded documents into themes, pain points, and suggestions."}
        </p>
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={blockedOnDocuments}
          className={`${layout.buttonPrimary} ds-label-large`}
        >
          Run analysis
        </button>
      </div>
    );
  }

  if (view.kind === "in-progress") {
    const stages = [
      { key: "extracting", label: "Extracting themes" },
      { key: "synthesizing", label: "Synthesizing insights" },
      { key: "citations", label: "Mapping citations" },
    ];
    const currentIndex = stages.findIndex((stage) => stage.key === view.progressStage);

    return (
      <div className={styles.emptyState}>
        <div className={styles.progressRing}>
          <span className={styles.progressRingTrack} aria-hidden="true" />
          <DocumentIcon />
        </div>
        <h2 className="ds-headline-small">Analyzing your research</h2>
        <p className="ds-body-large">This usually takes a few minutes for a project this size.</p>

        <div className={styles.stageCard}>
          {stages.map((stage, index) => {
            const state =
              currentIndex === -1
                ? "pending"
                : index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "active"
                    : "pending";
            return (
              <div key={stage.key} className={styles.stageRow}>
                {state === "done" && <CheckIcon />}
                {state === "active" && <MoonIcon />}
                {state === "pending" && <span className={styles.stagePending} aria-hidden="true" />}
                <span
                  className={`ds-body-large ${state === "pending" ? styles.stageTextPending : ""}`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className={`${styles.hint} ds-label-medium`}>
          You can leave this page. Check your dashboard to see when it&apos;s ready.
        </p>
      </div>
    );
  }

  if (view.kind === "refusal") {
    if (view.reason === "quota") {
      return (
        <div className={styles.emptyState}>
          <div className={styles.lockIcon}>
            <LockIcon />
          </div>
          <h2 className="ds-headline-small">You&apos;ve used all your analyses this month</h2>
          <p className="ds-body-large">
            Free plan includes 2 analysis runs a month. Upgrade to Pro for up to 15 runs a month, so
            you can keep analyzing as your research grows.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onUpgradeClick}
              className={`${layout.buttonPrimary} ds-label-large`}
            >
              Upgrade to Pro
            </button>
            <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
              Back to documents
            </Link>
          </div>
        </div>
      );
    }

    if (view.reason === "too-little") {
      return (
        <div className={styles.emptyState}>
          <DocumentWarningIcon />
          <h2 className="ds-headline-small">Not enough content to analyze yet</h2>
          <p className="ds-body-large">
            There isn&apos;t enough research content here to analyze meaningfully. Add more documents
            or richer notes.
          </p>
          <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
            Back to documents
          </Link>
        </div>
      );
    }

    if (view.reason === "too-much") {
      return (
        <div className={styles.emptyState}>
          <StackedDocsIcon />
          <h2 className="ds-headline-small">This project has too much content to analyze at once</h2>
          <p className="ds-body-large">
            This project has more content than a single analysis can process. Remove some documents
            or split into two projects.
          </p>
          <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
            Back to documents
          </Link>
        </div>
      );
    }

    if (view.reason === "unverified") {
      return (
        <div className={styles.emptyState}>
          <MailIcon />
          <h2 className="ds-headline-small">Verify your email to continue</h2>
          <p className="ds-body-large">
            Verify your email address before you can run an analysis.{" "}
            <button
              type="button"
              onClick={onVerifyClick}
              disabled={sendingVerifyCode}
              className={`${styles.inlineVerifyLink} ds-label-large`}
            >
              {sendingVerifyCode ? "Sending…" : "Verify your email"}
            </button>
          </p>
          {verifyLinkError && (
            <span className={`${styles.errorText} ds-label-medium`} role="alert" aria-live="polite">
              {verifyLinkError}
            </span>
          )}
        </div>
      );
    }

    if (view.reason === "read-only") {
      return (
        <div className={styles.emptyState}>
          <div className={styles.lockIcon}>
            <LockIcon />
          </div>
          <h2 className="ds-headline-small">This project is read-only</h2>
          <p className="ds-body-large">
            This project is over your plan&apos;s active project limit, so analysis is disabled here.
            Nothing has been deleted — archive or delete another active project to free up a slot, or
            upgrade to Pro for up to 15 active projects.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onUpgradeClick}
              className={`${layout.buttonPrimary} ds-label-large`}
            >
              Upgrade to Pro
            </button>
            <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
              Back to documents
            </Link>
          </div>
        </div>
      );
    }

    if (view.reason === "ai-spend") {
      return (
        <div className={styles.emptyState}>
          <div className={styles.lockIcon}>
            <LockIcon />
          </div>
          <h2 className="ds-headline-small">You&apos;ve reached today&apos;s usage limit</h2>
          <p className="ds-body-large">
            You&apos;ve used a lot of AI-powered features today. Please try again tomorrow.
          </p>
          <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
            Back to documents
          </Link>
        </div>
      );
    }

    // in-progress: someone triggered a run while one was already going.
    return (
      <div className={styles.emptyState}>
        <DocumentIcon />
        <h2 className="ds-headline-small">An analysis is already running</h2>
        <p className="ds-body-large">This project can only run one analysis at a time.</p>
        <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
          Back to documents
        </Link>
      </div>
    );
  }

  if (view.kind === "failed") {
    return (
      <div className={styles.emptyState}>
        <DocumentWarningIcon />
        <h2 className="ds-headline-small">Analysis failed</h2>
        <p className="ds-body-large">{view.reason ?? "Something went wrong. Please try again."}</p>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onRunAnalysis}
            className={`${layout.buttonPrimary} ds-label-large`}
          >
            Try again
          </button>
          <Link href={backToDocuments} className={`${layout.buttonOutlined} ds-label-large`}>
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  const { analysis } = view;

  return (
    <div className={styles.insightsLayout}>
      <InsightsSectionNav />

      <div className={styles.insightsMain}>
        <section id="summary" className={styles.section}>
          <h2 className={`${styles.sectionHeading} ds-headline-small`}>Executive Summary</h2>
          <div className={styles.summaryCard}>
            <p className="ds-body-large">{analysis.executiveSummary}</p>
          </div>
        </section>

        {SECTION_ORDER.map((section) => {
          const insights = sortInsights(analysis.insights.filter((insight) => insight.type === section.type));
          return (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2 className={`${styles.sectionHeading} ds-headline-small`}>{section.label}</h2>
              {insights.length === 0 ? (
                <div className={`${styles.emptySectionBox} ds-body-medium`}>
                  No {section.label.toLowerCase()} detected
                </div>
              ) : (
                insights.map((insight, index) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    number={section.type === "PAIN_POINT" ? index + 1 : null}
                    documentCount={analysis.documentCount}
                    onToggleStar={onToggleStar}
                    onCopy={onCopyInsight}
                    onOpenCitation={onOpenCitation}
                    activeCitationId={activeCitationId}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

const NAV_SECTIONS = [{ id: "summary", label: "Summary" }, ...SECTION_ORDER];

// Dev note: sticky on scroll, with the current section highlighted as you
// scroll past it — IntersectionObserver watches a thin band near the top
// of the viewport rather than the whole section, so the highlight switches
// right as a section's heading crosses into view, not only once it's
// fully on screen.
function InsightsSectionNav() {
  const [activeId, setActiveId] = useState("summary");

  useEffect(() => {
    const elements = NAV_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={styles.insightsNav} aria-label="Insight sections">
      {NAV_SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={`${styles.insightsNavItem} ${
            section.id === activeId ? styles.insightsNavItemActive : ""
          } ds-label-large`}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

function formatVersionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// FR-20: Free keeps 1 version, Pro keeps 5 — surfaced here as the dropdown's
// own footer message rather than a separate banner, since this is the one
// place a user is actively thinking about version history.
function VersionDropdown({
  menuRef,
  open,
  onToggle,
  versions,
  currentAnalysisId,
  plan,
  onSelect,
  onUpgradeClick,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onToggle: () => void;
  versions: VersionEntry[];
  currentAnalysisId: string;
  plan: "FREE" | "PRO";
  onSelect: (analysisId: string) => void;
  onUpgradeClick: () => void;
}) {
  const current = versions.find((entry) => entry.id === currentAnalysisId);

  return (
    <div className={styles.versionMenu} ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`${styles.versionTrigger} ds-label-small`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Version {current?.version ?? "…"}
        <ChevronDownIcon small />
      </button>

      {open && (
        <div className={styles.versionPanel} role="listbox">
          {versions.map((entry) => {
            const selected = entry.id === currentAnalysisId;
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(entry.id)}
                className={`${styles.versionRow} ${selected ? styles.versionRowSelected : ""}`}
              >
                <span className={styles.versionRowText}>
                  <span className={`${styles.versionRowTitle} ds-body-medium`}>Version {entry.version}</span>
                  <span className={`${styles.versionRowMeta} ds-label-small`}>
                    {formatVersionDate(entry.createdAt)} · {entry.documentCount} document
                    {entry.documentCount === 1 ? "" : "s"}
                  </span>
                </span>
                {selected && <CheckmarkIcon />}
              </button>
            );
          })}

          <hr className={styles.versionDivider} />

          {plan === "FREE" ? (
            <p className={`${styles.versionFooter} ds-label-medium`}>
              You&apos;re on the Free plan. Upgrade to Pro to keep up to 5 versions.{" "}
              <button type="button" onClick={onUpgradeClick} className={styles.versionUpgradeLink}>
                Upgrade
              </button>
            </p>
          ) : (
            <p className={`${styles.versionFooter} ds-label-medium`}>
              Free plan keeps 1 version. Pro keeps 5.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Starred insights surface at the top of their section (FR-25); otherwise
// the server's rank order (frequency-based for pain points) holds.
function sortInsights(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return a.rank - b.rank;
  });
}

function InsightCard({
  insight,
  number,
  documentCount,
  onToggleStar,
  onCopy,
  onOpenCitation,
  activeCitationId,
}: {
  insight: Insight;
  number: number | null;
  documentCount: number;
  onToggleStar: (insightId: string, nextStarred: boolean) => void;
  onCopy: (insight: Insight) => void;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
}) {
  // Local, not lifted to the parent: each card's own "copied" flash is
  // independent of every other card's, so there's no reason for this to
  // live above the component that shows it.
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  function handleCopyClick() {
    onCopy(insight);
    setCopied(true);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`${styles.insightCard} ${insight.starred ? styles.insightCardStarred : ""}`}>
      <div className={styles.insightCardHeader}>
        <div>
          <div className={styles.insightTitleGroup}>
            {number !== null && <span className={styles.insightNumber}>{number}</span>}
            <h3 className={`${styles.insightTitle} ds-title-medium`}>{insight.title}</h3>
          </div>
          <p className={`${styles.insightMeta} ds-label-small`}>
            Mentioned in {insight.evidenceCount} of {documentCount} documents
          </p>
        </div>
        <div className={styles.insightActions}>
          <button
            type="button"
            onClick={handleCopyClick}
            className={`${styles.iconGhostButton} ${copied ? styles.iconGhostButtonSuccess : ""}`}
            aria-label={copied ? "Copied" : "Copy insight with citations"}
            title={copied ? "Copied" : "Copy insight with citations"}
          >
            {copied ? <CheckmarkIcon /> : <CopyIcon />}
          </button>
          <button
            type="button"
            onClick={() => onToggleStar(insight.id, !insight.starred)}
            className={`${styles.iconGhostButton} ${insight.starred ? styles.starButtonActive : ""}`}
            aria-label="Star this insight"
            aria-pressed={insight.starred}
            title={insight.starred ? "Unstar this insight" : "Star this insight"}
          >
            <StarIcon filled={insight.starred} />
          </button>
        </div>
      </div>

      <p className={`${styles.insightDescription} ds-body-medium`}>{insight.description}</p>

      {insight.citations.length > 0 && (
        <div className={styles.citationChips}>
          {insight.citations.map((citation) => (
            <button
              key={citation.id}
              type="button"
              onClick={() => onOpenCitation(citation.id)}
              className={`${styles.citationChip} ${citation.id === activeCitationId ? styles.citationChipActive : ""} ds-label-small`}
              title={`View citation in ${citation.chunk.document.filename}`}
            >
              <SmallFileIcon />
              <span className={styles.citationChipLabel}>{citation.chunk.document.filename}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 7l9 6 9-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 12h6M9 16h6M9 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DocumentWarningIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M8 9h5M8 12.5h5M8 16h3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Solid page-color fill, not a translucent wash — masks the document
          outline behind it so the badge reads as its own outlined circle,
          matching the design. */}
      <circle
        cx="18"
        cy="18"
        r="4.5"
        fill="var(--color-roles-surface)"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M18 16v1.8M18 20v.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function StackedDocsIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="3" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7v13a1 1 0 0 0 1 1h11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={styles.activeIcon} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span className={styles.checkCircle} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RerunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12a8 8 0 1 1 2.5 5.8M4 12V7m0 5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4 2 20h20L12 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4M12 17v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SmallFileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ChevronDownIcon({ small }: { small?: boolean }) {
  const size = small ? 11 : 14;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// FR-2, on the "unverified" refusal view above: same OTP modal shape as
// the sign-up flow's PreSignupVerifyModal (app/(marketing)/auth/page.tsx)
// — icon, code entry, resend cooldown, success screen — but wired to the
// authenticated verify endpoints instead of the session-less pre-signup
// ones, since this user already has an account and a session. A code has
// already been sent by the time this opens (see handleVerifyClick above),
// so the enter phase's cooldown starts already counting down rather than
// firing a redundant first send.
const OTP_LENGTH = 6;

function VerifyEmailModal({
  email,
  onClose,
  onVerified,
}: {
  email: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [phase, setPhase] = useState<"enter" | "success">("enter");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (phase !== "enter" || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft]);

  async function handleVerify(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setCode("");
        return;
      }
      setPhase("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify/resend", { method: "POST" });
      if (!response.ok) {
        const data: { error?: string } = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not resend the code.");
        return;
      }
      setSecondsLeft(60);
    } catch {
      setError("Could not resend the code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.verifyModalCard} ${phase === "success" ? styles.modalCentered : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-email-heading"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "enter" ? (
          <>
            <span className={`${styles.dialogIcon} ${styles.dialogIconInfo}`}>
              <InfoIcon />
            </span>
            <h2 id="verify-email-heading" className="ds-title-large">
              Enter verification code
            </h2>
            <p className={`${styles.verifyModalBodyText} ds-body-medium`}>
              A confirmation code has been sent to your email address at <strong>{email}</strong>. The
              code expires in 15 minutes.
            </p>

            <form onSubmit={handleVerify} className={styles.verifyForm}>
              <div className={styles.verifyField}>
                {/* Not a <label htmlFor>: OtpInput renders six separate
                    inputs, each with its own aria-label, not one labelable
                    element a single label could point at. */}
                <p className="ds-label-large">Enter confirmation code</p>
                <OtpInput value={code} onChange={setCode} autoFocus />
              </div>

              {error && (
                <span className={`${styles.errorText} ds-label-medium`} role="alert" aria-live="polite">
                  {error}
                </span>
              )}

              <div className={styles.resendRow}>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={secondsLeft > 0 || resending}
                  className={`${styles.resendLink} ds-label-medium ds-focus-ring`}
                >
                  Resend confirmation code
                </button>
                {secondsLeft > 0 && <span className="ds-label-medium">in {formatCountdown(secondsLeft)}</span>}
              </div>

              <div className={styles.otpActions}>
                <button
                  type="button"
                  onClick={onClose}
                  className={`${layout.buttonOutlined} ds-label-large ds-focus-ring`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={code.length !== OTP_LENGTH || submitting}
                  className={`${layout.buttonPrimary} ds-label-large ds-focus-ring`}
                >
                  {submitting ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <span className={styles.verifiedIllustration}>
              <VerifiedCheckIcon />
            </span>
            <h2 className="ds-title-large">Email verified</h2>
            <p className={`${styles.verifyModalBodyText} ds-body-medium`}>
              {email} is now verified.
            </p>
            <button
              type="button"
              onClick={onVerified}
              className={`${layout.buttonPrimary} ds-label-large ds-focus-ring`}
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

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

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function VerifiedCheckIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 12.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.verifiedBadgeCheck}
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

// Same modal as the dashboard's and upload page's — duplicated rather than
// shared, per this app's convention of keeping each page's pieces
// self-contained. Uses `layout` (upload.module.css) classes since that
// module already has the full modal/feature-list recipe this needs.
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
    <div className={layout.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${layout.modal} ${layout.modalCentered}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-features-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={`${layout.dialogCloseButton} ds-focus-ring`}
          aria-label="Close"
        >
          <UpgradeModalCloseIcon />
        </button>

        <span className={`${layout.dialogIcon} ${layout.dialogIconPrimary}`}>
          <UpgradeModalStarIcon />
        </span>

        <h2 id="upgrade-features-heading" className="ds-title-large">
          Upgrade to Pro
        </h2>
        <p className={`${layout.modalBodyText} ds-body-medium`}>
          ₦3,000/month. Cancel anytime, no email required.
        </p>

        <ul className={layout.featureList}>
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className={layout.featureItem}>
              <UpgradeModalCheckIcon />
              <span className="ds-body-medium">{feature}</span>
            </li>
          ))}
        </ul>

        {error && (
          <span className={`${layout.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={upgrading}
          className={`${layout.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {upgrading ? "Redirecting…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={upgrading}
          className={`${layout.buttonSecondary} ds-label-large ds-focus-ring`}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function UpgradeModalCloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function UpgradeModalStarIcon() {
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

function UpgradeModalCheckIcon() {
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
