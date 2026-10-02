/**
 * EswasaOne brand constants — mirror of tokens.css for JS/TS consumers
 * (charts, canvas, theme-color, PWA manifests). Prefer CSS variables in UI.
 */
export const brand = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  line: "#E4EAF2",
  line2: "#EFF3F8",
  ink: "#0F172A",
  muted: "#5A6B84",
  muted2: "#8A9AB1",
  /** Sampled from official ESWASA logo mark */
  navy: "#313391",
  navyDark: "#24286F",
  navyTint: "#ECEEFC",
  royal: "#2B3399",
  gold: "#F5C518",
  goldDark: "#D9A800",
  goldInk: "#24286F",
  goldTint: "#FEF6DC",
  green: "#16A34A",
  live: "#22C55E",
  red: "#E11D6E",
  blue: "#2563EB",
  purple: "#7C3AED",
  indigo: "#4F46E5",
  orange: "#EA6C1E",
  sidebar: "#0E1524",
  sidebar2: "#161F32",
  sidebarLine: "#1E2942",
} as const;

/** Type stacks — keep in sync with tokens.css */
export const fontSans = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
export const fontMono =
  '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export type BrandColor = keyof typeof brand;

/** Theme color for PWA / browser chrome */
export const themeColor = brand.navy;
export const themeBackground = brand.navyDark;
