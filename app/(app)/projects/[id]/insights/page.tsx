"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import layout from "../upload.module.css";
import styles from "./insights.module.css";

type AnalysisStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "STALE";
type Refusal = "too-little" | "too-much" | "quota" | "in-progress";
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

type CitationDetail = {
  id: string;
  quote: string;
  charStart: number;
  charEnd: number;
  chunkContent: string;
  pageNumber: number | null;
  documentId: string;
  documentFilename: string;
  insightTitle: string;
  otherDocuments: { citationId: string; filename: string }[];
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
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationDetail | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);

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

  const triggerAnalysis = useCallback(async () => {
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
    } else {
      setView({ kind: "failed", reason: data.error ?? "Something went wrong. Please try again." });
    }
  }, [projectId, fetchStatus]);

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
        return response.json() as Promise<{ plan: "FREE" | "PRO" }>;
      }),
      fetch(`/api/projects/${projectId}`).then((response) => {
        if (!response.ok) throw new Error("Could not load project.");
        return response.json() as Promise<{ name: string }>;
      }),
    ])
      .then(([userData, projectData]) => {
        setPlan(userData.plan);
        setProjectName(projectData.name);
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
            />
          )}
        </div>
        {pageStatus === "ready" && (
          <div className={styles.navActions}>
            {isReady && (
              <>
                <a
                  href={`/api/analyses/${view.analysis.id}/export`}
                  className={`${layout.buttonOutlined} ${styles.exportButton} ds-label-large`}
                >
                  <DownloadIcon />
                  Export
                </a>
                <button
                  type="button"
                  onClick={triggerAnalysis}
                  className={`${layout.buttonPrimary} ${styles.rerunButton} ds-label-large`}
                >
                  <RerunIcon />
                  Re-run analysis
                </button>
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
          <button type="button" onClick={triggerAnalysis} className={styles.staleBannerLink}>
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
                <span className={`${layout.tab} ${layout.tabDisabled} ds-label-large`}>Chat</span>
              </div>

              <InsightsBody
                view={view}
                projectId={projectId}
                onRunAnalysis={triggerAnalysis}
                onToggleStar={handleToggleStar}
                onCopyInsight={handleCopyInsight}
                onOpenCitation={handleOpenCitation}
                activeCitationId={activeCitationId}
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
}: {
  view: ViewState;
  projectId: string;
  onRunAnalysis: () => void;
  onToggleStar: (insightId: string, nextStarred: boolean) => void;
  onCopyInsight: (insight: Insight) => void;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
}) {
  const backToDocuments = `/projects/${projectId}`;

  if (view.kind === "loading") {
    return <p className="ds-body-large">Loading…</p>;
  }

  if (view.kind === "load-error") {
    return <p className="ds-body-large">Couldn&apos;t load analysis status. Please try again.</p>;
  }

  if (view.kind === "empty") {
    return (
      <div className={styles.emptyState}>
        <DocumentIcon />
        <h2 className="ds-headline-small">Ready to analyze</h2>
        <p className="ds-body-large">
          Run an analysis to turn your uploaded documents into themes, pain points, and suggestions.
        </p>
        <button
          type="button"
          onClick={onRunAnalysis}
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
            Free plan includes 2 analysis runs a month. Upgrade to Pro for up to 30 runs a month, so
            you can keep analyzing as your research grows.
          </p>
          <div className={styles.actions}>
            <Link href="/billing" className={`${layout.buttonPrimary} ds-label-large`}>
              Upgrade to Pro
            </Link>
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
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onToggle: () => void;
  versions: VersionEntry[];
  currentAnalysisId: string;
  plan: "FREE" | "PRO";
  onSelect: (analysisId: string) => void;
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
              <Link href="/billing" className={styles.versionUpgradeLink}>
                Upgrade
              </Link>
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
            onClick={() => onCopy(insight)}
            className={styles.iconGhostButton}
            aria-label="Copy insight with citations"
            title="Copy insight with citations"
          >
            <CopyIcon />
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
              {citation.chunk.document.filename}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CitationPanel({
  loading,
  citation,
  onClose,
  onOpenOther,
  onOpenFullDocument,
}: {
  loading: boolean;
  citation: CitationDetail | null;
  onClose: () => void;
  onOpenOther: (citationId: string) => void;
  onOpenFullDocument: (documentId: string) => void;
}) {
  return (
    <div className={styles.citationPanel} role="dialog" aria-label="Citation detail">
      {loading || !citation ? (
        <p className={`${styles.citationPanelLoading} ds-body-large`}>Loading…</p>
      ) : (
        <>
          <div className={styles.citationPanelHeader}>
            <div className={styles.citationPanelTitle}>
              <SmallFileIcon />
              <div>
                <p className={`${styles.citationPanelFilename} ds-title-medium`}>
                  {citation.documentFilename}
                </p>
                {citation.pageNumber !== null && (
                  <p className={`${styles.citationPanelPage} ds-label-medium`}>
                    Page {citation.pageNumber}
                  </p>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose} className={styles.iconGhostButton} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <span className={`${styles.citationSourceChip} ds-label-medium`}>
            Source for: {citation.insightTitle}
          </span>

          <p className={`${styles.citationBody} ds-body-large`}>
            {stripPageMarker(citation.chunkContent.slice(0, citation.charStart))}
            <mark className={styles.citationHighlight}>
              {stripPageMarker(citation.chunkContent.slice(citation.charStart, citation.charEnd))}
            </mark>
            {stripPageMarker(citation.chunkContent.slice(citation.charEnd))}
          </p>

          {citation.otherDocuments.length > 0 && (
            <>
              <hr className={styles.citationDivider} />
              <div>
                <p className={`${styles.citationOtherLabel} ds-label-medium`}>Other sources for this finding</p>
                <div className={styles.citationChips}>
                  {citation.otherDocuments.map((doc) => (
                    <button
                      key={doc.citationId}
                      type="button"
                      onClick={() => onOpenOther(doc.citationId)}
                      className={`${styles.citationChip} ds-label-small`}
                      title={`View citation in ${doc.filename}`}
                    >
                      <SmallFileIcon />
                      {doc.filename}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className={styles.citationFooter}>
            <hr className={styles.citationDivider} />
            <button
              type="button"
              onClick={() => onOpenFullDocument(citation.documentId)}
              className={`${styles.buttonOutlined} ds-label-large`}
            >
              Open full document
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function stripPageMarker(text: string): string {
  return text.replace(/\[Page \d+\]\n/g, "");
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
        d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 8h6M9 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="17" r="5" fill="currentColor" opacity="0.15" />
      <path d="M17 15v2.2M17 19v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
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
