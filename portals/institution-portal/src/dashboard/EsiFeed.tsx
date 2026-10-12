/**
 * From Esi — proactive assistant feed that replaces the old "Recent activity" panel.
 *
 * Surfaces what happened since the user's last visit:
 * - Unclaimed application submissions grouped into one "N new applications waiting
 *   to be claimed" row with Claim-all / Open-queue actions
 * - Other activity feed items (document replies, field visit reports, overdue
 *   calibrations, audit status changes) enriched into conversational sentences
 * - A conversational ask input ("Ask Esi about these")
 *
 * Data: home.feed + approvals (unclaimed filter) — both already loaded on the dashboard.
 *
 * Feed items arrive as raw Notification Log subjects (e.g. "[R-C1] Application submitted:
 * APP-2026-00027" with body "Stage-1 audit=AUD-2026-00010; dept=Certification") or
 * supplement rows (e.g. "APP-2026-00025 — Application").  This component enriches
 * them into human-readable sentences matching the mock design.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon, type IconName, type FeedItem } from "@eswasaone/shared-ui";
import type { ApprovalItem } from "../api/types";

export type EsiFeedProps = {
  feed: FeedItem[];
  /** Approval items — used for the "Claim all" count and fresh-arrival tracking. */
  approvals?: ApprovalItem[] | null;
  /** ISO timestamp of the user's last visit, for the subtitle. */
  lastSeen?: string | null;
  /** Called when user types a question into "Ask Esi about these". */
  onAsk?: (question: string) => void;
  /** Called when user clicks "Claim all" — should POST to the claim endpoint. */
  onClaimAll?: () => void;
};

type FeedTone = "navy" | "red" | "green" | "amber" | "purple";

const TONE_MAP: Record<FeedTone, { tint: string; tone: string }> = {
  navy: { tint: "#ECEEFC", tone: "#313391" },
  red: { tint: "#FDECEC", tone: "#9F1239" },
  green: { tint: "#DCFCE7", tone: "#166534" },
  amber: { tint: "#FEF3C7", tone: "#92400E" },
  purple: { tint: "#F0E9FB", tone: "#7C3AED" },
};

// ---------------------------------------------------------------------------
// Feed enrichment — transform raw feed items into mock-like human sentences
// ---------------------------------------------------------------------------

/** Parsed structure from a raw feed item. */
type EnrichedItem = {
  icon: IconName;
  tone: FeedTone;
  /** Main line HTML — e.g. "New application from <b>Lubombo Packaging</b> (ISO 9001)." */
  lineHtml: string;
  /** Sub-text — e.g. "Stage-1 audit scheduled. 2h ago" */
  sub: string;
  /** Action button label */
  actionLabel: string;
  /** Action href */
  href?: string;
};

/** Extract a reference ID (APP-YYYY-NNNNN, CERT-YYYY-NNNN, AUD-YYYY-NNNNN, etc.) from text. */
function extractRef(text: string): string | null {
  const m = text.match(/(?:APP|CERT|AUD|FV|SZNS|BP|BR|RR|TBT|STD|MET|INS|RES|WI|RISK)-[A-Z0-9-]*\d{3,}/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Map a reference ID to the correct institution-portal route.
 * The Core feed API may send hrefs without the sub-path segment (e.g.
 * `/institution/certification/APP-2026-00027` instead of
 * `/institution/certification/applications/APP-2026-00027`).
 * This function corrects the path so deep-links never hit the router
 * catch-all and bounce to the dashboard.
 */
function refToHref(ref: string): string | null {
  if (ref.startsWith("APP-")) return `/institution/certification/applications/${ref}`;
  if (ref.startsWith("CERT-")) return `/institution/certification/certificates/${ref}`;
  if (ref.startsWith("AUD-")) return `/institution/certification`;
  if (ref.startsWith("FV-")) return `/institution/fieldops`;
  if (ref.startsWith("WI-")) return `/institution/standards/workitems/${ref}`;
  if (ref.startsWith("STD-")) return `/institution/standards/catalogue/${ref}`;
  if (ref.startsWith("RES-")) return `/institution/board/resolutions/${ref}`;
  if (ref.startsWith("RISK-")) return `/institution/board/risks/${ref}`;
  if (ref.startsWith("MET-")) return `/institution/metrology/jobs/${ref}`;
  if (ref.startsWith("TBT-")) return `/institution/tbt`;
  return null;
}

/** Parse key=value pairs from the body detail string. */
function parseDetail(body: string | undefined): Record<string, string> {
  if (!body) return {};
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const k = part.slice(0, eq).trim().toLowerCase();
      const v = part.slice(eq + 1).trim();
      if (k && v) out[k] = v;
    }
  }
  return out;
}

