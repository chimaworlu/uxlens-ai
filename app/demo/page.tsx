"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
// Reusing the authenticated pages' own CSS Modules and CitationPanel
// rather than a parallel copy — same pattern chat/page.tsx already uses
// to share insights.module.css with the Insights tab (see its own header
// comment). Public demo, private pages, same visual language.
import layout from "../(app)/projects/[id]/upload.module.css";
import insightsStyles from "../(app)/projects/[id]/insights/insights.module.css";
import chatStyles from "../(app)/projects/[id]/chat/chat.module.css";
import { CitationPanel, type CitationDetail } from "../(app)/projects/[id]/CitationPanel";
import styles from "./demo.module.css";

type InsightType = "THEME" | "PAIN_POINT" | "SUGGESTION" | "CONTRADICTION";

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
  citations: Citation[];
};

type AnalysisPayload = {
  id: string;
  executiveSummary: string | null;
  documentCount: number;
  insights: Insight[];
};

type DemoData = {
  projectName: string;
  documents: { id: string; filename: string }[];
  analysis: AnalysisPayload | null;
};

type MessageCitation = { id: string; filename: string };

type LocalMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: MessageCitation[];
  streaming?: boolean;
};

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; citations: MessageCitation[] }
  | { type: "error"; message: string };

const SECTION_ORDER: { type: InsightType; id: string; label: string }[] = [
  { type: "THEME", id: "themes", label: "Themes" },
  { type: "PAIN_POINT", id: "pain-points", label: "Pain Points" },
  { type: "SUGGESTION", id: "suggestions", label: "Suggestions" },
  { type: "CONTRADICTION", id: "contradictions", label: "Contradictions" },
];

const CHAT_MESSAGE_LIMIT = 3;

// Same three helpers as chat/page.tsx (see that file's own comments for
// why each exists) — duplicated, not shared, per this app's convention.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "");
}

function stripEmDash(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}

function stripCitationTokens(text: string): string {
  return text
    .replace(/<q>[\s\S]*?<\/q>\s*/g, "")
    .replace(/<q[\s\S]*$/, "")
    .replace(/\[c:[a-zA-Z0-9]+[^\]]*\]/g, "")
    .replace(/[ \t]+/g, " ");
}

type MessageSegment = { type: "text" | "general_knowledge" | "suggestion"; content: string };

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

