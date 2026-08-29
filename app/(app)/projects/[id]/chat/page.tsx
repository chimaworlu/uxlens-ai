"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import layout from "../upload.module.css";
import insightsStyles from "../insights/insights.module.css";
import styles from "./chat.module.css";
import { CitationPanel, type CitationDetail } from "../CitationPanel";

type MessageCitation = { id: string; filename: string };

type LocalMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: MessageCitation[];
  streaming?: boolean;
};

type AnalysisStatusResponse =
  | { status: "none" }
  | {
      analysisId: string;
      status: "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "STALE";
    };

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; citations: MessageCitation[] }
  | { type: "error"; message: string };

// Same [c:chunkId]-adjacent idea as the server's citation extraction, but
// for the <general_knowledge> tag (FR-29): split on the tag rather than
// track it token-by-token as deltas arrive — cheap to re-run on the whole
// accumulated buffer at chat-message lengths, and self-corrects the
// instant a closing tag streams in (an unclosed tag just renders as plain
// text until then).
// The system prompt tells the model to write plain prose, but that's a
// request, not a guarantee — occasionally it still reaches for **bold**,
// "- " bullets, or a heading anyway. Unwrapped/stripped here rather than
// rendered, since the design has no markdown styling to render it into.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "");
}

// Same rule as elsewhere in the app: no em/en dashes in user-facing text.
// The server already applies this to what gets persisted (stripEmDash in
// the chat route), but doing it again here means a message still mid-
// stream never flashes a dash on screen before that server-side pass runs.
function stripEmDash(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}

// The server strips [c:chunkId] tokens (and their preceding <q> verbatim
// anchor, see chat/citations.ts) into the "done" event's citations list,
// but content while streaming is the raw delta text as it arrives — the
// "done" handler below only swaps in id/citations/streaming, not content,
// so without this the markup stays visible in what's already on screen.
// Purely cosmetic here (no chunkId validation needed): by the time a
// message is fully rendered, the citation chips it should show already
// came from the server's validated list, this just hides the raw markup
// in the prose itself, live or historical.
// The <q> tag is never meant to be seen at all (unlike general_knowledge/
// suggestion, which do eventually render, just styled differently), so a
// still-streaming, not-yet-closed <q> is hidden outright rather than left
// to flash its raw quote text on screen for the instant before its
// closing tag arrives.
function stripCitationTokens(text: string): string {
  return text
    .replace(/<q>[\s\S]*?<\/q>\s*/g, "")
    .replace(/<q[\s\S]*$/, "")
    .replace(/\[c:[a-zA-Z0-9]+[^\]]*\]/g, "")
    .replace(/[ \t]+/g, " ");
}

type MessageSegment = { type: "text" | "general_knowledge" | "suggestion"; content: string };

