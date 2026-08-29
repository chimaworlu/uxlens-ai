"use client";

import styles from "./insights/insights.module.css";

// Shared by the Insights and Chat tabs (FR-28: chat citations render
// "identical to the insights view") — one citation panel, one CSS module,
// imported from both pages rather than duplicated.
export type CitationDetail = {
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

function stripPageMarker(text: string): string {
  return text.replace(/\[Page \d+\]\n/g, "");
}

export function CitationPanel({
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

          {/* Insight-only concept — chat citations reference a chunk
              directly with no owning insight, so this stays hidden for
              those (insightTitle comes back as "" from the API). */}
          {citation.insightTitle !== "" && (
            <span className={`${styles.citationSourceChip} ds-label-medium`}>
              Source for: {citation.insightTitle}
            </span>
          )}

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
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
