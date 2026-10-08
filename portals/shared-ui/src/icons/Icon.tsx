import type { ReactNode } from "react";

export type IconName =
  "i-building"
  | "i-download"
  | "i-link"
  | "i-dollar"
  | "i-bank"
  | "i-check"
  | "i-chev"
  | "i-cright"
  | "i-cleft"
  | "i-cev"
  | "i-spark"
  | "i-send"
  | "i-steps"
  | "i-out"
  | "i-star"
  | "i-heart"
  | "i-plus"
  | "i-x"
  | "i-dl"
  | "i-list"
  | "i-open"
  | "i-phone"
  | "i-play"
  |   "i-alert-c"
  | "i-award"
  | "i-badge"
  | "i-bell"
  | "i-board"
  | "i-book"
  | "i-briefcase"
  | "i-cal"
  | "i-cap"
  | "i-cart"
  | "i-chart"
  | "i-check-c"
  | "i-chip"
  | "i-clip"
  | "i-clipboard"
  | "i-clock"
  | "i-eye"
  | "i-file"
  | "i-flask"
  | "i-gauge"
  | "i-globe"
  | "i-grid"
  | "i-home"
  | "i-layers"
  | "i-lock"
  | "i-mail"
  | "i-map"
  | "i-mega"
  | "i-mic"
  | "i-monitor"
  | "i-more"
  | "i-pin"
  | "i-plane"
  | "i-refresh"
  | "i-scroll"
  | "i-search"
  | "i-settings"
  | "i-shield"
  | "i-shield-c"
  | "i-sliders"
  | "i-sun"
  | "i-trend"
  | "i-trend-down"
  | "i-users"
  | "i-warn";

const PATHS_BASE = {
  "i-alert-c": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  "i-award": (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9.7 13.5L8 21l4-2 4 2-1.7-7.5" />
    </>
  ),
  "i-badge": (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9.7 13.5L8 21l4-2 4 2-1.7-7.5" />
    </>
  ),
  "i-bell": (
    <>
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 004 0" />
    </>
  ),
  "i-board": (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  "i-book": (
    <>
      <path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 016.5 18H20" />
    </>
  ),
  "i-briefcase": (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" />
    </>
  ),
  "i-cal": (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  "i-cap": (
    <>
      <path d="M12 4l10 5-10 5L2 9z" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </>
  ),
  "i-cart": (
    <>
      <path d="M3 4h2l2.2 11.2a1.5 1.5 0 001.5 1.2h8.1a1.5 1.5 0 001.5-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17.5" cy="20" r="1.2" />
    </>
  ),
  "i-chart": (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16l3-4 3 2 4-6" />
    </>
  ),
  "i-check-c": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12l2.3 2.3L15.5 9.5" />
    </>
  ),
  "i-chip": (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  "i-clip": (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  "i-clipboard": (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  "i-clock": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  "i-eye": (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "i-file": (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h5" />
    </>
  ),
  "i-flask": (
    <>
      <path d="M9 3h6v6l4 9a2 2 0 01-2 3H7a2 2 0 01-2-3l4-9z" />
      <path d="M8 13h8" />
    </>
  ),
  "i-gauge": (
    <>
      <path d="M4 18a8 8 0 1116 0" />
      <path d="M12 18l4-5" />
      <circle cx="12" cy="18" r="1" />
    </>
  ),
  "i-globe": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </>
  ),
  "i-grid": (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  "i-home": (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </>
  ),
  "i-layers": (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  "i-steps": (
    <>
      <path d="M4 18h4v-4H4zM10 14h4v-4h-4zM16 10h4V6h-4z" />
    </>
  ),
  "i-lock": (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  "i-mail": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 5 8-5" />
    </>
  ),
  "i-plane": (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>
  ),
  "i-map": (
    <>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  "i-mic": (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" />
    </>
  ),
  "i-mega": (
    <>
      <path d="M4 10v4a1 1 0 001 1h2l4 4V5L7 9H5a1 1 0 00-1 1z" />
      <path d="M16 8a5 5 0 010 8" />
    </>
  ),
  "i-monitor": (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  "i-more": (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  "i-pin": (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  "i-refresh": (
    <>
      <path d="M20 11a8 8 0 00-14-4M4 5v4h4" />
      <path d="M4 13a8 8 0 0014 4M20 19v-4h-4" />
    </>
  ),
  "i-scroll": (
    <>
      <path d="M6 3h9a3 3 0 013 3v12a3 3 0 003 3H9a3 3 0 01-3-3z" />
      <path d="M6 3a3 3 0 00-3 3v12a3 3 0 003 3" />
    </>
  ),
  "i-search": (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </>
  ),
  "i-settings": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  "i-shield": (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  "i-shield-c": (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  "i-sliders": (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="#fff" />
      <circle cx="15" cy="12" r="2" fill="#fff" />
      <circle cx="7" cy="18" r="2" fill="#fff" />
    </>
  ),
  "i-sun": (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" />
    </>
  ),
  "i-trend": (
    <>
      <path d="M4 16l5-5 3 3 7-8" />
      <path d="M15 6h5v5" />
    </>
  ),
  "i-trend-down": (
    <>
      <path d="M4 8l5 5 3-3 7 8" />
      <path d="M15 18h5v-5" />
    </>
  ),
  "i-users": (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0112 0M16 5.5a3.2 3.2 0 010 6M21 20a6 6 0 00-4-5.6" />
    </>
  ),
  "i-warn": (
    <>
      <path d="M12 4l9 15H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

const PATHS: Record<IconName, ReactNode> = {
  ...PATHS_BASE,
  "i-building": PATHS_BASE["i-home"],
  "i-download": PATHS_BASE["i-clip"],
  "i-link": PATHS_BASE["i-globe"],
  "i-dollar": PATHS_BASE["i-trend"],
  "i-bank": PATHS_BASE["i-trend"],
  "i-check": PATHS_BASE["i-check-c"],
  "i-chev": (
    <>
      <path d="M6 9l6 6 6-6" />
    </>
  ),
  "i-cright": (
    <>
      <path d="M9 6l6 6-6 6" />
    </>
  ),
  "i-cleft": (
    <>
      <path d="M15 6l-6 6 6 6" />
    </>
  ),
  "i-cev": (
    <>
      <path d="M6 9l6 6 6-6" />
    </>
  ),
  "i-spark": PATHS_BASE["i-chip"],
  "i-send": PATHS_BASE["i-mail"],
  "i-out": (
    <>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  "i-star": PATHS_BASE["i-award"],
  "i-heart": PATHS_BASE["i-bell"],
  "i-plus": (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  "i-x": (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  "i-dl": PATHS_BASE["i-clip"],
  "i-list": PATHS_BASE["i-scroll"],
  "i-open": PATHS_BASE["i-eye"],
  "i-phone": (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  ),
  "i-play": PATHS_BASE["i-trend"],
};

export const ICON_IDS = Object.keys(PATHS) as IconName[];

export type IconProps = {
  name: IconName;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

export function Icon({ name, size = 20, width, height, className, title, ...rest }: IconProps) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rest["aria-label"] || title ? undefined : true}
      aria-label={rest["aria-label"]}
      role={rest["aria-label"] || title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

/** Optional sprite hook for AppShell — icons render inline. */
export function IconSprite() {
  return null;
}
