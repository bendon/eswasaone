import type { ReactNode } from "react";
import type { IconName } from "../icons/Icon";

/**
 * Lightweight decorative SVG for service-card gradient bands.
 * Inline (no HTTP), ~0.3–0.6 KB each, white-on-transparent for any gradient.
 */
export function SvcBandArt({ motif }: { motif: IconName | string }) {
  const art = ART[motif] ?? ART["i-book"];
  return (
    <svg
      className="svc__art"
      viewBox="0 0 160 76"
      width="160"
      height="76"
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}

const stroke = {
  fill: "none",
  stroke: "#fff",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  opacity: 0.22,
};

const fillSoft = { fill: "#fff", opacity: 0.1 };

const ART: Record<string, ReactNode> = {
  "i-book": (
    <>
      <rect x="78" y="14" width="52" height="48" rx="4" {...fillSoft} />
      <path d="M86 22h36M86 30h28M86 38h32M86 46h20" {...stroke} />
      <path d="M78 14v48M130 14v48" {...stroke} opacity={0.16} />
      <circle cx="148" cy="58" r="10" {...fillSoft} />
    </>
  ),
  "i-badge": (
    <>
      <circle cx="118" cy="38" r="26" {...fillSoft} />
      <circle cx="118" cy="38" r="18" {...stroke} />
      <circle cx="118" cy="38" r="10" {...stroke} opacity={0.18} />
      <path d="M118 22v8M118 46v8M102 38h8M126 38h8" {...stroke} opacity={0.16} />
      <path d="M108 54l4 10 6-4 6 4 4-10" {...stroke} opacity={0.2} />
    </>
  ),
  "i-globe": (
    <>
      <circle cx="118" cy="38" r="28" {...fillSoft} />
      <circle cx="118" cy="38" r="28" {...stroke} />
      <ellipse cx="118" cy="38" rx="12" ry="28" {...stroke} opacity={0.18} />
      <path d="M90 38h56M94 26c12 6 36 6 48 0M94 50c12-6 36-6 48 0" {...stroke} opacity={0.18} />
    </>
  ),
  "i-cap": (
    <>
      <path d="M88 34l30-12 30 12-30 12z" {...fillSoft} />
      <path d="M88 34l30-12 30 12-30 12z" {...stroke} />
      <path d="M100 40v12c0 4 8 8 18 8s18-4 18-8V40" {...stroke} opacity={0.2} />
      <path d="M140 36v16" {...stroke} opacity={0.16} />
      <circle cx="140" cy="54" r="3" {...fillSoft} />
    </>
  ),
  "i-shield": (
    <>
      <path
        d="M118 12l28 10v16c0 16-10 26-28 32-18-6-28-16-28-32V22z"
        {...fillSoft}
      />
      <path
        d="M118 12l28 10v16c0 16-10 26-28 32-18-6-28-16-28-32V22z"
        {...stroke}
      />
      <path d="M106 36l8 8 16-16" {...stroke} opacity={0.28} />
    </>
  ),
  "i-alert-c": (
    <>
      <circle cx="118" cy="38" r="26" {...fillSoft} />
      <circle cx="118" cy="38" r="26" {...stroke} />
      <path d="M118 24v16" {...stroke} opacity={0.28} />
      <circle cx="118" cy="50" r="2.2" fill="#fff" opacity={0.28} />
      <path d="M148 20c6 8 6 22 0 30M140 24c4 6 4 16 0 22" {...stroke} opacity={0.14} />
    </>
  ),
};

/**
 * Larger decorative SVG for AI feature-card gradient bands (260×120).
 * Circuit / neural patterns for standards card, lab / molecule for lab card.
 */
export function AiCardArt({ motif }: { motif: "standards" | "lab" }) {
  const art = AI_ART[motif];
  return (
    <svg
      className="ai-card__art"
      viewBox="0 0 260 120"
      width="260"
      height="120"
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}

const AI_ART: Record<"standards" | "lab", ReactNode> = {
  standards: (
    <g opacity="0.22" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="60" cy="30" r="6" />
      <circle cx="120" cy="60" r="6" />
      <circle cx="190" cy="40" r="6" />
      <circle cx="200" cy="100" r="6" />
      <circle cx="90" cy="95" r="6" />
      <path d="M60 30l60 30M120 60l70-20M120 60l80 40M60 30l30 65M190 40l10 60" />
      <rect x="150" y="20" width="80" height="60" rx="4" />
      <path d="M162 34h56M162 46h40M162 58h52" />
    </g>
  ),
  lab: (
    <g opacity="0.22" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M70 30h40v30l24 44a8 8 0 01-7 12H53a8 8 0 01-7-12l24-44z" />
      <path d="M62 80h56" />
      <circle cx="180" cy="40" r="14" />
      <circle cx="210" cy="60" r="8" />
      <circle cx="180" cy="88" r="8" />
      <path d="M180 54v26M194 40l16 12M206 54l-18 26" />
      <path d="M60 50h20M60 62h30" />
    </g>
  ),
};