export default function DemoPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<DemoData | null>(null);
  const [activeTab, setActiveTab] = useState<"insights" | "chat">("insights");

  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationDetail | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/demo")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load demo.");
        return response.json() as Promise<DemoData>;
      })
      .then((demoData) => {
        setData(demoData);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (activeTab === "chat") messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const handleCopyInsight = useCallback((insight: Insight) => {
    const lines = [insight.title, "", insight.description, ""];
    for (const citation of insight.citations) {
      lines.push(`${citation.chunk.document.filename}, "${citation.quote}"`);
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }, []);

  const handleOpenCitation = useCallback(async (citationId: string) => {
    setActiveCitationId(citationId);
    setActiveCitation(null);
    setCitationLoading(true);
    const response = await fetch(`/api/demo/citations/${citationId}`);
    if (response.ok) setActiveCitation(await response.json());
    setCitationLoading(false);
  }, []);

  const handleCloseCitation = useCallback(() => {
    setActiveCitationId(null);
    setActiveCitation(null);
  }, []);

  const handleOpenFullDocument = useCallback(async (documentId: string) => {
    const response = await fetch(`/api/demo/documents/${documentId}/download`);
    if (!response.ok) return;
    const { url } = await response.json();
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const capReached = messageCount >= CHAT_MESSAGE_LIMIT;

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || sending || capReached) return;

    const priorMessages = messages;
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
      // Last 10 turns of this visitor's own local conversation — the
      // server has no session-scoped history query to run against (see
      // app/api/demo/chat/route.ts's header comment), so this is what
      // grounds follow-up questions instead.
      const history = priorMessages.slice(-10).map((message) => ({
        role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content,
      }));

      const response = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });

      if (!response.ok || !response.body) {
        const errorData: { error?: string; reason?: string } = await response.json().catch(() => ({}));
        setMessages((current) =>
          current.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId)
        );
        if (errorData.reason === "session-limit") {
          setMessageCount(CHAT_MESSAGE_LIMIT);
        } else {
          setChatError(errorData.error ?? "Something went wrong. Please try again.");
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
          const streamEvent: StreamEvent = JSON.parse(line.slice("data: ".length));

          if (streamEvent.type === "delta") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + streamEvent.text }
                  : message
              )
            );
          } else if (streamEvent.type === "done") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, id: streamEvent.messageId, citations: streamEvent.citations, streaming: false }
                  : message
              )
            );
            setMessageCount((count) => count + 1);
          } else if (streamEvent.type === "error") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content || streamEvent.message, streaming: false }
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
        <Link href="/" className={`${layout.brand} ds-title-large`}>
          UXLens AI
        </Link>
        <Link href="/auth" className={`${styles.signupCta} ds-label-large`}>
          Sign up free
        </Link>
      </nav>

      <main className={layout.main}>
        <div className={layout.content}>
          {status === "loading" && <p className="ds-body-large">Loading demo…</p>}

          {status === "error" && (
            <p className="ds-body-large">Couldn&apos;t load the demo right now. Please try again shortly.</p>
          )}

          {status === "ready" && data && (
            <>
              <div className={styles.demoHeader}>
                <div>
                  <span className={`${styles.demoBadge} ds-label-small`}>Public demo — read only</span>
                  <h1 className={`${layout.heading} ds-headline-small`}>{data.projectName}</h1>
                  <p className={`${layout.quotaText} ds-body-medium`}>
                    This is a real, AI-analyzed research project with working citations, so you can see
                    exactly how UXLens AI works before you sign up.
                  </p>
                </div>
              </div>

              <div className={layout.tabs}>
                <button
                  type="button"
                  onClick={() => setActiveTab("insights")}
                  className={`${styles.tabButton} ${layout.tab} ${
                    activeTab === "insights" ? layout.tabActive : ""
                  } ds-label-large`}
                >
                  Insights
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={`${styles.tabButton} ${layout.tab} ${
                    activeTab === "chat" ? layout.tabActive : ""
                  } ds-label-large`}
                >
                  Chat
                </button>
              </div>

              {activeTab === "insights" && (
                <InsightsView analysis={data.analysis} onCopyInsight={handleCopyInsight} onOpenCitation={handleOpenCitation} activeCitationId={activeCitationId} />
              )}

              {activeTab === "chat" && (
                <>
                  <div className={chatStyles.messageList}>
                    {messages.length === 0 && (
                      <p className={`${styles.chatHint} ds-body-medium`}>
                        Ask a question about the Coinly research above — up to {CHAT_MESSAGE_LIMIT} messages
                        for this visit.
                      </p>
                    )}
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

                  <div className={chatStyles.inputDock}>
                    {capReached && (
                      <div className={chatStyles.capBanner}>
                        <span className="ds-body-medium">
                          You&apos;ve reached the demo&apos;s {CHAT_MESSAGE_LIMIT}-message limit. Sign up
                          for unlimited chat on your own research.
                        </span>
                        <Link href="/auth" className={`${chatStyles.capBannerLink} ds-label-medium`}>
                          Sign up
                        </Link>
                      </div>
                    )}
                    {chatError && !capReached && (
                      <p className={`${chatStyles.refusalHint} ds-label-medium`} role="alert">
                        {chatError}
                      </p>
                    )}
                    <form onSubmit={handleSend} className={chatStyles.inputRow}>
                      <input
                        type="text"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        disabled={capReached}
                        placeholder={capReached ? "Message limit reached" : "Ask a question about the research"}
                        className={`${chatStyles.textInput} ds-body-large`}
                      />
                      <button
                        type="submit"
                        disabled={capReached || sending || input.trim().length === 0}
                        className={`${chatStyles.sendButton} ds-focus-ring`}
                        aria-label="Send"
                      >
                        <SendIcon />
                      </button>
                    </form>
                    <p className={`${chatStyles.inputCaption} ds-label-small`}>
                      {CHAT_MESSAGE_LIMIT - messageCount > 0
                        ? `${CHAT_MESSAGE_LIMIT - messageCount} of ${CHAT_MESSAGE_LIMIT} demo messages left.`
                        : "Answers are grounded in the demo research above."}
                    </p>
                  </div>
                </>
              )}
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
    </div>
  );
}

