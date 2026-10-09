import type { IconName } from "@eswasaone/shared-ui";

export type InstitutionRouteId =
  | "dashboard"
  | "approvals"
  | "board"
  | "crm"
  | "certification"
  | "standards"
  | "metrology"
  | "field"
  | "lms"
  | "tbt"
  | "finance"
  | "hr"
  | "marketing"
  | "reports"
  | "admin";

export type InstitutionNavDef = {
  id: InstitutionRouteId;
  path: string;
  label: string;
  icon: IconName;
  title: string;
  end?: boolean;
};

/** Left-rail modules — order matches institutional mock IA. */
export const INSTITUTION_NAV: InstitutionNavDef[] = [
  { id: "dashboard", path: "/", label: "Dashboard", icon: "i-grid", title: "Dashboards", end: true },
  { id: "approvals", path: "/approvals", label: "Approvals", icon: "i-done", title: "Approvals" },
  { id: "board", path: "/board", label: "Board & Governance", icon: "i-trend", title: "Board & Governance" },
  { id: "crm", path: "/crm", label: "CRM & Commercial", icon: "i-case", title: "CRM & Commercial" },
  {
    id: "certification",
    path: "/certification",
    label: "Certification",
    icon: "i-award",
    title: "Certification",
  },
  { id: "standards", path: "/standards", label: "Standards Dev", icon: "i-book", title: "Standards Development" },
  { id: "metrology", path: "/metrology", label: "Metrology & LIMS", icon: "i-gauge", title: "Metrology & LIMS" },
  { id: "field", path: "/field", label: "Field Operations", icon: "i-map", title: "Field Operations" },
  { id: "tbt", path: "/tbt", label: "WTO/TBT Alerts", icon: "i-globe", title: "WTO/TBT Alerts" },
  { id: "hr", path: "/hr", label: "HR & People", icon: "i-users", title: "HR & People" },
  { id: "reports", path: "/reports", label: "Reports & Analytics", icon: "i-chart", title: "Reports & Analytics" },
  {
    id: "admin",
    path: "/admin",
    label: "System Administration",
    icon: "i-sliders",
    title: "System Administration",
  },
];

export function pathForRouteId(id: string): string | null {
  const hit = INSTITUTION_NAV.find((n) => n.id === id);
  return hit?.path ?? null;
}

export function titleForPath(pathname: string): string {
  const clean = pathname.replace(/\/$/, "") || "/";
  const hit = INSTITUTION_NAV.find((n) => {
    if (n.end) return clean === "/" || clean === "";
    return clean === n.path || clean.startsWith(`${n.path}/`);
  });
  return hit?.title ?? "Institution Portal";
}

/** Map Ask tools / free-text cues to rail routes. */
export function routeFromAsk(message: string, toolsUsed?: string[]): string | null {
  const tools = toolsUsed ?? [];
  if (tools.includes("list_overdue_audits") || tools.includes("list_certification_applications")) {
    return "/certification";
  }
  if (tools.some((t) => t.includes("approval"))) return "/approvals";
  if (tools.some((t) => t.includes("tbt"))) return "/tbt";
  if (tools.some((t) => t.includes("board") || t.includes("governance"))) return "/board";
  if (tools.some((t) => t.includes("finance") || t.includes("revenue"))) return "/finance";
  if (tools.some((t) => t.includes("hr") || t.includes("appraisal"))) return "/hr";
  if (tools.some((t) => t.includes("metrology") || t.includes("calib"))) return "/metrology";
  if (tools.some((t) => t.includes("standard"))) return "/standards";
  if (tools.some((t) => t.includes("crm") || t.includes("pipeline"))) return "/crm";
  if (tools.some((t) => t.includes("admin") || t.includes("system"))) return "/admin";

  const m = message.toLowerCase();
  if (/overdue|audit|sla|application/.test(m)) return "/certification";
  if (/approval|sign-?off|queue/.test(m)) return "/approvals";
  if (/board|council|governance|pack/.test(m)) return "/board";
  if (/revenue|budget|finance|invoice/.test(m)) return "/finance";
  if (/tbt|wto|notification/.test(m)) return "/tbt";
  if (/hr|headcount|leave|appraisal/.test(m)) return "/hr";
  if (/metrology|calib|lims/.test(m)) return "/metrology";
  if (/standard|szns|catalogue/.test(m)) return "/standards";
  if (/crm|pipeline|commercial/.test(m)) return "/crm";
  if (/report|analytics|chart/.test(m)) return "/reports";
  if (/lms|training|enrol/.test(m)) return "/lms";
  if (/market|campaign|outreach/.test(m)) return "/marketing";
  if (/admin|system\s*admin|system\s*manager|bench\s*update|\bupdates?\b|clear\s*cache/.test(m)) {
    return "/admin";
  }
  return null;
}