// <suggestion> mirrors <general_knowledge> exactly — same tag-and-strip
// approach, same reasoning for re-parsing the accumulated buffer instead
// of tracking tags token-by-token. It renders muted (styles.refusalHint),
// distinct from the refusal sentence itself, matching the design's
// refusal state.
function parseMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const pattern = /<(general_knowledge|suggestion)>([\s\S]*?)<\/\1>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(cursor, match.index).trim();
    if (before) segments.push({ type: "text", content: before });
    const tagType = match[1] as "general_knowledge" | "suggestion";
    const tagContent = match[2]?.trim();
    if (tagContent) segments.push({ type: tagType, content: tagContent });
    cursor = match.index + match[0].length;
  }

  const rest = text.slice(cursor).trim();
  if (rest) segments.push({ type: "text", content: rest });
  return segments.map((segment) => ({
    ...segment,
    content: stripEmDash(stripMarkdown(stripCitationTokens(segment.content))),
  }));
}

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();

  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [projectName, setProjectName] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [hasDocuments, setHasDocuments] = useState(true);
  const [chatUsedToday, setChatUsedToday] = useState(0);
  const [chatLimit, setChatLimit] = useState(30);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationDetail | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectId) {
      setPageStatus("error");
      return;
    }

    Promise.all([
      fetch("/api/users/status").then((response) => {
        if (!response.ok) throw new Error("Could not load account.");
        return response.json() as Promise<{
          verified: boolean;
          chatMessagesUsedToday: number;
          chatMessageLimit: number;
        }>;
      }),
      fetch(`/api/projects/${projectId}`).then((response) => {
        if (!response.ok) throw new Error("Could not load project.");
        return response.json() as Promise<{ name: string; documentCount: number }>;
      }),
      fetch(`/api/projects/${projectId}/chat/history`).then((response) => {
        if (!response.ok) throw new Error("Could not load chat history.");
        return response.json() as Promise<{ messages: LocalMessage[] }>;
      }),
      fetch(`/api/projects/${projectId}/analysis/status`).then((response) => {
        if (!response.ok) throw new Error("Could not load analysis status.");
        return response.json() as Promise<AnalysisStatusResponse>;
      }),
    ])
      .then(([userData, projectData, historyData, statusData]) => {
        setEmailVerified(userData.verified);
        setChatUsedToday(userData.chatMessagesUsedToday);
        setChatLimit(userData.chatMessageLimit);
        setProjectName(projectData.name);
        setHasDocuments(projectData.documentCount > 0);
        setMessages(historyData.messages);
        if (statusData.status === "READY" || statusData.status === "STALE") {
          setAnalysisId(statusData.analysisId);
        }
        setPageStatus("ready");
      })
      .catch(() => setPageStatus("error"));
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleOpenCitation = useCallback(async (citationId: string) => {
    setActiveCitationId(citationId);
    setActiveCitation(null);
    setCitationLoading(true);
    const response = await fetch(`/api/citations/${citationId}`);
    if (response.ok) {
      setActiveCitation(await response.json());
    }
    setCitationLoading(false);
  }, []);

  const handleCloseCitation = useCallback(() => {
    setActiveCitationId(null);
    setActiveCitation(null);
  }, []);

  const handleOpenFullDocument = useCallback(async (documentId: string) => {
    const response = await fetch(`/api/documents/${documentId}/download`);
    if (!response.ok) return;
    const { url } = await response.json();
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  async function handleRerun() {
    await fetch(`/api/projects/${projectId}/analysis`, { method: "POST" });
    router.push(`/projects/${projectId}/insights`);
  }

  // FR-32: soft delete on the server (see the DELETE handler's comment);
  // clearing local state here just reflects that immediately without a
  // full history re-fetch.
  async function handleClearHistory() {
    setClearing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/chat/history`, { method: "DELETE" });
      if (response.ok) {
        setMessages([]);
        setShowClearModal(false);
      }
    } finally {
      setClearing(false);
    }
  }

  const capReached = chatUsedToday >= chatLimit;
  const blockedOn = !hasDocuments ? "documents" : !emailVerified ? "verification" : null;

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || sending || capReached) return;

    setInput("");
    setSending(true);
    setChatError(null);

    const userMessageId = `local-user-${Date.now()}`;
    const assistantMessageId = `local-assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "USER", content: question, citations: [] },
      { id: assistantMessageId, role: "ASSISTANT", content: "", citations: [], streaming: true },
    ]);

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!response.ok || !response.body) {
        const data: { error?: string; reason?: string } = await response.json().catch(() => ({}));
        setMessages((current) =>
          current.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId)
        );
        if (data.reason === "quota") {
          setChatUsedToday(chatLimit);
        } else {
          setChatError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const event: StreamEvent = JSON.parse(line.slice("data: ".length));

          if (event.type === "delta") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + event.text }
                  : message
              )
            );
          } else if (event.type === "done") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, id: event.messageId, citations: event.citations, streaming: false }
                  : message
              )
            );
            setChatUsedToday((count) => count + 1);
          } else if (event.type === "error") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content || event.message, streaming: false }
                  : message
              )
            );
          }
        }
      }
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: "Something went wrong. Please try again.", streaming: false }
            : message
        )
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={layout.page}>
      <nav className={layout.nav}>
        <div className={insightsStyles.navLeft}>
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
        </div>
        {pageStatus === "ready" && (
          <div className={styles.navActions}>
            {/* Desktop only (hidden on mobile via .desktopOnlyAction, see
                chat.module.css) — replaced below by the overflow menu on
                narrow viewports so three buttons don't cram into one row. */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className={`${layout.buttonOutlined} ${insightsStyles.exportButton} ${styles.desktopOnlyAction} ds-label-large`}
              >
                <TrashIcon />
                Clear history
              </button>
            )}
            {analysisId && (
              <a
                href={`/api/analyses/${analysisId}/export`}
                className={`${layout.buttonOutlined} ${insightsStyles.exportButton} ${styles.desktopOnlyAction} ds-label-large`}
              >
                <DownloadIcon />
                Export
              </a>
            )}

            {analysisId && (
              <button
                type="button"
                onClick={handleRerun}
                className={`${layout.buttonPrimary} ${insightsStyles.rerunButton} ds-label-large`}
              >
                <RerunIcon />
                Re-run analysis
              </button>
            )}

            {/* Mobile only — collapses Clear history + Export into one
                overflow menu next to Re-run analysis (see chat.module.css's
                .overflowWrap). Placed AFTER Re-run analysis, not before: its
                right edge has to land flush with the row's own right edge
                (navActions is justify-content: flex-end on mobile) so the
                right-anchored 160px menu below has room to open leftward
                without going off-screen — see .overflowMenu's comment. */}
            {(messages.length > 0 || analysisId) && (
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
                    {analysisId && (
                      <a
                        href={`/api/analyses/${analysisId}/export`}
                        role="menuitem"
                        className={`${styles.overflowMenuItem} ds-label-medium`}
                        onClick={() => setShowOverflowMenu(false)}
                      >
                        Export
                      </a>
                    )}
                    {messages.length > 0 && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowOverflowMenu(false);
                          setShowClearModal(true);
                        }}
                        className={`${styles.overflowMenuItem} ds-label-medium`}
                      >
                        Clear history
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

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
            <div className={layout.tabs}>
              <Link href={`/projects/${projectId}`} className={`${layout.tab} ds-label-large`}>
                Documents
              </Link>
              <Link href={`/projects/${projectId}/insights`} className={`${layout.tab} ds-label-large`}>
                Insights
              </Link>
              <span className={`${layout.tab} ${layout.tabActive} ds-label-large`}>Chat</span>
            </div>
          )}

          {pageStatus === "ready" && blockedOn && (
            <div className={insightsStyles.emptyState}>
              <DocumentIcon />
              <h2 className="ds-headline-small">
                {blockedOn === "documents" ? "Add a document to get started" : "Verify your email to continue"}
              </h2>
              <p className="ds-body-large">
                {blockedOn === "documents"
                  ? "Upload at least one document before you can chat about your research."
                  : "Verify your email address before you can chat about your research."}
              </p>
              <Link href={`/projects/${projectId}`} className={`${layout.buttonPrimary} ds-label-large`}>
                Back to documents
              </Link>
            </div>
          )}

          {pageStatus === "ready" && !blockedOn && (
            <>
              <div className={styles.messageList}>
                {messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    onOpenCitation={handleOpenCitation}
                    activeCitationId={activeCitationId}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.inputDock}>
                {capReached && (
                  <div className={styles.capBanner}>
                    <span className="ds-body-medium">
                      You&apos;ve reached your daily message limit. Upgrade to Pro for up to 500 messages a
                      day.
                    </span>
                    <Link href="/billing" className={`${styles.capBannerLink} ds-label-medium`}>
                      Upgrade
                    </Link>
                  </div>
                )}
                {chatError && !capReached && (
                  <p className={`${styles.refusalHint} ds-label-medium`} role="alert">
                    {chatError}
                  </p>
                )}
                <form onSubmit={handleSend} className={styles.inputRow}>
                  <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={capReached}
                    placeholder={capReached ? "Daily message limit reached" : "Ask a question about your research"}
                    className={`${styles.textInput} ds-body-large`}
                  />
                  <button
                    type="submit"
                    disabled={capReached || sending || input.trim().length === 0}
                    className={`${styles.sendButton} ds-focus-ring`}
                    aria-label="Send"
                  >
                    <SendIcon />
                  </button>
                </form>
                <p className={`${styles.inputCaption} ds-label-small`}>
                  Answers are grounded in your uploaded research.
                </p>
              </div>
            </>
          )}
        </div>
      </main>

      {activeCitationId && (
        <>
          <div className={insightsStyles.citationOverlay} onClick={handleCloseCitation} />
          <CitationPanel
            loading={citationLoading}
            citation={activeCitation}
            onClose={handleCloseCitation}
            onOpenOther={handleOpenCitation}
            onOpenFullDocument={handleOpenFullDocument}
          />
        </>
      )}

      {showClearModal && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => !clearing && setShowClearModal(false)}
        >
          <div
            className={`${styles.modal} ${styles.modalCentered}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={`${styles.dialogIcon} ${styles.dialogIconDanger}`}>
              <TrashIcon />
            </span>
            <h2 id="clear-history-heading" className="ds-title-large">
              Clear chat history?
            </h2>
            <p className={`${styles.modalBodyText} ds-body-medium`}>
              This removes every message in this project&apos;s chat. It can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing}
              className={`${styles.buttonDanger} ds-label-large ds-focus-ring`}
            >
              {clearing ? "Clearing…" : "Clear history"}
            </button>
            <button
              type="button"
              onClick={() => setShowClearModal(false)}
              disabled={clearing}
              className={`${styles.buttonSecondary} ds-label-large ds-focus-ring`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  message,
  onOpenCitation,
  activeCitationId,
}: {
  message: LocalMessage;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
}) {
  if (message.role === "USER") {
    return (
      <div className={styles.userRow}>
        <p className={`${styles.userBubble} ds-body-large`}>{message.content}</p>
      </div>
    );
  }

  if (message.streaming && message.content.length === 0) {
    return (
      <div className={styles.assistantMessage}>
        <TypingIndicator />
      </div>
    );
  }

  const segments = parseMessageSegments(message.content);

  return (
    <div className={styles.assistantMessage}>
      {segments.map((segment, index) => {
        if (segment.type === "general_knowledge") {
          return (
            <div key={index} className={styles.generalKnowledge}>
              <span className={`${styles.generalKnowledgeLabel} ds-label-medium`}>
                <GlobeIcon />
                General knowledge, not from your research
              </span>
              <p className={`${styles.generalKnowledgeText} ds-body-large`}>{segment.content}</p>
            </div>
          );
        }
        if (segment.type === "suggestion") {
          return (
            <p key={index} className={`${styles.refusalHint} ds-body-medium`}>
              {segment.content}
            </p>
          );
        }
        return (
          <p key={index} className={`${styles.assistantText} ds-body-large`}>
            {segment.content}
          </p>
        );
      })}

      {message.citations.length > 0 && (
        <div className={insightsStyles.citationChips}>
          {message.citations.map((citation) => (
            <button
              key={citation.id}
              type="button"
              onClick={() => onOpenCitation(citation.id)}
              className={`${insightsStyles.citationChip} ${
                citation.id === activeCitationId ? insightsStyles.citationChipActive : ""
              } ds-label-small`}
              title={`View citation in ${citation.filename}`}
            >
              <SmallFileIcon />
              {citation.filename}
            </button>
          ))}
        </div>
      )}
    </div>
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

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m-6 6 6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  // Bigger and bolder than the app's other small icons on purpose: an
  // outline-only globe (mostly negative space, thin curved strokes) has
  // much less visual weight per pixel than a solid-looking shape like
  // SmallFileIcon, so it needs a heavier stroke to read at a glance
  // instead of disappearing next to the label text.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function TypingIndicator() {
  return (
    <div className={styles.typingIndicator} role="status" aria-label="Waiting for response">
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
      <span className={styles.typingDot} />
    </div>
  );
}