function InsightsView({
  analysis,
  onCopyInsight,
  onOpenCitation,
  activeCitationId,
}: {
  analysis: AnalysisPayload | null;
  onCopyInsight: (insight: Insight) => void;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
}) {
  if (!analysis) {
    return (
      <div className={insightsStyles.emptyState}>
        <DocumentIcon />
        <h2 className="ds-headline-small">Demo analysis isn&apos;t ready yet</h2>
        <p className="ds-body-large">Check back shortly.</p>
      </div>
    );
  }

  return (
    <div className={insightsStyles.insightsMain}>
      <section className={insightsStyles.section}>
        <h2 className={`${insightsStyles.sectionHeading} ds-headline-small`}>Executive Summary</h2>
        <div className={insightsStyles.summaryCard}>
          <p className="ds-body-large">{analysis.executiveSummary}</p>
        </div>
      </section>

      {SECTION_ORDER.map((section) => {
        const insights = analysis.insights
          .filter((insight) => insight.type === section.type)
          .sort((a, b) => a.rank - b.rank);
        return (
          <section key={section.id} className={insightsStyles.section}>
            <h2 className={`${insightsStyles.sectionHeading} ds-headline-small`}>{section.label}</h2>
            {insights.length === 0 ? (
              <div className={`${insightsStyles.emptySectionBox} ds-body-medium`}>
                No {section.label.toLowerCase()} detected
              </div>
            ) : (
              insights.map((insight, index) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  number={section.type === "PAIN_POINT" ? index + 1 : null}
                  documentCount={analysis.documentCount}
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
  );
}

function InsightCard({
  insight,
  number,
  documentCount,
  onCopy,
  onOpenCitation,
  activeCitationId,
}: {
  insight: Insight;
  number: number | null;
  documentCount: number;
  onCopy: (insight: Insight) => void;
  onOpenCitation: (citationId: string) => void;
  activeCitationId: string | null;
}) {
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
    <div className={insightsStyles.insightCard}>
      <div className={insightsStyles.insightCardHeader}>
        <div>
          <div className={insightsStyles.insightTitleGroup}>
            {number !== null && <span className={insightsStyles.insightNumber}>{number}</span>}
            <h3 className={`${insightsStyles.insightTitle} ds-title-medium`}>{insight.title}</h3>
          </div>
          <p className={`${insightsStyles.insightMeta} ds-label-small`}>
            Mentioned in {insight.evidenceCount} of {documentCount} documents
          </p>
        </div>
        <div className={insightsStyles.insightActions}>
          <button
            type="button"
            onClick={handleCopyClick}
            className={`${insightsStyles.iconGhostButton} ${copied ? insightsStyles.iconGhostButtonSuccess : ""}`}
            aria-label={copied ? "Copied" : "Copy insight with citations"}
            title={copied ? "Copied" : "Copy insight with citations"}
          >
            {copied ? <CheckmarkIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      <p className={`${insightsStyles.insightDescription} ds-body-medium`}>{insight.description}</p>

      {insight.citations.length > 0 && (
        <div className={insightsStyles.citationChips}>
          {insight.citations.map((citation) => (
            <button
              key={citation.id}
              type="button"
              onClick={() => onOpenCitation(citation.id)}
              className={`${insightsStyles.citationChip} ${
                citation.id === activeCitationId ? insightsStyles.citationChipActive : ""
              } ds-label-small`}
              title={`View citation in ${citation.chunk.document.filename}`}
            >
              <SmallFileIcon />
              <span className={insightsStyles.citationChipLabel}>{citation.chunk.document.filename}</span>
            </button>
          ))}
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
      <div className={chatStyles.userRow}>
        <p className={`${chatStyles.userBubble} ds-body-large`}>{message.content}</p>
      </div>
    );
  }

  if (message.streaming && message.content.length === 0) {
    return (
      <div className={chatStyles.assistantMessage}>
        <p className={`${chatStyles.assistantText} ds-body-large`} aria-live="polite">
          Thinking…
        </p>
      </div>
    );
  }

  const segments = parseMessageSegments(message.content);

  return (
    <div className={chatStyles.assistantMessage}>
      {segments.map((segment, index) => {
        if (segment.type === "general_knowledge") {
          return (
            <div key={index} className={chatStyles.generalKnowledge}>
              <span className={`${chatStyles.generalKnowledgeLabel} ds-label-medium`}>
                <GlobeIcon />
                General knowledge, not from your research
              </span>
              <p className={`${chatStyles.generalKnowledgeText} ds-body-large`}>{segment.content}</p>
            </div>
          );
        }
        if (segment.type === "suggestion") {
          return (
            <p key={index} className={`${chatStyles.refusalHint} ds-body-medium`}>
              {segment.content}
            </p>
          );
        }
        return (
          <p key={index} className={`${chatStyles.assistantText} ds-body-large`}>
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
              <span className={insightsStyles.citationChipLabel}>{citation.filename}</span>
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

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CheckmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5m-6 6 6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
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
