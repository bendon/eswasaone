/**
 * Certification desk API: real Core endpoints where they exist, otherwise a
 * local store marked TODO: wire real. Demo fixtures load only with VITE_DEMO_MODE=true.
 *
 * Real (Core): GET/POST /certification/applications, POST …/{id}/advance,
 * PATCH /certification/audits/{id}, POST /certification/certificates/{id}/revoke|renew,
 * GET /certification/certificates/{id}/pdf, GET /verify/{token}, GET /org/staff,
 * GET /certification/findings, POST …/applications/{id}/findings, POST …/findings/{id}/review.
 */
import { apiFetch } from "@eswasaone/shared-ui";
import type { CertAction, CertFlow } from "./pipeline";

/* ---------------- types ---------------- */

export type QuoteStatus = "requested" | "issued" | "accepted" | "declined" | "expired";
export type QuoteLine = { label: string; amount: number };

export type DeskQuote = {
  id: string;
  status: QuoteStatus;
  flow: CertFlow;
  org: string;
  contact: string;
  contact_email: string;
  phone?: string;
  standards: string;
  scope: string;
  employees?: string;
  sites?: string;
  requested_at: string;
  issued_at?: string;
  valid_until?: string;
  lines?: QuoteLine[];
  total?: number;
  application_id?: string;
  notes?: string;
};

export type FindingStatus = "open" | "submitted" | "accepted" | "rejected";
export type DeskFinding = {
  id: string;
  application_id: string;
  org: string;
  clause: string;
  severity: "major" | "minor" | "observation";
  statement: string;
  raised_at: string;
  due: string;
  status: FindingStatus;
  response?: { root_cause: string; correction: string; corrective_action: string; evidence: string[] };
  review_note?: string;
};

export type LabEntry = {
  id: string;
  application_id: string;
  sample: string;
  field: string;
  status: "pending" | "in_test" | "pass" | "fail";
  report?: string;
  at: string;
};

export type DeskDecision = {
  application_id: string;
  outcome: "granted" | "refused";
  body: "Certification decision" | "Certification Approval Committee";
  decided_by: string;
  note: string;
  at: string;
};

export type RegisterKind = "suspended" | "withdrawn" | "reduced";
export type RegisterEntry = {
  id: string;
  flow: CertFlow;
  kind: RegisterKind;
  holder: string;
  certificate: string;
  scope: string;
  since: string;
  reason: string;
};

export type DeskCase = {
  id: string;
  kind: "appeal" | "complaint" | "changes" | "scope";
  application_id?: string;
  from: string;
  text: string;
  received_at: string;
  status: "received" | "acknowledged" | "in_review" | "closed";
};

export type AppExtras = {
  flow?: CertFlow;
  auditor?: string;
  substeps: Record<string, boolean>;
  channel?: string;
};

type Store = {
  quotes: Record<string, DeskQuote>;
  findings: Record<string, DeskFinding>;
  lab: Record<string, LabEntry>;
  decisions: Record<string, DeskDecision>;
  register: Record<string, RegisterEntry>;
  cases: Record<string, DeskCase>;
  extras: Record<string, AppExtras>;
  seeded: boolean;
};

/* ---------------- store ---------------- */

const KEY = "eswasaone.desk.cert.v1";

export class NotConnectedError extends Error {
  constructor(what: string) {
    super(`${what}: not saved. This isn't connected to the certification system yet.`);
    this.name = "NotConnectedError";
  }
}

/** Local-only writes are allowed in demo mode only; otherwise they would claim work that went nowhere. */
function requireDemo(what: string): void {
  if (!demoMode()) throw new NotConnectedError(what);
}

