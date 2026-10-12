/**
 * Live Core ↔ Institution certification mapping.
 * Used when VITE_DEMO_MODE=false so Applications / record pages hit Frappe via Core.
 */
import { apiFetch } from "../api/client";
import type { AppState, CertApplication, CertFlowKind, CertQuote, FeeLine, SchemeDef } from "./types";
import { DEFAULT_CERT_SETTINGS, SEED_SCHEMES } from "./seed";

type LiveQuote = {
  id: string;
  status?: string;
  flow?: string;
  org?: string;
  contact?: string;
  contact_email?: string;
  standards?: string;
  scope?: string;
  employees?: string;
  sites?: string;
  requested_at?: string;
  issued_at?: string;
  valid_until?: string;
  lines?: { label: string; amount: number }[];
  total?: number;
  application_id?: string;
  pdf_url?: string;
  pdf_key?: string;
};

type LiveApp = {
  id: string;
  scheme: string;
  applicant: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  quote?: LiveQuote | null;
};

type LiveScheme = {
  code: string;
  name: string;
  standard_ref?: string | null;
  scheme_type: string;
  description?: string | null;
  fee?: number | null;
};

/** Frappe / Core display status → Institution APP_DEF state. */
export function liveStatusToState(status: string): AppState {
  const key = status.trim().toLowerCase().replace(/_/g, " ");
  const map: Record<string, AppState> = {
    submitted: "Submitted",
    application: "Submitted",
    "in review": "Document Review",
    assessment: "Document Review",
    "document review": "Document Review",
    "awaiting customer": "Awaiting Customer",
    "quote ready": "Quoted",
    quoted: "Quoted",
    "audit scheduled": "Audit Planned",
    "audit planned": "Audit Planned",
    "audit in progress": "Audit in Progress",
    audit: "Audit in Progress",
    "nc resolution": "NC Resolution",
    "technical review": "Technical Review",
    decision: "Decision",
    certified: "Certified",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    withdraw: "Withdrawn",
    surveillance: "Certified",
    renewal: "Document Review",
  };
  return map[key] ?? "Submitted";
}

/** APP_DEF state → Frappe expected_state for /act. */
export function stateToFrappeExpected(state: string): string {
  const map: Record<string, string> = {
    Submitted: "Application",
    "Document Review": "Assessment",
    "Awaiting Customer": "Assessment",
    Quoted: "Quoted",
    "Audit Planned": "Audit Scheduled",
    "Audit in Progress": "Audit",
    "NC Resolution": "NC Resolution",
    "Technical Review": "NC Resolution",
    Decision: "NC Resolution",
    Certified: "Certified",
    Rejected: "Withdraw",
    Withdrawn: "Withdraw",
  };
  return map[state] ?? state;
}

/** Institution action id → Frappe workflow action. */
export function mapActToFrappe(action: string): string {
  const map: Record<string, string> = {
    start_review: "submit_for_assessment",
    issue_quote: "issue_quotation",
    record_deposit: "schedule_audit",
    customer_accept: "schedule_audit",
    start_audit: "start_audit",
    to_nc_resolution: "raise_nc",
    clear_nc: "clear_nc",
    certify: "certify",
    grant: "certify",
    grant_conditions: "certify",
    withdraw: "withdraw",
    customer_withdraw: "withdraw",
  };
  return map[action] ?? action;
}

function flowFromScheme(scheme: string, quote?: LiveQuote | null): CertFlowKind {
  if (quote?.flow === "ms" || quote?.flow === "product" || quote?.flow === "ingelo" || quote?.flow === "combined") {
    return quote.flow;
  }
  const code = scheme.toUpperCase();
  if (code.includes("INGELO")) return "ingelo";
  if (code.includes("PRODUCT") || code.includes("SZNS")) return "product";
  return "ms";
}

function quoteFromLive(q: LiveQuote): CertQuote {
  const lines: FeeLine[] = (q.lines ?? []).map((l) => ({
    label: l.label,
    qty: 1,
    unit_price: l.amount,
  }));
  return {
    id: q.id,
    lines,
    auditor_days: 0,
    valid_until: q.valid_until ?? "",
    issued_at: q.issued_at ?? q.requested_at ?? "",
    issued_by: "ESWASA",
    deposit_pct: DEFAULT_CERT_SETTINGS.deposit_pct,
    accepted_at: q.status === "accepted" ? q.issued_at : undefined,
  };
}

