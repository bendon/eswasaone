/** Escape untrusted server / crawled strings before render. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe text node — React already escapes; use for titles set via dangerouslySetInnerHTML only. */
export function safeText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw);
}