export function demoMode(): boolean {
  try {
    return String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

function emptyStore(): Store {
  return { quotes: {}, findings: {}, lab: {}, decisions: {}, register: {}, cases: {}, extras: {}, seeded: false };
}

function iso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function seed(s: Store) {
  const quotes: DeskQuote[] = [
    {
      id: "QTE-00351",
      status: "requested",
      flow: "ms",
      org: "Mhlume Packaging (Pty) Ltd",
      contact: "B. Magagula",
      contact_email: "quality@mhlumepack.co.sz",
      standards: "ISO 9001:2015, ISO 14001:2015",
      scope: "Manufacture of corrugated packaging",
      employees: "140",
      sites: "2",
      requested_at: iso(-7),
    },
    {
      id: "QTE-00352",
      status: "requested",
      flow: "ingelo",
      org: "Lilanga Natural Skincare",
      contact: "L. Hlophe",
      contact_email: "lilanga@example.sz",
      standards: "Ingelo Quality Mark",
      scope: "Marula body butter",
      employees: "4",
      sites: "1",
      requested_at: iso(-2),
    },
    {
      id: "QTE-00342",
      status: "issued",
      flow: "combined",
      org: "Ubombo Honey Co. (Pty) Ltd",
      contact: "S. Nkambule",
      contact_email: "sipho@ubombohoney.co.sz",
      standards: "ISO 22000:2018 + SZNS Product Mark",
      scope: "Processing and bottling of honey",
      requested_at: iso(-8),
      issued_at: iso(-3),
      valid_until: iso(27),
      lines: [
        { label: "Application fee", amount: 2500 },
        { label: "Stage 1 + 2 audit (4 auditor-days)", amount: 26000 },
        { label: "Sampling & laboratory testing", amount: 7800 },
        { label: "Certification & permit fee", amount: 6000 },
      ],
      total: 42300,
    },
  ];
  for (const q of quotes) s.quotes[q.id] = q;
  const findings: DeskFinding[] = [
    {
      id: "NC-0018-1",
      application_id: "CERT-0018",
      org: "Valley Dairy",
      clause: "ISO 22000 §8.5.4",
      severity: "major",
      statement: "CCP monitoring records for pasteuriser temperature were incomplete for 3 days in August.",
      raised_at: iso(-10),
      due: iso(20),
      status: "submitted",
      response: {
        root_cause: "Night-shift operator not trained on the new record sheet.",
        correction: "Records reconstructed from the chart recorder; batch released after review.",
        corrective_action: "Training for all shifts, supervisor sign-off each shift, monthly check by QA.",
        evidence: ["training-register.pdf", "ccp-log-sept.pdf"],
      },
    },
    {
      id: "NC-0018-2",
      application_id: "CERT-0018",
      org: "Valley Dairy",
      clause: "ISO 22000 §7.1.5",
      severity: "minor",
      statement: "Two thermometers used for receiving checks were past calibration due date.",
      raised_at: iso(-10),
      due: iso(20),
      status: "open",
    },
  ];
  for (const f of findings) s.findings[f.id] = f;
  s.lab["LAB-1"] = {
    id: "LAB-1",
    application_id: "CERT-0042",
    sample: "Batch AF-2609",
    field: "Microbiology",
    status: "pass",
    report: "LAB-MB-7712",
    at: iso(-3),
  };
  s.lab["LAB-2"] = {
    id: "LAB-2",
    application_id: "CERT-0042",
    sample: "Batch AF-2609",
    field: "Chemistry",
    status: "in_test",
    at: iso(-3),
  };
  s.cases["APL-0003"] = {
    id: "APL-0003",
    kind: "appeal",
    application_id: "CERT-0007",
    from: "Swazi Crafts",
    text: "We contest the reduced scope decision for the woven baskets line.",
    received_at: iso(-4),
    status: "received",
  };
  s.cases["CMP-0011"] = {
    id: "CMP-0011",
    kind: "complaint",
    from: "Anonymous",
    text: "A trader is using the SZNS mark on uncertified roof tiles in Manzini market.",
    received_at: iso(-1),
    status: "received",
  };
}

function read(): Store {
  let s: Store;
  try {
    const raw = localStorage.getItem(KEY);
    s = raw ? { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) } : emptyStore();
  } catch {
    s = emptyStore();
  }
  if (!s.seeded) {
    if (demoMode()) seed(s);
    s.seeded = true;
    write(s);
  }
  return s;
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* session-only */
  }
}

function update(fn: (s: Store) => void): Store {
  const s = read();
  fn(s);
  write(s);
  return s;
}

function ref(prefix: string): string {
  return `${prefix}-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0")}`;
}

/* ---------------- applications (real) ---------------- */

export async function advanceApplication(id: string, action: CertAction, comment?: string): Promise<void> {
  await apiFetch(`/certification/applications/${encodeURIComponent(id)}/advance`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, action, comment: comment || undefined }),
  });
}

