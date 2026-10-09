/**
 * Deep-link to Frappe Desk for workflows that stay Desk-only (§6 register).
 * Desk is not public on aiceafrica.com — only opens when VITE_DESK_URL /
 * VITE_FRAPPE_URL is set or host is localhost.
 */

function configuredDeskBase(): string | null {
  try {
    const fromEnv =
      (import.meta.env.VITE_FRAPPE_URL as string | undefined)?.replace(/\/$/, "") ||
      (import.meta.env.VITE_DESK_URL as string | undefined)?.replace(/\/$/, "");
    if (fromEnv) return fromEnv;
  } catch {
    /* non-Vite */
  }
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:8020";
  }
  return null;
}

export function deskAvailable(): boolean {
  return configuredDeskBase() != null;
}

/** Build Desk URL for a doctype list or form path (e.g. `payroll-entry/new`). */
export function deskUrl(doctypePath: string, name?: string): string | null {
  const base = configuredDeskBase();
  if (!base) return null;
  const clean = doctypePath.replace(/^\//, "");
  if (name) return `${base}/app/${clean}/${encodeURIComponent(name)}`;
  return `${base}/app/${clean}`;
}

export function openDesk(doctypePath: string, name?: string): boolean {
  const url = deskUrl(doctypePath, name);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export type DeskLinkProps = {
  /** Desk path under /app/ — e.g. `salary-structure` or `lms-course` */
  doctype: string;
  name?: string;
  label?: string;
  className?: string;
  onUnavailable?: (msg: string) => void;
};

/**
 * Labelled "Open in Desk ↗" — never a silent dead button.
 */
export function DeskLink({
  doctype,
  name,
  label = "Open in Desk ↗",
  className = "desk-link",
  onUnavailable,
}: DeskLinkProps) {
  const url = deskUrl(doctype, name);
  const available = url != null;

  return (
    <button
      type="button"
      className={className}
      title={
        available
          ? `Open ${doctype}${name ? ` / ${name}` : ""} in admin desk`
          : "Admin desk is not public on this host. Set VITE_DESK_URL for admins"
      }
      onClick={() => {
        if (openDesk(doctype, name)) return;
        const msg =
          "Admin desk is not public on this host. Use an SSH tunnel to :8020 or set VITE_DESK_URL for admins.";
        if (onUnavailable) onUnavailable(msg);
        else window.alert(msg);
      }}
    >
      {label}
    </button>
  );
}
