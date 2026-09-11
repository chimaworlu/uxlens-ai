"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./billing.module.css";

type UsageSummary = { used: number; limit: number };

type PortalData = {
  name: string | null;
  plan: "FREE" | "PRO";
  subscription: {
    status: "ACTIVE" | "PAST_DUE" | "CANCELED";
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: {
    projects: UsageSummary;
    analysisRuns: UsageSummary;
    chatMessagesToday: UsageSummary;
    storage: { usedBytes: number; limitBytesPerProject: number; projectCount: number };
  };
};

// FR-33: the only paid tier, NGN only — matches the server-side price in
// /api/billing/checkout (never computed client-side; this is display copy
// only, not what's actually charged).
const PRO_PRICE_LABEL = "₦3,000/month";

type Status = "loading" | "ready" | "error";

export default function BillingPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PortalData | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    setStatus("loading");
    fetch("/api/billing/portal")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load billing.");
        return response.json() as Promise<PortalData>;
      })
      .then((portal) => {
        setData(portal);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpgrade() {
    setUpgrading(true);
    setActionError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const result: { link?: string; error?: string } = await response.json();
      if (!response.ok || !result.link) {
        setActionError(result.error ?? "Couldn't start checkout. Please try again.");
        setUpgrading(false);
        return;
      }
      window.location.href = result.link;
    } catch {
      setActionError("Couldn't start checkout. Please try again.");
      setUpgrading(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setActionError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        setActionError(result.error ?? "Couldn't cancel your subscription. Please try again.");
        setCancelling(false);
        return;
      }
      setConfirmingCancel(false);
      setCancelling(false);
      load();
    } catch {
      setActionError("Couldn't cancel your subscription. Please try again.");
      setCancelling(false);
    }
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/projects" className={`${styles.brand} ds-title-large`}>
          UXLens AI
        </Link>
        <Link href="/settings" className={`${styles.avatarLink} ds-focus-ring`} aria-label="Settings">
          <span className={`${styles.avatar} ds-label-large`} aria-hidden="true">
            {getInitials(data?.name ?? null)}
          </span>
        </Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.content}>
          {status === "loading" && <p className="ds-body-large">Loading…</p>}

          {status === "error" && (
            <p className="ds-body-large">
              Couldn&apos;t load your billing information.{" "}
              <button type="button" onClick={load} className={styles.link}>
                Try again
              </button>
              .
            </p>
          )}

          {status === "ready" && data && (
            <>
              <div className={`${styles.breadcrumb} ds-label-medium`}>
                <Link href="/settings" className={styles.breadcrumbLink}>
                  Settings
                </Link>
                <span aria-hidden="true"> / </span>
                <span className={styles.breadcrumbCurrent}>Billing</span>
              </div>
              <h1 className={`${styles.heading} ds-headline-small`}>Billing</h1>

              <PlanCard data={data} />

              <UsageCard usage={data.usage} />

              {actionError && (
                <span className={`${styles.errorText} ds-label-medium`} role="alert">
                  {actionError}
                </span>
              )}

              {data.plan === "FREE" && (
                <div className={styles.upgradeBanner}>
                  <h2 className="ds-title-medium">Upgrade to Pro</h2>
                  <p className="ds-body-medium">
                    Get up to 15 analysis runs, 500 chat messages a day, 15 projects, and 500 MB of
                    storage per project.
                  </p>
                  <button
                    type="button"
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
                  >
                    {upgrading ? "Redirecting…" : "Upgrade to Pro"}
                  </button>
                </div>
              )}

              {data.plan === "PRO" && data.subscription && !data.subscription.cancelAtPeriodEnd && (
                <div className={styles.cancelSection}>
                  {!confirmingCancel ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(true)}
                      className={`${styles.cancelLink} ds-label-large`}
                    >
                      Cancel subscription
                    </button>
                  ) : (
                    <div className={styles.cancelConfirm}>
                      <p className="ds-body-medium">
                        You&apos;ll keep Pro access until{" "}
                        {formatDate(data.subscription.currentPeriodEnd)}, then move to the Free plan.
                        Nothing is deleted.
                      </p>
                      <div className={styles.cancelConfirmActions}>
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(false)}
                          disabled={cancelling}
                          className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
                        >
                          Never mind
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={cancelling}
                          className={`${styles.cancelLink} ds-label-large`}
                        >
                          {cancelling ? "Cancelling…" : "Yes, cancel"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {data.plan === "PRO" && data.subscription?.cancelAtPeriodEnd && (
                <p className={`${styles.cardSubtext} ds-body-medium`}>
                  Your subscription is set to end on {formatDate(data.subscription.currentPeriodEnd)}.
                  You&apos;ll keep Pro access until then.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function PlanCard({ data }: { data: PortalData }) {
  if (data.plan === "PRO" && data.subscription) {
    // Once cancelAtPeriodEnd is set, currentPeriodEnd is an access-end
    // date, not a future charge — Paystack won't bill again, so "Next
    // billing date" would be actively wrong here, not just stale copy.
    const cancelling = data.subscription.cancelAtPeriodEnd;
    return (
      <div className={styles.card}>
        <div className={styles.planRow}>
          <div className={styles.planTitleRow}>
            <span className="ds-title-medium">Pro plan</span>
            <span
              className={`${styles.badge} ${cancelling ? styles.badgeCancelling : styles.badgeActive} ds-label-small`}
            >
              {cancelling ? "Cancelling" : "Active"}
            </span>
          </div>
          <span className="ds-title-medium">{PRO_PRICE_LABEL}</span>
        </div>
        <p className={`${styles.cardSubtext} ds-body-medium`}>
          {cancelling ? "Access ends" : "Next billing date"}: {formatDate(data.subscription.currentPeriodEnd)}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.planTitleRow}>
        <span className="ds-title-medium">Free plan</span>
        <span className={`${styles.badge} ${styles.badgeFree} ds-label-small`}>Free</span>
      </div>
    </div>
  );
}

function UsageCard({ usage }: { usage: PortalData["usage"] }) {
  const storageLimit =
    usage.storage.limitBytesPerProject * Math.max(usage.storage.projectCount, 1);

  return (
    <div className={styles.card}>
      <h2 className="ds-title-medium">Usage this month</h2>

      <UsageMeter label="Analysis runs" used={usage.analysisRuns.used} limit={usage.analysisRuns.limit} />
      <UsageMeter
        label="Chat messages today"
        used={usage.chatMessagesToday.used}
        limit={usage.chatMessagesToday.limit}
      />
      <UsageMeter label="Active projects" used={usage.projects.used} limit={usage.projects.limit} />
      <UsageMeter
        label="Storage used"
        used={usage.storage.usedBytes}
        limit={storageLimit}
        formatValue={formatBytes}
      />
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number;
  formatValue?: (value: number) => string;
}) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const nearCap = limit > 0 && used / limit >= 0.9;
  const format = formatValue ?? ((value: number) => String(value));

  return (
    <div className={styles.meter}>
      <div className={styles.meterLabelRow}>
        <span className="ds-body-medium">{label}</span>
        <span className="ds-body-medium">
          {format(used)} of {format(limit)}
        </span>
      </div>
      <div className={styles.meterTrack}>
        <div
          className={`${styles.meterFill} ${nearCap ? styles.meterFillNearCap : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Every registered name is already validated at sign-up to be at least two
// words, so first + last word initials (not just the first word) is safe
// to rely on here. Duplicated from the same helper in projects/page.tsx
// and settings/page.tsx — this app duplicates per-page logic rather than
// sharing a primitives module (see those files).
function getInitials(name: string | null): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}