export async function createDeskApplication(v: Record<string, string>): Promise<{ id: string }> {
  const res = await apiFetch<{ id: string }>("/certification/applications", {
    method: "POST",
    body: JSON.stringify({
      scheme: v.scheme,
      applicant_name: v.applicant_name,
      contact_email: v.contact_email || undefined,
      confirm: true,
      applicant_org: v.applicant_org || undefined,
      contact_phone: v.contact_phone || undefined,
      site_address: v.site_address || undefined,
      details: { channel: v.channel, flow: v.flow, received_at: v.received_at, notes: v.notes },
    }),
  });
  update((s) => {
    s.extras[res.id] = {
      ...(s.extras[res.id] ?? { substeps: {} }),
      flow: (v.flow as CertFlow) || undefined,
      channel: v.channel,
    };
  });
  return res;
}

export function getExtras(id: string): AppExtras {
  return read().extras[id] ?? { substeps: {} };
}

export function allExtras(): Record<string, AppExtras> {
  return read().extras;
}

export function setSubstep(id: string, key: string, done: boolean): AppExtras {
  const s = update((st) => {
    const e = st.extras[id] ?? { substeps: {} };
    e.substeps = { ...e.substeps, [key]: done };
    st.extras[id] = e;
  });
  return s.extras[id];
}

export function setFlow(id: string, flow: CertFlow): void {
  update((st) => {
    st.extras[id] = { ...(st.extras[id] ?? { substeps: {} }), flow };
  });
}

/** Assign the lead auditor. Uses PATCH /certification/audits/{id} when an audit exists. */
export async function assignAuditor(appId: string, auditor: string, auditId?: string): Promise<void> {
  if (auditId) {
    await patchAudit(auditId, "assign", { auditor });
  } else {
    requireDemo("Auditor assignment (no audit scheduled yet)");
  }
  // TODO: wire real (application-level auditor assignment; Frappe field assigned_auditor).
  update((st) => {
    st.extras[appId] = { ...(st.extras[appId] ?? { substeps: {} }), auditor };
  });
}

/* ---------------- audits (real) ---------------- */