export function liveAppToCert(raw: LiveApp): CertApplication {
  const state = liveStatusToState(raw.status);
  const flow = flowFromScheme(raw.scheme, raw.quote);
  const seed = SEED_SCHEMES.find((s) => s.code === raw.scheme || s.code.toLowerCase() === raw.scheme.toLowerCase());
  const standard = raw.quote?.standards || seed?.standard || raw.scheme;
  const created = raw.created_at ?? new Date().toISOString();
  const employees = Number(raw.quote?.employees) || 1;
  return {
    id: raw.id,
    state,
    seq: 1,
    flow,
    scheme: raw.scheme,
    standard,
    org: raw.applicant || raw.quote?.org || "—",
    contact: raw.quote?.contact || raw.applicant || "—",
    customer_email: raw.quote?.contact_email || "unknown",
    sites: [{ name: "Main site", address: raw.quote?.sites || "", employees }],
    employees,
    scope: raw.quote?.scope || "",
    channel: "portal",
    created_at: created,
    documents: (seed?.required_docs ?? []).map((d) => ({
      key: d.key,
      label: d.label,
      required: true,
      status: "missing" as const,
      versions: [],
    })),
    info_requests: [],
    quote: raw.quote?.id ? quoteFromLive(raw.quote) : undefined,
    stages: [],
    findings: [],
    sample_ids: [],
    history: [
      {
        at: created,
        actor: "System",
        action: `Loaded from Core (${raw.status})`,
        to: state,
      },
    ],
  };
}

export async function fetchLiveApplications(f: {
  state?: string;
  q?: string;
  limit?: number;
} = {}): Promise<CertApplication[]> {
  const params = new URLSearchParams();
  params.set("limit", String(f.limit ?? 200));
  if (f.state) params.set("status", f.state);
  const res = await apiFetch<{ items: LiveApp[] }>(`/certification/applications?${params}`);
  let items = (res.items ?? []).map(liveAppToCert);
  const q = f.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((a) => `${a.id} ${a.org} ${a.standard} ${a.scope}`.toLowerCase().includes(q));
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchLiveApplication(id: string): Promise<CertApplication | null> {
  try {
    const raw = await apiFetch<LiveApp>(`/certification/applications/${encodeURIComponent(id)}`);
    return liveAppToCert(raw);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 404) return null;
    throw e;
  }
}

export async function createLiveApplication(input: {
  scheme: string;
  org: string;
  customer_email: string;
}): Promise<CertApplication> {
  const raw = await apiFetch<LiveApp>("/certification/applications", {
    method: "POST",
    body: JSON.stringify({
      scheme: input.scheme,
      applicant_name: input.org,
      contact_email: input.customer_email === "demo" ? undefined : input.customer_email,
      confirm: true,
    }),
  });
  return liveAppToCert(raw);
}

export async function actLiveApplication(
  id: string,
  action: string,
  expectedState: string,
  reason?: string,
  comment?: string,
): Promise<CertApplication> {
  const raw = await apiFetch<LiveApp>(`/certification/applications/${encodeURIComponent(id)}/act`, {
    method: "POST",
    body: JSON.stringify({
      action: mapActToFrappe(action),
      expected_state: stateToFrappeExpected(expectedState),
      reason,
      comment,
      confirm: true,
      idempotency_key: `act-${id}-${action}-${Date.now()}`,
    }),
  });
  return liveAppToCert(raw);
}

export async function fetchLiveSchemes(): Promise<SchemeDef[]> {
  try {
    const res = await apiFetch<{ items: LiveScheme[] }>("/certification/schemes");
    const items = res.items ?? [];
    if (!items.length) return SEED_SCHEMES;
    return items.map((s) => {
      const seed = SEED_SCHEMES.find((x) => x.code === s.code || x.standard === (s.standard_ref ?? ""));
      const flow: CertFlowKind =
        s.scheme_type?.toLowerCase().includes("product") ? "product" : seed?.flow ?? "ms";
      return {
        code: s.code,
        title: s.name,
        standard: s.standard_ref || s.name,
        flow,
        required_docs: seed?.required_docs ?? SEED_SCHEMES[0].required_docs,
        cac: seed?.cac ?? false,
      };
    });
  } catch {
    return SEED_SCHEMES;
  }
}
