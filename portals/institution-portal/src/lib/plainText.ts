/** Strip HTML tags / entities for Frappe Text Editor fields shown as plain UI text. */
export function plainText(input: string | null | undefined): string {
  if (!input) return "";
  const withBreaks = input
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td\s*>/gi, " ");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull "Action: …" lines from a resolution body (HTML or plain). */
export function actionLinesFromBody(input: string | null | undefined): string[] {
  const plain = plainText(input);
  if (!plain) return [];
  const labeled = [...plain.matchAll(/(?:^|\n)\s*(?:Action(?:\s*item)?|AI|TODO)\s*:\s*(.+)/gi)].map(
    (m) => (m[1] || "").trim(),
  );
  if (labeled.length) {
    return [...new Set(labeled.filter((s) => s.length >= 3))].slice(0, 12);
  }
  if (/\bAction\s*:/i.test(plain)) {
    return plain
      .split(/\b(?:Action(?:\s*item)?|AI|TODO|Owner)\s*:/i)
      .map((p) => p.trim().replace(/^[-–—\s]+/, ""))
      .filter((p) => p.length >= 3)
      .slice(0, 12);
  }
  return [];
}
