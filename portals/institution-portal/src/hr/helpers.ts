/** Shared HR display helpers (no demo data). */

export function initialsFromName(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Pipeline column labels for recruitment board (status mapping only). */
export const PIPELINE_STAGES: { label: string; color: string }[] = [
  { label: "Applied", color: "var(--blue)" },
  { label: "Screening", color: "#4F46E5" },
  { label: "Interview", color: "var(--amber)" },
  { label: "Offer", color: "var(--purple)" },
  { label: "Hired", color: "var(--green)" },
];