/** Workflow state labels for supplement items (`REF — State`). */
const STATE_LABELS: Record<string, string> = {
  Application: "is in the application stage",
  Assessment: "moved to assessment",
  Audit: "moved to audit",
  "Audit Scheduled": "audit has been scheduled",
  Certified: "has been certified",
  Withdrawn: "was withdrawn",
  Rejected: "was rejected",
  Cancelled: "was cancelled",
  "Document Review": "is in document review",
  "Pending Review": "is pending review",
};

/**
 * Enrich a raw FeedItem into a human-readable EnrichedItem.
 * Falls back to the raw title if no pattern matches.
 */
function enrichItem(item: FeedItem): EnrichedItem {
  const title = item.title || "";
  const body = item.body;
  const ref = extractRef(title) ?? extractRef(body ?? "");
  const detail = parseDetail(body);
  // Prefer a correctly-mapped route from the ref; fall back to the API-provided href.
  // The Core feed may send hrefs without the sub-path segment (e.g.
  // /institution/certification/APP-2026-00027 → should be /applications/APP-2026-00027).
  const href = (ref && refToHref(ref)) || item.href;
  const time = relativeTime(item.created_at);

  // --- Pattern: Application submitted (R-C1) — shown as batch row, not here ---
  // (handled separately, but if it ends up here, enrich it)
  if (/application.*submit|R-C1/i.test(title)) {
    const auditRef = detail["stage-1 audit"] || detail["stage_1 audit"] || detail["audit"];
    const dept = detail["dept"] || detail["department"];
    const subParts: string[] = [];
    if (auditRef) subParts.push(`Stage-1 audit ${escapeHtml(auditRef)} scheduled`);
    if (dept) subParts.push(`${escapeHtml(dept)} dept`);
    if (subParts.length === 0 && body) subParts.push(escapeHtml(body));
    subParts.push(time);
    return {
      icon: "i-file",
      tone: "navy",
      lineHtml: `New application <b>${escapeHtml(ref ?? "submitted")}</b>.`,
      sub: subParts.join(". "),
      actionLabel: "Open",
      href,
    };
  }

  // --- Pattern: Supplement row — `REF — WorkflowState` ---
  const supplementMatch = title.match(/^([A-Z]+-\d{4}-\d{3,})\s*—\s*(.+)$/);
  if (supplementMatch) {
    const sRef = supplementMatch[1];
    const state = supplementMatch[2].trim();
    const label = STATE_LABELS[state] ?? `updated — ${escapeHtml(state)}`;
    const tone: FeedTone = state === "Certified" ? "green" : "navy";
    return {
      icon: state === "Certified" ? "i-award" : "i-file",
      tone,
      lineHtml: `Application <b>${escapeHtml(sRef)}</b> ${label}.`,
      sub: time,
      actionLabel: "Open",
      href,
    };
  }

  // --- Pattern: Audit overdue / scheduled ---
  if (/audit.*overdue|audit.*due/i.test(title)) {
    return {
      icon: "i-cal",
      tone: "red",
      lineHtml: `<b>Audit overdue</b>${ref ? ` for <b>${escapeHtml(ref)}</b>` : ""}.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "View",
      href,
    };
  }

  // --- Pattern: Field visit ---
  if (/field.visit|fv-|site.visit/i.test(title)) {
    return {
      icon: "i-pin",
      tone: "green",
      lineHtml: `Field visit${ref ? ` <b>${escapeHtml(ref)}</b>` : ""} was submitted.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "Review report",
      href,
    };
  }

  // --- Pattern: Calibration / lab overdue ---
  if (/calibrat|lab.*overdue|lab.*due|R-M3/i.test(title)) {
    return {
      icon: "i-flask",
      tone: "purple",
      lineHtml: `<b>Calibration</b>${ref ? ` for <b>${escapeHtml(ref)}</b>` : ""} went past due.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "View",
      href,
    };
  }

  // --- Pattern: Document reply / information request ---
  if (/reply|document.*submit|information.*request/i.test(title)) {
    return {
      icon: "i-mail",
      tone: "navy",
      lineHtml: `Documents received${ref ? ` on <b>${escapeHtml(ref)}</b>` : ""}.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "Open",
      href,
    };
  }

  // --- Pattern: Certificate issued ---
  if (/certificate.*issue|cert.*issue/i.test(title)) {
    return {
      icon: "i-award",
      tone: "green",
      lineHtml: `Certificate <b>${escapeHtml(ref ?? "issued")}</b>.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "View",
      href,
    };
  }

  // --- Pattern: TBT notification ---
  if (/tbt|wto.*notification|technical.barrier|R-T2/i.test(title)) {
    return {
      icon: "i-globe",
      tone: "amber",
      lineHtml: `<b>TBT alert</b>${ref ? ` — ${escapeHtml(ref)}` : ""}: ${escapeHtml(title.replace(/^\[.*?\]\s*/, ""))}.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "View",
      href,
    };
  }

  // --- Pattern: Workflow transition ---
  if (/workflow.*→|→.*audit|→.*assessment/i.test(title)) {
    return {
      icon: "i-file",
      tone: "navy",
      lineHtml: `Application <b>${escapeHtml(ref ?? title.replace(/^\[.*?\]\s*/, ""))}</b> moved to a new stage.`,
      sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
      actionLabel: "Open",
      href,
    };
  }

  // --- Fallback: use the raw title, stripped of [event-code] prefix ---
  const cleanTitle = title.replace(/^\[.*?\]\s*/, "");
  const severity = item.severity;
  let tone: FeedTone = "navy";
  if (severity === "critical") tone = "red";
  else if (severity === "warn") tone = "amber";
  else if (severity === "success") tone = "green";

  return {
    icon: "i-bell",
    tone,
    lineHtml: `<b>${escapeHtml(cleanTitle || title)}</b>`,
    sub: `${body ? escapeHtml(body) + ". " : ""}${time}`,
    actionLabel: "Open",
    href,
  };
}

function relativeTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - t.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday = d.toDateString() === y.toDateString();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return `today at ${time}`;
  if (isYesterday) return `yesterday at ${time}`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + ` at ${time}`;
}

/** Check if a feed item is an application-submitted (R-C1) event. */
function isAppSubmitted(item: FeedItem): boolean {
  return /application.*submit|R-C1/i.test(item.title) || item.type === "application_submitted";
}

export function EsiFeed({ feed, approvals, lastSeen, onAsk, onClaimAll }: EsiFeedProps) {
  const [question, setQuestion] = useState("");

  // Track which items are "fresh" (just arrived since the component mounted).
  const [freshId, setFreshId] = useState<string | null>(null);
  const prevPoolIds = useRef<Set<string>>(new Set());

  // --- Batch row: group R-C1 application-submitted feed items ---
  const appPool = useMemo(() => {
    return feed.filter(isAppSubmitted);
  }, [feed]);

  // --- Other activity: everything that's not an R-C1 application submission ---
  const otherFeedItems = useMemo(() => {
    return feed.filter((f) => !isAppSubmitted(f)).slice(0, 4);
  }, [feed]);

  // --- Unclaimed approvals count (for "Claim all N" button) ---
  // Broad match: any certification application in an early workflow state.
  const unclaimedCount = useMemo(() => {
    if (!approvals) return appPool.length;
    const early = approvals.filter(
      (a) =>
        a.module === "certification" &&
        !["Certified", "Withdrawn", "Rejected", "Cancelled"].includes(a.status),
    );
    return Math.max(early.length, appPool.length);
  }, [approvals, appPool]);

  // Track fresh arrivals for the "New" badge and nudge.
  useEffect(() => {
    const currentIds = new Set(appPool.map((a) => a.id));
    if (prevPoolIds.current.size > 0) {
      const newOnes = appPool.filter((a) => !prevPoolIds.current.has(a.id));
      if (newOnes.length > 0) {
        setFreshId(newOnes[0].id);
        const ref = extractRef(newOnes[0].title);
        window.dispatchEvent(
          new CustomEvent("esi-nudge", {
            detail: {
              message: `New application <b>${escapeHtml(ref ?? newOnes[0].title)}</b>. ${appPool.length} now waiting to be claimed.`,
            },
          }),
        );
      }
    }
    prevPoolIds.current = currentIds;
  }, [appPool]);

  // Enrich other feed items
  const enrichedOther = useMemo(() => {
    return otherFeedItems.map((item) => ({ item, enriched: enrichItem(item) }));
  }, [otherFeedItems]);

  const totalCount = (appPool.length > 0 ? 1 : 0) + enrichedOther.length;

  // Build subtitle text
  const subtitle = useMemo(() => {
    const seen = formatLastSeen(lastSeen);
    if (totalCount === 0) {
      return seen ? `Nothing new since ${seen}` : "Nothing new since your last visit";
    }
    const things = `${totalCount} thing${totalCount === 1 ? "" : "s"} came in`;
    return seen
      ? `Since you were last here ${seen}: ${things}`
      : `Since your last visit: ${things}`;
  }, [lastSeen, totalCount]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const q = question.trim();
      if (!q) return;
      onAsk?.(q);
      setQuestion("");
    },
    [question, onAsk],
  );

  function handleClaimAll() {
    onClaimAll?.();
    setFreshId(null);
  }

  const freshApp = freshId ? appPool.find((a) => a.id === freshId) : null;

  // Build the batch row's application name list — we only have refs from the feed,
  // so we show them as links. Mock design shows org (scheme) but that data isn't
  // in the feed payload yet.
  const poolNames = useMemo(() => {
    return appPool
      .slice(0, 3)
      .map((a) => {
        const ref = extractRef(a.title);
        return ref ? `<b>${escapeHtml(ref)}</b>` : escapeHtml(a.title);
      })
      .join(", ");
  }, [appPool]);

  return (
    <section className="panel esi-feed" aria-labelledby="esiTitle">
      <div className="panel__h">
        <div className="esi-feed__who">
          <span aria-hidden="true" className="esi-av">
            <Icon name="i-spark" />
          </span>
          <div>
            <h3 id="esiTitle">From Esi</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="r">
          <span className="esi-live">
            <i />
            Live
          </span>
        </div>
      </div>

      <ul aria-live="polite" className="esi-list">
        {totalCount === 0 ? (
          <li className="esi-item">
            <span />
            <div>
              <p>Nothing new since your last visit.</p>
            </div>
          </li>
        ) : (
          <>
            {appPool.length > 0 ? (
              <li className={`esi-item${freshApp ? " is-new" : ""}`}>
                <span
                  className="ic"
                  style={{
                    ["--ic-tint" as string]: TONE_MAP.navy.tint,
                    ["--ic-tone" as string]: TONE_MAP.navy.tone,
                  }}
                >
                  <Icon name="i-file" />
                </span>
                <div>
                  <p
                    dangerouslySetInnerHTML={{
                      __html:
                        (freshApp ? '<span class="new-tag">New</span> ' : "") +
                        `<b>${appPool.length} new application${appPool.length > 1 ? "s" : ""}</b> waiting to be claimed: ${poolNames}` +
                        (appPool.length > 3
                          ? ` and ${appPool.length - 3} more`
                          : "") +
                        ".",
                    }}
                  />
                  <small>
                    {freshApp
                      ? `Just now: ${escapeHtml(extractRef(freshApp.title) ?? freshApp.title)}`
                      : `Earliest arrived ${relativeTime(appPool[appPool.length - 1]?.created_at ?? "")}. Claim within 1 working day`}
                  </small>
                </div>
                <span className="esi-acts">
                  <button type="button" className="eb pri" onClick={handleClaimAll}>
                    Claim all {unclaimedCount}
                  </button>
                  <button
                    type="button"
                    className="eb"
                    onClick={() => {
                      window.location.assign("/institution/approvals");
                    }}
                  >
                    Open queue
                  </button>
                </span>
              </li>
            ) : null}

            {enrichedOther.map(({ item, enriched }) => {
              const meta = TONE_MAP[enriched.tone];
              return (
                <li key={item.id} className="esi-item">
                  <span
                    className="ic"
                    style={{
                      ["--ic-tint" as string]: meta.tint,
                      ["--ic-tone" as string]: meta.tone,
                    }}
                  >
                    <Icon name={enriched.icon} />
                  </span>
                  <div>
                    <p dangerouslySetInnerHTML={{ __html: enriched.lineHtml }} />
                    <small>{enriched.sub}</small>
                  </div>
                  <span className="esi-acts">
                    {enriched.href ? (
                      <a
                        href={enriched.href}
                        className="eb"
                        onClick={(e) => {
                          if (enriched.href?.startsWith("/")) {
                            e.preventDefault();
                            window.location.assign(enriched.href);
                          }
                        }}
                      >
                        {enriched.actionLabel}
                      </a>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </>
        )}
      </ul>

      <form className="esi-ask" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="esi-q">
          Ask Esi about these
        </label>
        <input
          id="esi-q"
          type="text"
          autoComplete="off"
          placeholder="Ask about these, e.g. which of the new applications are food businesses?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={!question.trim()}>
          Ask Esi
        </button>
      </form>
    </section>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}