export async function patchAudit(
  id: string,
  action: "schedule" | "assign" | "complete" | "reschedule" | "submit_outcome",
  payload: Record<string, unknown>,
): Promise<void> {
  await apiFetch(`/certification/audits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": `${id}-${action}-${Date.now()}` },
    body: JSON.stringify({ action, confirm: true, payload }),
  });
}

/* ---------------- certificates (real + local) ---------------- */

export async function revokeCertificate(id: string): Promise<void> {
  await apiFetch(`/certification/certificates/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function renewCertificate(id: string): Promise<void> {
  await apiFetch(`/certification/certificates/${encodeURIComponent(id)}/renew`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function certificatePdf(id: string): Promise<string | null> {
  const res = await apiFetch<{ download_url?: string | null }>(
    `/certification/certificates/${encodeURIComponent(id)}/pdf`,
  );
  return res.download_url ?? null;
}

export async function verifyCertificate(token: string): Promise<{ valid: boolean; subject?: string | null }> {
  return apiFetch(`/verify/${encodeURIComponent(token)}`);
}

/** Suspend / reduce scope / withdraw (CER_PR_026): writes the public register. */
export async function registerAction(
  kind: RegisterKind,
  entry: Omit<RegisterEntry, "id" | "kind" | "since">,
): Promise<RegisterEntry> {
  const full: RegisterEntry = { ...entry, id: ref("REG"), kind, since: new Date().toISOString() };
  try {
    // TODO: wire real (POST /certification/certificates/{id}/suspend | reduce-scope; register feed).
    await apiFetch(`/certification/certificates/${encodeURIComponent(entry.certificate)}/${kind === "reduced" ? "reduce-scope" : kind === "suspended" ? "suspend" : "withdraw"}`, {
      method: "POST",
      body: JSON.stringify({ confirm: true, reason: entry.reason, scope: entry.scope }),
    });
  } catch {
    requireDemo("Register update");
  }
  update((s) => {
    s.register[full.id] = full;
  });
  return full;
}

export function listRegister(): RegisterEntry[] {
  return Object.values(read().register).sort((a, b) => b.since.localeCompare(a.since));
}

export function liftRegisterEntry(id: string): void {
  // TODO: wire real (reinstatement / scope restored).
  requireDemo("Register update");
  update((s) => {
    delete s.register[id];
  });
}

/* ---------------- quotes (local until /certification/quotes) ---------------- */

export async function listDeskQuotes(): Promise<DeskQuote[]> {
  try {
    const res = await apiFetch<{ items: DeskQuote[] }>("/certification/quotes");
    return res.items ?? [];
  } catch {
    return Object.values(read().quotes).sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  }
}

export async function issueQuote(id: string, lines: QuoteLine[], validDays: number, notes: string): Promise<void> {
  const total = lines.reduce((n, l) => n + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  try {
    // TODO: wire real (POST /certification/quotes/{id}/issue).
    await apiFetch(`/certification/quotes/${encodeURIComponent(id)}/issue`, {
      method: "POST",
      body: JSON.stringify({ confirm: true, lines, valid_days: validDays, notes }),
    });
  } catch {
    requireDemo("Quote");
  }
  update((s) => {
    const q = s.quotes[id];
    if (!q) return;
    s.quotes[id] = {
      ...q,
      status: "issued",
      lines,
      total,
      notes,
      issued_at: new Date().toISOString(),
      valid_until: iso(validDays),
    };
  });
}

export function setQuoteStatus(id: string, status: QuoteStatus, applicationId?: string): void {
  requireDemo("Quote status");
  update((s) => {
    const q = s.quotes[id];
    if (q) s.quotes[id] = { ...q, status, application_id: applicationId ?? q.application_id };
  });
}

/* ---------------- findings (Core → Frappe Audit Finding; local store in demo mode only) ---------------- */

export async function listFindings(): Promise<DeskFinding[]> {
  if (demoMode()) return Object.values(read().findings).sort((a, b) => a.due.localeCompare(b.due));
  try {
    const res = await apiFetch<{ items: DeskFinding[] }>("/certification/findings");
    return res.items ?? [];
  } catch {
    return [];
  }
}

export async function raiseFinding(f: Omit<DeskFinding, "id" | "raised_at" | "status">): Promise<DeskFinding> {
  if (demoMode()) {
    const full: DeskFinding = { ...f, id: ref("NC"), raised_at: new Date().toISOString(), status: "open" };
    update((s) => {
      s.findings[full.id] = full;
    });
    return full;
  }
  // Field app raises via PATCH audits submit_outcome (R-C2); desk raises here.
  return apiFetch<DeskFinding>(`/certification/applications/${encodeURIComponent(f.application_id)}/findings`, {
    method: "POST",
    body: JSON.stringify({ ...f, confirm: true }),
  });
}

export async function reviewCorrectiveAction(id: string, accept: boolean, note: string): Promise<void> {
  if (demoMode()) {
    update((s) => {
      const f = s.findings[id];
      if (f) s.findings[id] = { ...f, status: accept ? "accepted" : "rejected", review_note: note };
    });
    return;
  }
  await apiFetch(`/certification/findings/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, accept, note }),
  });
}

/* ---------------- lab results (local) ---------------- */

export function listLab(): LabEntry[] {
  return Object.values(read().lab);
}

export function recordLab(e: Omit<LabEntry, "id" | "at">): LabEntry {
  // TODO: wire real (LIMS results feed from eswasa_metrology / accredited labs).
  requireDemo("Laboratory result");
  const full: LabEntry = { ...e, id: ref("LAB"), at: new Date().toISOString() };
  update((s) => {
    s.lab[full.id] = full;
  });
  return full;
}

/* ---------------- decisions ---------------- */

export function listDecisions(): Record<string, DeskDecision> {
  return read().decisions;
}

/** Records the decision; "granted" also runs the real `certify` transition. */
export async function recordDecision(d: DeskDecision): Promise<void> {
  if (d.outcome === "granted") {
    await advanceApplication(d.application_id, "certify", `${d.body}: ${d.note}`);
  } else {
    requireDemo("Refusal");
  }
  // TODO: wire real (decision record + refusal letter; opens the 90-day appeal window).
  update((s) => {
    s.decisions[d.application_id] = d;
  });
}

/* ---------------- appeals, complaints, notices ---------------- */

export async function listCases(): Promise<DeskCase[]> {
  try {
    const res = await apiFetch<{ items: DeskCase[] }>("/certification/cases");
    return res.items ?? [];
  } catch {
    return Object.values(read().cases).sort((a, b) => b.received_at.localeCompare(a.received_at));
  }
}

export function setCaseStatus(id: string, status: DeskCase["status"]): void {
  // TODO: wire real (PATCH /certification/cases/{id}).
  requireDemo("Case status");
  update((s) => {
    const c = s.cases[id];
    if (c) s.cases[id] = { ...c, status };
  });
}
