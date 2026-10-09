/**
 * Certification store (gap 05) — promotes institution `certification/deskApi.ts` into shared-ui so the
 * Service, Institution and Field portals share one record. Every transition runs through
 * workflow/engine with APP_DEF / REG_DEF / MARK_DEF and syncs Approvals tasks.
 *
 * TODO: wire real — keep the live Core calls where they exist (GET/POST /certification/applications,
 *   POST …/{id}/advance, PATCH /certification/audits/{id}, POST /certification/certificates/{id}/revoke|renew,
 *   GET …/pdf, GET /verify/{token}, GET /certification/findings, POST …/findings/{id}/review) and add:
 *   POST /certification/applications/{id}/act {action, expected_state, reason, payload},
 *   PUT /certification/applications/{id}/documents/{key} (review verdict), POST …/{id}/info-requests,
 *   POST …/{id}/info-requests/{rid}/response (customer), POST …/{id}/quote, POST …/{id}/quote/accept,
 *   POST …/{id}/stages, POST …/{id}/audit-plan/send, POST …/{id}/technical-review, POST …/{id}/decision,
 *   POST /certification/findings/{id}/response (customer), POST /certification/findings/{id}/verify,
 *   GET/POST /certification/register, POST /certification/certificates/{id}/act (suspend | reinstate | withdraw),
 *   POST /certification/certificates/{id}/scope, GET/POST /certification/marks, POST /certification/marks/{id}/act,
 *   GET/PUT /certification/competence, GET/PUT /certification/settings.
 */
import { createInvoice, depositPaid, getInvoice, invoiceFor, invoiceTotals, listInvoices, type Invoice } from "../billing/store";
import { openSystemCase, registerAppealExclusion, registerSignalGenerator, sendNps } from "../crm/store";
import { registerHealthFactor } from "../crm/derive";
import { actOnVisit, listSamples, planVisit, registerSampleParent, registerVisitParent, visitsFor } from "../field/store";
import type { FieldVisit, Sample, VisitType } from "../field/types";
import { testsFor } from "../metrology/store";
import type { TestRequest } from "../metrology/types";
import { notifySafe } from "../notify/store";
import { addGeneratedDoc } from "../record/docs";
import { createLocalStore, isoIn, nowIso } from "../store/localStore";
import { closeRecordTasks, openTask, reconcileTasks, syncRecordTasks, taskStore } from "../tasks/store";
import { allowedActions, applyTransition, SUPER_ROLES } from "../workflow/engine";
import type { ActInput, ActionOption, Actor } from "../workflow/types";
import { APP_DEF, MARK_DEF, REG_DEF } from "./defs";
import { DEFAULT_CERT_SETTINGS, SEED_COMPETENCE, seedApplications, seedCertificates, seedMarks } from "./seed";
import type { AppDoc, AuditReport, CertApplication, CertificateRec, CertSettings, Competence, FeeLine, MarkRequest, Nonconformity, SchemeDef, TechReview } from "./types";

type CertState = {
  v: 1;
  seq: number;
  apps: Record<string, CertApplication>;
  certs: Record<string, CertificateRec>;
  marks: Record<string, MarkRequest>;
  competence: Record<string, Competence>;
  settings: CertSettings;
};

export const certStore = createLocalStore<CertState>({
  key: "eswasaone.certification.v1",
  v: 1,
  seed: () => ({
    v: 1,
    seq: 62,
    apps: Object.fromEntries(seedApplications().map((a) => [a.id, a])),
    certs: Object.fromEntries(seedCertificates().map((c) => [c.id, c])),
    marks: Object.fromEntries(seedMarks().map((m) => [m.id, m])),
    competence: Object.fromEntries(SEED_COMPETENCE.map((c) => [c.name, structuredClone(c)])),
    settings: structuredClone(DEFAULT_CERT_SETTINGS),
  }),
});

const SYSTEM: Actor = { name: "System", roles: ["System Manager"] };
const isSuper = (a: Actor) => a.roles.some((r) => SUPER_ROLES.includes(r));
const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn("[certification]", e);
  }
};

/* ---------------- tasks ---------------- */

const appLink = (id: string) => `/certification/applications/${id}`;
const certLink = (id: string) => `/certification/certificates/${id}`;

function syncApp(a: CertApplication, by?: string, outcome?: string) {
  syncRecordTasks({ def: APP_DEF, rec: a, name: a.id, title: `${a.org} — ${a.standard}`, link: appLink(a.id), module: "Certification", by, outcome, facts: { Organisation: a.org, Scheme: a.standard, Employees: String(a.employees), ...(a.officer ? { Officer: a.officer } : {}) } });
}
function syncCert(c: CertificateRec, by?: string, outcome?: string) {
  syncRecordTasks({ def: REG_DEF, rec: c, name: c.id, title: `${c.org} — ${c.number}`, link: certLink(c.id), module: "Certification", by, outcome, facts: { Holder: c.org, Standard: c.standard, Expires: new Date(c.expires_at).toLocaleDateString() } });
}
function syncMark(m: MarkRequest, by?: string, outcome?: string) {
  syncRecordTasks({ def: MARK_DEF, rec: m, name: m.id, title: `${m.org} — ${m.usage}`, link: "/certification/marks", module: "Certification", by, outcome, facts: { Usage: m.usage, Artwork: m.artwork } });
}

function ncTask(a: CertApplication, n: Nonconformity) {
  const name = `${a.id}:${n.id}`;
  safe(() => {
    if (n.state === "Response submitted")
      openTask({ doctype: "Nonconformity", name, state: n.state, seq: n.rejections + 1, family: "approve", verb: "review", role: "Certification Officer", assignee: a.officer, title: `Review corrective action ${n.id} — ${a.org} (${n.severity})`, module: "Certification", link: appLink(a.id), sla_days: n.severity === "major" ? 3 : 5, rule: "R-C2", facts: { Clause: n.clause, Severity: n.severity, Application: a.id } });
    else if (n.state === "Accepted" && n.severity === "major")
      openTask({ doctype: "Nonconformity", name, state: n.state, seq: n.rejections + 1, family: "do", verb: "task", role: "Certification Auditor", title: `Verify closure of major ${n.id} — ${a.org}`, module: "Certification", link: appLink(a.id), sla_days: 10, rule: "R-C2", facts: { Clause: n.clause } });
    if (n.state === "Raised" || n.state === "Verified closed" || (n.state === "Accepted" && n.severity !== "major"))
      closeRecordTasks("Nonconformity", name, n.state, "System");
    if (n.state === "Accepted" && n.severity !== "major") closeRecordTasks("Nonconformity", name, "Accepted", "System");
  });
}

let reconciled = false;
function reconcile() {
  if (reconciled) return;
  reconciled = true;
  const s = certStore.read();
  reconcileTasks(APP_DEF, Object.values(s.apps).map((a) => ({ rec: a, name: a.id, title: `${a.org} — ${a.standard}`, link: appLink(a.id), module: "Certification" as const })));
  reconcileTasks(REG_DEF, Object.values(s.certs).map((c) => ({ rec: c, name: c.id, title: `${c.org} — ${c.number}`, link: certLink(c.id), module: "Certification" as const })));
  reconcileTasks(MARK_DEF, Object.values(s.marks).map((m) => ({ rec: m, name: m.id, title: `${m.org} — ${m.usage}`, link: "/certification/marks", module: "Certification" as const })));
  const known = Object.keys(taskStore.read().tasks);
  for (const a of Object.values(s.apps)) for (const n of a.findings) if (n.state === "Response submitted" && !known.some((k) => k.startsWith(`Nonconformity|${a.id}:${n.id}|`))) ncTask(a, n);
  runCron();
}

/* ---------------- cron (R-C5, §5.5 chases, expiry) ---------------- */

let cronRan = false;
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function enteredState(a: CertApplication): string {
  return [...a.history].reverse().find((h) => h.to === a.state)?.at ?? a.created_at;
}

export function runCron(): void {
  if (cronRan) return;
  cronRan = true;
  const changed: CertificateRec[] = [];
  const chases: { a: CertApplication; day: number }[] = [];
  certStore.mutate((s) => {
    for (const c of Object.values(s.certs)) {
      if (["Withdrawn", "Expired"].includes(c.state)) continue;
      if (new Date(c.expires_at).getTime() < Date.now()) {
        c.history.push({ at: nowIso(), actor: "System", action: "Expired", from: c.state, to: "Expired" });
        c.state = "Expired";
        c.seq += 1;
        changed.push(c);
        continue;
      }
      const next = c.cycle.find((x) => !x.done_at);
      if (c.state === "Active" && next && new Date(next.due).getTime() - Date.now() < s.settings.surveillance_lead_days * 86_400_000) {
        c.history.push({ at: nowIso(), actor: "System", action: `${next.label} due within ${s.settings.surveillance_lead_days} days`, from: "Active", to: "Surveillance Due", rule: "R-C5" });
        c.state = "Surveillance Due";
        c.seq += 1;
        changed.push(c);
      }
    }
    for (const a of Object.values(s.apps)) {
      if (!["Awaiting Customer", "Quoted"].includes(a.state)) continue;
      const d = daysSince(enteredState(a));
      a.chases ??= [];
      for (const day of [7, 14, 21]) {
        if (d >= day && !a.chases.some((c) => c.day === day)) {
          a.chases.push({ at: nowIso(), day });
          chases.push({ a, day });
        }
      }
    }
  });
  for (const c of changed) syncCert(c, "System");
  for (const { a, day } of chases) {
    if (day < 21) notifySafe({ audience: "customer", to: a.customer_email, kind: "application", ref: a.id, title: `Reminder: we're waiting for you — ${a.id}`, body: a.state === "Quoted" ? "Your certification quote is waiting for acceptance." : "We still need the information we asked for on your certification application.", link: `/certification/${a.id}`, channel: ["email", "portal"] });
    else safe(() => openTask({ doctype: "Certification Application", name: a.id, state: "Stale", seq: a.seq + 100, family: "alert", role: "Certification Officer", assignee: a.officer, title: `Stale: ${a.org} hasn't responded for 21 days`, module: "Certification", link: appLink(a.id), sla_days: 2, facts: { Waiting: a.state } }));
  }
}

/* ---------------- settings, schemes, fees ---------------- */

export function getCertSettings(): CertSettings {
  return certStore.view((s) => s.settings);
}

export async function saveCertSettings(patch: Partial<CertSettings>): Promise<CertSettings> {
  return certStore.mutate((s) => {
    s.settings = { ...s.settings, ...patch };
    return s.settings;
  });
}

export function schemeOf(code: string): SchemeDef | undefined {
  return certStore.read().settings.schemes.find((x) => x.code === code);
}

/** Fee calculator: auditor-days from the employee band (to confirm against the ESWASA fee schedule). */
export function feeCalc(scheme: string, employees: number, sites = 1): { auditor_days: number; lines: FeeLine[] } {
  const s = certStore.read().settings;
  const sc = s.schemes.find((x) => x.code === scheme);
  const band = s.fee_table.find((b) => employees <= b.max) ?? s.fee_table[s.fee_table.length - 1];
  const multi = sites > 1 ? 1 + 0.5 * (sites - 1) : 1;
  const days = Math.ceil(band.days * multi * 2) / 2;
  const lines: FeeLine[] = [{ label: "Application fee", qty: 1, unit_price: s.application_fee }];
  if (sc?.flow === "ingelo") {
    lines.push({ label: "Assessment visit (auditor-days)", qty: 1, unit_price: s.day_rate / 2 });
  } else if (sc?.flow === "product") {
    lines.push({ label: "Factory inspection (auditor-days)", qty: Math.max(1, Math.ceil(days / 2)), unit_price: s.day_rate }, { label: "Sampling & laboratory testing", qty: 1, unit_price: s.lab_fee });
  } else {
    const s1 = Math.max(1, Math.round(days * 0.3 * 2) / 2);
    lines.push({ label: "Stage 1 audit (auditor-days)", qty: s1, unit_price: s.day_rate }, { label: "Stage 2 audit (auditor-days)", qty: days - s1, unit_price: s.day_rate });
    if (sc?.flow === "combined") lines.push({ label: "Sampling & laboratory testing", qty: 1, unit_price: s.lab_fee });
  }
  lines.push({ label: sc?.flow === "ms" ? "Certificate fee" : "Permit / mark fee (year 1)", qty: 1, unit_price: s.certificate_fee });
  return { auditor_days: days, lines };
}

export const linesTotal = (lines: FeeLine[]) => lines.reduce((n, l) => n + l.qty * l.unit_price, 0);

/* ---------------- reads ---------------- */

export type AppFilter = { state?: string; officer?: string; flow?: string; scheme?: string; email?: string; q?: string };

export function listApplications(f: AppFilter = {}): CertApplication[] {
  certStore.guard("Certification applications");
  reconcile();
  const email = f.email?.toLowerCase();
  const q = f.q?.trim().toLowerCase();
  return certStore.view((s) =>
    Object.values(s.apps)
      .filter((a) => !f.state || a.state === f.state)
      .filter((a) => !f.officer || a.officer === f.officer)
      .filter((a) => !f.flow || a.flow === f.flow)
      .filter((a) => !f.scheme || a.scheme === f.scheme)
      .filter((a) => !email || a.customer_email === "demo" || a.customer_email.toLowerCase() === email)
      .filter((a) => !q || `${a.id} ${a.org} ${a.standard} ${a.scope}`.toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}

export type AppBundle = {
  app: CertApplication;
  scheme: SchemeDef | undefined;
  visits: FieldVisit[];
  samples: Sample[];
  tests: TestRequest[];
  invoice: Invoice | null;
  certificate: CertificateRec | null;
  settings: CertSettings;
};

const tryOr = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function getApplication(id: string): AppBundle | null {
  certStore.guard("Certification application");
  reconcile();
  const a = certStore.view((s) => s.apps[id] ?? null);
  if (!a) return null;
  const s = certStore.read();
  return {
    app: a,
    scheme: s.settings.schemes.find((x) => x.code === a.scheme),
    visits: tryOr(() => visitsFor(a.id), []),
    samples: tryOr(() => listSamples({ parent: a.id }), []),
    tests: tryOr(() => testsFor(a.id), []),
    invoice: a.quote?.invoice_id ? tryOr(() => getInvoice(a.quote!.invoice_id!), null) : null,
    certificate: a.certificate_id ? structuredClone(s.certs[a.certificate_id] ?? null) : null,
    settings: structuredClone(s.settings),
  };
}

export function peekApplication(id: string): CertApplication | null {
  return certStore.view((s) => s.apps[id] ?? null);
}

/** Why the product branch blocks the decision (05 C9): results missing, not approved or failed. */
export function labBlock(a: CertApplication): string | null {
  if (a.flow !== "product" && a.flow !== "combined") return null;
  const tests = tryOr(() => testsFor(a.id), []);
  const samples = tryOr(() => listSamples({ parent: a.id }), []);
  if (!samples.length && !tests.length) return "Product scheme: no samples taken yet — sample at the factory inspection.";
  if (samples.some((x) => x.result === "fail") || tests.some((t) => t.state === "Approved" && t.conclusion === "fail")) return "A sample failed laboratory testing (R-V4) — the file can't be certified.";
  const pending = tests.filter((t) => t.state !== "Approved" && t.state !== "Cancelled");
  if (pending.length || samples.some((x) => x.state !== "Result" && x.state !== "Rejected")) return `Waiting for approved lab results (${pending.map((t) => t.id).join(", ") || "samples in custody"}).`;
  return null;
}

function openNcs(a: CertApplication) {
  return a.findings.filter((n) => n.severity !== "observation" && !(n.state === "Verified closed" || (n.state === "Accepted" && n.severity === "minor")));
}

export function appActions(id: string, actor: Actor): ActionOption[] {
  const a = certStore.read().apps[id];
  if (!a) return [];
  const visits = tryOr(() => visitsFor(a.id), []);
  return allowedActions(APP_DEF, a, actor).map((x) => {
    let why = x.disabledReason;
    if (x.action === "issue_quote") {
      const bad = a.documents.filter((d) => d.required && d.status !== "acceptable");
      if (bad.length) why ??= `${bad.length} required document(s) not yet acceptable: ${bad.map((d) => d.label).join(", ")}.`;
    }
    if (x.action === "start_audit" && !visits.some((v) => ["Confirmed", "In Progress", "Submitted", "Closed"].includes(v.state))) why ??= "No audit visit is confirmed yet — plan a stage and assign the team.";
    if (x.action === "to_nc_resolution" && !openNcs(a).length) why ??= "There are no open findings.";
    if (x.action === "to_technical_review") {
      const open = openNcs(a);
      if (open.length) why ??= `${open.length} finding(s) still open (${open.map((n) => n.id).join(", ")}).`;
      const notClosed = visits.filter((v) => !["Closed", "Cancelled"].includes(v.state));
      if (notClosed.length) why ??= `Visit report(s) not closed yet: ${notClosed.map((v) => v.id).join(", ")}.`;
      if (!visits.some((v) => v.state === "Closed") && !a.stages.length) why ??= "No audit has been carried out.";
      why ??= labBlock(a) ?? undefined;
    }
    if (["grant", "grant_conditions"].includes(x.action)) {
      why ??= labBlock(a) ?? undefined;
      const sc = schemeOf(a.scheme);
      if (sc?.cac && !actor.roles.includes("Eswasa CAC Member") && !actor.roles.includes("Certification Manager") && !isSuper(actor)) why ??= "This scheme is decided by the Certification Approval Committee.";
    }
    return { ...x, disabledReason: why };
  });
}

/* ---------------- workflow core ---------------- */

function act(id: string, action: string, actor: Actor, input: ActInput, side?: (a: CertApplication, s: CertState) => void): CertApplication {
  certStore.guard("Certification");
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    applyTransition(APP_DEF, a, action, actor, input);
    side?.(a, s);
    return a;
  });
  syncApp(a, actor.name, action);
  return a;
}

/** System move (visit closed, sample result): bypasses roles but keeps history, seq and tasks. */
function systemMove(id: string, to: CertApplication["state"], action: string, note?: string, rule?: string) {
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a || a.state === to) return null;
    a.history.push({ at: nowIso(), actor: "System", action, from: a.state, to, note, rule });
    a.state = to;
    a.seq += 1;
    return a;
  });
  if (a) syncApp(a, "System", action);
  return a;
}

function notifyApp(a: CertApplication, title: string, body: string, kind: "application" | "quote" | "audit" | "certificate" = "application") {
  notifySafe({ audience: "customer", to: a.customer_email, kind, ref: a.id, title, body, link: `/certification/${a.id}`, channel: ["email", "portal"] });
}

export async function actOnApplication(id: string, action: string, actor: Actor, input: ActInput): Promise<CertApplication> {
  const block = appActions(id, actor).find((x) => x.action === action)?.disabledReason;
  if (block) throw new Error(block);
  if (["grant", "grant_conditions", "refuse"].includes(action)) return decide(id, action as "grant" | "grant_conditions" | "refuse", input, actor);
  if (action === "request_info") return requestInfo(id, [], input.reason ?? "", actor, input.expected_state);
  const a = act(id, action, actor, input, (app, s) => {
    if (action === "start_review") app.officer = actor.name;
    if (action === "withdraw" || action === "customer_withdraw") {
      for (const v of tryOr(() => visitsFor(app.id), [])) if (!["Closed", "Cancelled", "Submitted", "In Progress"].includes(v.state)) safe(() => void actOnVisit(v.id, "cancel", SYSTEM, { expected_state: v.state, reason: `Application withdrawn: ${input.reason}` }));
    }
    void s;
  });
  if (action === "withdraw") notifyApp(a, `Application ${a.id} withdrawn`, input.reason ?? "");
  return a;
}

/* ---------------- intake ---------------- */

export type NewApplicationInput = {
  scheme: string;
  org: string;
  client_id?: string;
  contact: string;
  customer_email: string;
  phone?: string;
  employees: number;
  sites: CertApplication["sites"];
  scope: string;
  channel: CertApplication["channel"];
  uploaded?: string[];
  renewal_of?: string;
  transfer_from?: CertApplication["transfer_from"];
};

export function createApplication(input: NewApplicationInput, who: string): CertApplication {
  certStore.guard("Certification application");
  const sc = schemeOf(input.scheme);
  if (!sc) throw new Error("Choose a certification scheme.");
  if (!input.org.trim() || !input.scope.trim()) throw new Error("Organisation and scope are required.");
  const a = certStore.mutate((s) => {
    s.seq += 1;
    const id = `CERT-APP-26-${String(s.seq).padStart(4, "0")}`;
    const documents: AppDoc[] = sc.required_docs.map((d) => {
      const up = input.uploaded?.includes(d.key);
      return { key: d.key, label: d.label, required: true, status: up ? "received" : "missing", versions: up ? [{ name: `${d.key}.pdf`, at: nowIso(), by: who }] : [] };
    });
    const a: CertApplication = {
      ...input,
      id,
      state: "Submitted",
      seq: 1,
      flow: sc.flow,
      standard: sc.standard,
      created_at: nowIso(),
      documents,
      info_requests: [],
      stages: [],
      findings: [],
      sample_ids: [],
      history: [{ at: nowIso(), actor: input.channel === "desk" ? who : `${who} (customer)`, action: input.renewal_of ? `Recertification requested for ${input.renewal_of}` : input.transfer_from ? `Transfer requested from ${input.transfer_from.body}` : "Submitted application", to: "Submitted" }],
    };
    s.apps[id] = a;
    return a;
  });
  syncApp(a, who);
  notifyApp(a, "Application received", `We've received your ${a.standard} application (${a.id}). A certification officer will review your documents within ${getCertSettings().sla_document_review} working days.`);
  return a;
}

/* ---------------- document review & info requests (C3, C6) ---------------- */

export function setDocStatus(id: string, key: string, status: AppDoc["status"], comment: string, actor: Actor): CertApplication {
  return certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    if (!["Document Review", "Submitted"].includes(a.state)) throw new Error("Documents can only be reviewed during document review.");
    const d = a.documents.find((x) => x.key === key);
    if (!d) throw new Error("Unknown document.");
    if (status === "rejected" && !comment.trim()) throw new Error("Say why the document isn't acceptable — the customer sees it.");
    const from = d.status;
    d.status = status;
    d.comment = comment || undefined;
    a.history.push({ at: nowIso(), actor: actor.name, action: `Document ${d.label}: ${status}`, changes: [{ field: d.label, from, to: status }], note: comment || undefined });
    return a;
  });
}

export function addDocument(id: string, label: string, actor: Actor): CertApplication {
  return certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    a.documents.push({ key: `extra_${a.documents.length + 1}`, label, required: true, status: "missing", versions: [] });
    a.history.push({ at: nowIso(), actor: actor.name, action: `Added required document: ${label}` });
    return a;
  });
}

/** Builds the customer message from the missing / rejected items (C6 "Request info" composer). */
export function infoRequestDraft(a: CertApplication): { items: { key: string; label: string; note?: string }[]; message: string } {
  const items = a.documents.filter((d) => d.required && d.status !== "acceptable" && d.status !== "received").map((d) => ({ key: d.key, label: d.label, note: d.comment }));
  const list = items.map((i) => `• ${i.label}${i.note ? ` — ${i.note}` : ""}`).join("\n");
  return { items, message: `Dear ${a.contact},\n\nThank you for your ${a.standard} application (${a.id}). Before we can prepare your quote we need:\n\n${list || "• (nothing selected)"}\n\nPlease upload them from your application page. The review clock is paused until we hear from you.\n\nESWASA Certification` };
}

export async function requestInfo(id: string, items: { key: string; label: string; note?: string }[], message: string, actor: Actor, expected?: string): Promise<CertApplication> {
  if (!message.trim()) throw new Error("Write the message to the customer.");
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  const list = items.length ? items : infoRequestDraft(cur).items;
  const a = act(id, "request_info", actor, { expected_state: expected ?? cur.state, reason: message }, (app) => {
    app.info_requests.push({ id: `IR-${app.info_requests.length + 1}`, at: nowIso(), by: actor.name, items: list, message, due: isoIn(14) });
    for (const it of list) {
      const d = app.documents.find((x) => x.key === it.key);
      if (d && d.status === "missing") d.comment = it.note ?? d.comment;
    }
    app.chases = [];
  });
  notifyApp(a, `Action needed on ${a.id}`, `We need ${list.length} item(s) to continue: ${list.map((i) => i.label).join(", ")}.`);
  return a;
}

/** Customer uploads one requested item (Service "Action needed" card). */
export function customerUploadDoc(id: string, key: string, fileName: string, who: string): CertApplication {
  certStore.guard("Upload");
  return certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    if (!["Awaiting Customer", "Submitted", "Document Review"].includes(a.state)) throw new Error("This application isn't waiting for documents.");
    const d = a.documents.find((x) => x.key === key);
    if (!d) throw new Error("Unknown document.");
    d.versions.push({ name: fileName, at: nowIso(), by: who });
    d.status = "received";
    a.history.push({ at: nowIso(), actor: `${who} (customer)`, action: `Uploaded ${d.label}`, note: fileName });
    return a;
  });
}

export async function customerRespondInfo(id: string, response: string, who: string): Promise<CertApplication> {
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  const ir = cur.info_requests[cur.info_requests.length - 1];
  const missing = ir?.items.filter((it) => cur.documents.find((d) => d.key === it.key)?.status !== "received" && cur.documents.find((d) => d.key === it.key)?.status !== "acceptable") ?? [];
  if (missing.length && !response.trim()) throw new Error(`Upload ${missing.map((m) => m.label).join(", ")} or explain in your reply.`);
  const a = act(id, "customer_respond", { name: `${who} (customer)`, roles: ["Customer"] }, { expected_state: cur.state, note: response }, (app) => {
    const last = app.info_requests[app.info_requests.length - 1];
    if (last) {
      last.responded_at = nowIso();
      last.response = response || "Documents uploaded.";
    }
  });
  if (a.officer) notifySafe({ audience: "staff", to: a.officer, kind: "application", ref: a.id, title: `${a.org} responded`, body: response || "Documents uploaded.", link: appLink(a.id) });
  return a;
}

/* ---------------- quote, agreement, deposit (C11) ---------------- */

export async function issueQuote(id: string, lines: FeeLine[], auditorDays: number, actor: Actor): Promise<CertApplication> {
  if (!lines.length || lines.some((l) => !l.label.trim() || l.qty <= 0 || l.unit_price < 0)) throw new Error("Every fee line needs a label, quantity and price.");
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  const block = appActions(id, actor).find((x) => x.action === "issue_quote")?.disabledReason;
  if (block) throw new Error(block);
  const st = certStore.read().settings;
  const a = act(id, "issue_quote", actor, { expected_state: cur.state }, (app, s) => {
    s.seq += 1;
    app.quote = { id: `CQ-26-${String(s.seq).padStart(4, "0")}`, lines, auditor_days: auditorDays, valid_until: isoIn(st.quote_valid_days), issued_at: nowIso(), issued_by: actor.name, deposit_pct: st.deposit_pct };
  });
  notifyApp(a, "Your certification quote is ready", `Quote ${a.quote!.id}: E ${(linesTotal(lines) * 1.15).toFixed(2)} incl. VAT. Accept the agreement and pay the ${a.quote!.deposit_pct}% deposit online to book your audit.`, "quote");
  return a;
}

/** Customer e-acceptance; creates the invoice with the deposit that unlocks audit planning. */
export function customerAcceptQuote(id: string, agreement: { name: string; title: string }, who: string): { app: CertApplication; invoice: Invoice } {
  certStore.guard("Quote acceptance");
  if (!agreement.name.trim() || !agreement.title.trim()) throw new Error("Type your full name and position to sign the agreement.");
  const cur = certStore.read().apps[id];
  if (!cur?.quote) throw new Error("No quote to accept.");
  if (cur.state !== "Quoted") throw new Error("This quote is no longer open.");
  if (new Date(cur.quote.valid_until).getTime() < Date.now()) throw new Error("This quote has expired — ask ESWASA for a new one.");
  let inv = cur.quote.invoice_id ? getInvoice(cur.quote.invoice_id) : null;
  if (!inv) {
    const totals = invoiceTotals({ lines: cur.quote.lines.map((l) => ({ label: l.label, qty: l.qty, unit_price: l.unit_price })), vat_rate: 0.15, payments: [] });
    inv = createInvoice({ source: "certification", ref: id, title: `${cur.standard} certification — ${cur.org}`, customer: cur.org, customer_email: cur.customer_email, client_id: cur.client_id, lines: cur.quote.lines, due_at: isoIn(30), deposit: Math.round(totals.total * (cur.quote.deposit_pct / 100) * 100) / 100 });
  }
  const app = certStore.mutate((s) => {
    const a = s.apps[id];
    a.quote!.accepted_at = nowIso();
    a.quote!.agreement = { ...agreement, at: nowIso() };
    a.quote!.invoice_id = inv!.id;
    a.history.push({ at: nowIso(), actor: `${who} (customer)`, action: "Signed the certification agreement", note: `${agreement.name}, ${agreement.title}` });
    return a;
  });
  return { app, invoice: inv };
}

/** After checkout: moves to Audit Planned once the deposit is paid (R-E/R-F). */
export async function confirmDeposit(id: string, who: string): Promise<CertApplication> {
  const cur = certStore.read().apps[id];
  if (!cur?.quote?.invoice_id) throw new Error("Accept the quote first.");
  const inv = getInvoice(cur.quote.invoice_id);
  if (!depositPaid(inv)) throw new Error("The deposit hasn't been received yet.");
  if (cur.state !== "Quoted") return cur;
  const a = act(id, "customer_accept", { name: `${who} (customer)`, roles: ["Customer"] }, { expected_state: "Quoted", note: `Deposit paid on ${inv!.id}` });
  notifyApp(a, "Deposit received — we're planning your audit", "Thank you. The scheme manager will propose audit dates and the audit team; you'll confirm the date from your account.", "audit");
  return a;
}

export async function customerDeclineQuote(id: string, reason: string, who: string): Promise<CertApplication> {
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  return act(id, "customer_withdraw", { name: `${who} (customer)`, roles: ["Customer"] }, { expected_state: cur.state, reason }, (a) => {
    if (a.quote) a.quote.declined = { at: nowIso(), reason };
  });
}

export function customerWithdraw(id: string, reason: string, who: string): CertApplication {
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  return act(id, "customer_withdraw", { name: `${who} (customer)`, roles: ["Customer"] }, { expected_state: cur.state, reason });
}

/* ---------------- audit planning (C7) ---------------- */

export function addStage(id: string, stage: { label: string; date: string; days: number }, actor: Actor): CertApplication {
  if (!stage.label.trim() || !stage.date) throw new Error("Give the stage a name and a date.");
  return certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    a.stages.push({ id: `S${a.stages.length + 1}`, label: stage.label, date: new Date(stage.date).toISOString(), days: stage.days });
    a.history.push({ at: nowIso(), actor: actor.name, action: `Added ${stage.label} (${stage.days} auditor-days)` });
    return a;
  });
}

const VISIT_FOR_FLOW: Record<CertApplication["flow"], VisitType> = { ms: "cert_audit", combined: "cert_audit", product: "factory_inspection", ingelo: "factory_inspection" };

export function planStageVisit(id: string, stageId: string, actor: Actor): FieldVisit {
  const a = certStore.read().apps[id];
  if (!a) throw new Error("Application not found.");
  const st = a.stages.find((x) => x.id === stageId);
  if (!st) throw new Error("Stage not found.");
  if (st.visit_id) throw new Error("This stage already has a visit.");
  const v = planVisit(
    {
      type: VISIT_FOR_FLOW[a.flow],
      title: `${st.label} — ${a.org} (${a.standard})`,
      parent: { doctype: "Certification Application", name: a.id, label: a.id, link: appLink(a.id) },
      client: a.org,
      client_email: a.customer_email,
      site: { name: a.sites[0]?.name ?? a.org, address: a.sites[0]?.address ?? "", contact: a.contact, phone: a.phone },
      planned_date: st.date,
      duration_days: Math.max(1, Math.ceil(st.days / 2)),
      auditor_days: st.days,
      scope: a.scope,
    },
    actor,
  );
  certStore.mutate((s) => {
    const app = s.apps[id];
    const stage = app.stages.find((x) => x.id === stageId)!;
    stage.visit_id = v.id;
    app.history.push({ at: nowIso(), actor: actor.name, action: `Planned visit ${v.id} for ${stage.label}` });
  });
  return v;
}

export function sendAuditPlan(id: string, actor: Actor): CertApplication {
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    if (!a.stages.length) throw new Error("Add at least one audit stage first.");
    a.plan_sent_at = nowIso();
    a.history.push({ at: nowIso(), actor: actor.name, action: "Sent the audit plan to the client" });
    return a;
  });
  safe(() => addGeneratedDoc("Certification Application", id, { family: `${id}-audit-plan`, name: `Audit plan ${id}.pdf`, category: "Audit plan", uploaded_by: actor.name, size: 96_000, gate: false }));
  notifyApp(a, "Your audit plan", `The audit plan for ${a.standard} is ready: ${a.stages.map((x) => `${x.label} on ${new Date(x.date).toLocaleDateString()} (${x.days} auditor-days)`).join("; ")}. Please confirm each visit date from your account.`, "audit");
  return a;
}

/** Competence, impartiality and rotation for one person on one client (§5.6; C7, C8). */
export function competenceProblem(name: string, scheme: string, org: string, at = new Date()): string | null {
  const s = certStore.read();
  const c = s.competence[name];
  if (!c) return "No competence record";
  if (!c.schemes.includes(scheme)) return `Not qualified for ${schemeOf(scheme)?.standard ?? scheme}`;
  if (new Date(c.qualified_until) < at) return "Qualification expired";
  if (!c.declaration_until || new Date(c.declaration_until) < at) return "No current impartiality declaration on file";
  const rel = c.relationships.find((r) => r.org === org && daysSince(r.until) < 730);
  if (rel) return `Impartiality: ${rel.kind} (within 2 years)`;
  const cyc = c.cycles.find((x) => x.org === org);
  if (cyc && cyc.count >= s.settings.rotation_cycles) return `Rotation: has led ${cyc.count} cycles here (max ${s.settings.rotation_cycles})`;
  return null;
}

/* ---------------- findings / NCs (R-C2) ---------------- */

export function raiseNc(id: string, n: Pick<Nonconformity, "clause" | "severity" | "statement">, actor: Actor): CertApplication {
  if (!n.statement.trim() || !n.clause.trim()) throw new Error("Clause and statement are required.");
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    if (!a) throw new Error("Application not found.");
    a.findings.push({ ...n, id: `NC-${a.findings.length + 1}`, raised_at: nowIso(), raised_by: actor.name, due: isoIn(s.settings.nc_days), state: "Raised", rejections: 0 });
    a.duties = { ...(a.duties ?? {}), "Raised finding": [...new Set([...(a.duties?.["Raised finding"] ?? []), actor.name])] };
    a.history.push({ at: nowIso(), actor: actor.name, action: `Raised ${n.severity} ${n.clause}`, rule: "R-C2" });
    return a;
  });
  notifyApp(a, "New finding raised", `A ${n.severity} nonconformity (${n.clause}) was raised. Respond with root cause, correction and corrective action within ${getCertSettings().nc_days} days.`, "audit");
  return a;
}

export function customerRespondNc(id: string, ncId: string, r: { root_cause: string; correction: string; corrective_action: string; evidence: string[] }, who: string): CertApplication {
  certStore.guard("NC response");
  if (!r.root_cause.trim() || !r.correction.trim() || !r.corrective_action.trim()) throw new Error("Root cause, correction and corrective action are all required.");
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    const n = a?.findings.find((x) => x.id === ncId);
    if (!a || !n) throw new Error("Finding not found.");
    if (n.state !== "Raised") throw new Error("This finding isn't waiting for your response.");
    n.response = { ...r, at: nowIso(), by: who };
    n.state = "Response submitted";
    a.history.push({ at: nowIso(), actor: `${who} (customer)`, action: `Responded to ${n.id}` });
    return a;
  });
  ncTask(a, a.findings.find((x) => x.id === ncId)!);
  return a;
}

export function reviewNc(id: string, ncId: string, accept: boolean, note: string, actor: Actor): CertApplication {
  if (!accept && !note.trim()) throw new Error("Say why the response isn't acceptable — the customer sees it.");
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    const n = a?.findings.find((x) => x.id === ncId);
    if (!a || !n) throw new Error("Finding not found.");
    if (n.state !== "Response submitted") throw new Error("There's no response to review.");
    n.review = { by: actor.name, at: nowIso(), accepted: accept, note };
    if (accept) n.state = n.severity === "major" ? "Accepted" : "Verified closed";
    else {
      n.state = "Raised";
      n.rejections += 1;
    }
    if (accept && n.severity !== "major") n.verified = { by: actor.name, at: nowIso(), note: "Minor — closed on acceptance of the response" };
    a.history.push({ at: nowIso(), actor: actor.name, action: `${accept ? "Accepted" : "Rejected"} response to ${n.id}`, reason: accept ? undefined : note, note: accept ? note : undefined, rule: "R-C2" });
    return a;
  });
  const n = a.findings.find((x) => x.id === ncId)!;
  ncTask(a, n);
  notifyApp(a, accept ? `Response to ${n.id} accepted` : `Response to ${n.id} needs more work`, accept ? "Thank you — your corrective action was accepted." : note, "audit");
  return a;
}

export function verifyNc(id: string, ncId: string, note: string, actor: Actor): CertApplication {
  const a = certStore.mutate((s) => {
    const a = s.apps[id];
    const n = a?.findings.find((x) => x.id === ncId);
    if (!a || !n) throw new Error("Finding not found.");
    if (n.state !== "Accepted") throw new Error("Only accepted responses can be verified closed.");
    n.state = "Verified closed";
    n.verified = { by: actor.name, at: nowIso(), note };
    a.history.push({ at: nowIso(), actor: actor.name, action: `Verified ${n.id} closed`, note });
    return a;
  });
  ncTask(a, a.findings.find((x) => x.id === ncId)!);
  return a;
}

export function ncOverdue(n: Nonconformity): boolean {
  return n.state === "Raised" && new Date(n.due).getTime() < Date.now();
}

export function listAllFindings(): { app: CertApplication; nc: Nonconformity }[] {
  certStore.guard("Findings");
  reconcile();
  return certStore.view((s) => Object.values(s.apps).flatMap((app) => app.findings.map((nc) => ({ app, nc }))));
}

/* ---------------- technical review & decision (C10, C14) ---------------- */

export async function completeTechnicalReview(id: string, tr: Omit<TechReview, "by" | "at">, actor: Actor): Promise<CertApplication> {
  if (!tr.justification.trim()) throw new Error("Write the justification for your recommendation.");
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  if (tr.recommendation === "grant" && tr.checklist.some((c) => !c.ok)) throw new Error("You can't recommend grant with unticked review points — choose 'more information' or 'refuse'.");
  if (tr.recommendation === "more_info") return act(id, "review_more_info", actor, { expected_state: cur.state, reason: tr.justification }, (a) => (a.technical_review = { ...tr, by: actor.name, at: nowIso() }));
  return act(id, "complete_review", actor, { expected_state: cur.state, note: `Recommend ${tr.recommendation}: ${tr.justification}` }, (a) => (a.technical_review = { ...tr, by: actor.name, at: nowIso() }));
}

export async function decide(id: string, outcome: "grant" | "grant_conditions" | "refuse", input: ActInput, actor: Actor): Promise<CertApplication> {
  const cur = certStore.read().apps[id];
  if (!cur) throw new Error("Application not found.");
  const block = appActions(id, actor).find((x) => x.action === outcome)?.disabledReason;
  if (block) throw new Error(block);
  const sc = schemeOf(cur.scheme);
  const st = getCertSettings();
  let cert: CertificateRec | null = null;
  const a = act(id, outcome, actor, input, (app, s) => {
    app.decision = {
      by: actor.name,
      at: nowIso(),
      outcome,
      body: sc?.cac ? "Certification Approval Committee" : "Certification Manager",
      note: input.reason ?? input.note ?? "",
      conditions: outcome === "grant_conditions" ? input.note : undefined,
      appeal_until: outcome === "refuse" ? isoIn(st.appeal_days) : undefined,
    };
    if (outcome !== "refuse") {
      s.seq += 1;
      const n = String(s.seq).padStart(4, "0");
      const code = (sc?.standard ?? "CERT").replace(/[^A-Z0-9]/gi, "").slice(0, 9).toUpperCase();
      const issued = nowIso();
      cert = {
        id: `CRT-26-${n}`,
        number: `ESWASA-${code}-2026-${n.padStart(5, "0")}`,
        state: "Active",
        seq: 1,
        application_id: app.id,
        org: app.org,
        client_id: app.client_id,
        customer_email: app.customer_email,
        scheme: app.scheme,
        standard: app.standard,
        scope: app.scope,
        sites: app.sites.map((x) => `${x.name}${x.address ? `, ${x.address}` : ""}`),
        conditions: outcome === "grant_conditions" ? input.note : undefined,
        issued_at: issued,
        expires_at: isoIn(1095),
        cycle: [
          { id: "SV1", label: "Surveillance audit 1", due: isoIn(365) },
          { id: "SV2", label: "Surveillance audit 2", due: isoIn(730) },
          { id: "RC", label: "Recertification audit", due: isoIn(1035) },
        ],
        token: `crt-26-${n}-${Math.random().toString(16).slice(2, 6)}`,
        scope_history: [],
        history: [{ at: issued, actor: actor.name, action: "Issued", to: "Active", rule: "R-C3" }],
      };
      s.certs[cert.id] = cert;
      app.certificate_id = cert.id;
    }
  });
  if (cert) {
    const c = cert as CertificateRec;
    safe(() => addGeneratedDoc("Certification Application", id, { family: `${id}-certificate`, name: `${c.number}.pdf`, category: "Certificate", uploaded_by: actor.name, size: 140_000, gate: true }));
    safe(() => {
      if (!invoiceFor(`${c.id}-fee`)) createInvoice({ source: "certification", ref: `${c.id}-fee`, title: `Certificate fee — ${c.number}`, customer: a.org, customer_email: a.customer_email, client_id: a.client_id, lines: [{ label: "Certificate / permit fee", qty: 1, unit_price: st.certificate_fee }], due_at: isoIn(30) });
    });
    syncCert(c, actor.name);
    safe(() => sendNps({ trigger: "certificate_issued", ref: c.number, email: a.customer_email, name: a.contact, client_id: a.client_id }));
    notifyApp(a, "Certificate issued", `Congratulations — ${a.org} is certified to ${a.standard}. Download certificate ${c.number} and the mark files from your account.`, "certificate");
  } else {
    safe(() => addGeneratedDoc("Certification Application", id, { family: `${id}-refusal`, name: `Refusal letter ${id}.pdf`, category: "Decision", uploaded_by: actor.name, size: 60_000, gate: true }));
    notifyApp(a, "Certification decision", `We're unable to grant certification for ${a.standard}. Reason: ${input.reason}. You may appeal within ${st.appeal_days} days from your account (Complaints → Appeal).`, "certificate");
  }
  return a;
}

/* ---------------- register (C12, C13) ---------------- */

export function listCertificates(f: { state?: string; email?: string; q?: string } = {}): CertificateRec[] {
  certStore.guard("Certificates");
  reconcile();
  const email = f.email?.toLowerCase();
  const q = f.q?.trim().toLowerCase();
  return certStore.view((s) =>
    Object.values(s.certs)
      .filter((c) => !f.state || c.state === f.state)
      .filter((c) => !email || c.customer_email === "demo" || c.customer_email.toLowerCase() === email)
      .filter((c) => !q || `${c.number} ${c.org} ${c.standard}`.toLowerCase().includes(q))
      .sort((a, b) => a.org.localeCompare(b.org)),
  );
}

export function getCertificate(id: string): { cert: CertificateRec; app: CertApplication | null; visits: FieldVisit[]; marks: MarkRequest[] } | null {
  certStore.guard("Certificate");
  reconcile();
  return certStore.view((s) => {
    const cert = s.certs[id] ?? Object.values(s.certs).find((c) => c.number === id || c.token === id);
    if (!cert) return null;
    return { cert, app: s.apps[cert.application_id] ?? null, visits: tryOr(() => visitsFor(cert.id), []), marks: Object.values(s.marks).filter((m) => m.certificate_id === cert.id) };
  });
}

export function certActions(id: string, actor: Actor): ActionOption[] {
  const c = certStore.read().certs[id];
  return c ? allowedActions(REG_DEF, c, actor) : [];
}

export async function actOnCertificate(id: string, action: string, actor: Actor, input: ActInput): Promise<CertificateRec> {
  certStore.guard("Certificate");
  const c = certStore.mutate((s) => {
    const c = s.certs[id];
    if (!c) throw new Error("Certificate not found.");
    applyTransition(REG_DEF, c, action, actor, input);
    if (action === "surveillance_done") {
      const next = c.cycle.find((x) => !x.done_at);
      if (next) next.done_at = nowIso();
    }
    return c;
  });
  syncCert(c, actor.name, action);
  const words: Record<string, string> = { suspend: "suspended", reinstate: "reinstated", withdraw: "withdrawn" };
  if (words[action]) notifySafe({ audience: "customer", to: c.customer_email, kind: "certificate", ref: c.id, title: `Certificate ${c.number} ${words[action]}`, body: `${input.reason ?? input.note ?? ""}${action === "suspend" ? " You must stop using the certification mark until it's reinstated. You may appeal within 90 days." : ""}`.trim(), link: `/account/certificates/${c.id}`, channel: ["email", "sms", "portal"] });
  return c;
}

export function reduceScope(id: string, scope: string, reason: string, actor: Actor): CertificateRec {
  if (!scope.trim() || !reason.trim()) throw new Error("New scope and a reason are required.");
  const c = certStore.mutate((s) => {
    const c = s.certs[id];
    if (!c) throw new Error("Certificate not found.");
    c.scope_history.push({ at: nowIso(), by: actor.name, from: c.scope, to: scope, reason });
    c.history.push({ at: nowIso(), actor: actor.name, action: "Reduced scope", reason, changes: [{ field: "Scope", from: c.scope, to: scope }], rule: "R-C6" });
    c.scope = scope;
    return c;
  });
  notifySafe({ audience: "customer", to: c.customer_email, kind: "certificate", ref: c.id, title: `Scope of ${c.number} reduced`, body: `New scope: ${scope}. Reason: ${reason}`, link: `/account/certificates/${c.id}` });
  return c;
}

export function planSurveillance(certId: string, cycleId: string, date: string, actor: Actor): FieldVisit {
  const c = certStore.read().certs[certId];
  if (!c) throw new Error("Certificate not found.");
  const item = c.cycle.find((x) => x.id === cycleId);
  if (!item) throw new Error("Cycle item not found.");
  if (item.visit_id) throw new Error("A visit is already planned for this.");
  const v = planVisit({ type: c.scheme === "product" || c.scheme === "ingelo" ? "factory_inspection" : "cert_audit", title: `${item.label} — ${c.org} (${c.standard})`, parent: { doctype: "Certification", name: c.id, label: c.number, link: certLink(c.id) }, client: c.org, client_email: c.customer_email, site: { name: c.sites[0] ?? c.org, address: c.sites[0] ?? "", contact: "Management representative" }, planned_date: new Date(date).toISOString(), scope: c.scope }, actor);
  certStore.mutate((s) => {
    const it = s.certs[certId].cycle.find((x) => x.id === cycleId)!;
    it.visit_id = v.id;
    s.certs[certId].history.push({ at: nowIso(), actor: actor.name, action: `Planned ${it.label} (${v.id})` });
  });
  return v;
}

export function surveillancePlan(): { cert: CertificateRec; item: CertificateRec["cycle"][number]; visit: FieldVisit | null }[] {
  certStore.guard("Surveillance");
  reconcile();
  const certs = certStore.view((s) => Object.values(s.certs).filter((c) => ["Active", "Surveillance Due", "Suspended"].includes(c.state)));
  return certs
    .flatMap((cert) => cert.cycle.filter((i) => !i.done_at).map((item) => ({ cert, item, visit: item.visit_id ? tryOr(() => visitsFor(cert.id).find((v) => v.id === item.visit_id) ?? null, null) : null })))
    .sort((a, b) => a.item.due.localeCompare(b.item.due));
}

/** Public verify (QR on the certificate). */
export function verifyCertificateToken(token: string): { valid: boolean; number?: string; org?: string; standard?: string; scope?: string; state?: string; expires?: string } {
  const t = token.trim().toLowerCase();
  const c = certStore.view((s) => Object.values(s.certs).find((x) => x.token === t || x.number.toLowerCase() === t || x.id.toLowerCase() === t) ?? null);
  if (!c) return { valid: false };
  return { valid: c.state === "Active" || c.state === "Surveillance Due", number: c.number, org: c.org, standard: c.standard, scope: c.scope, state: c.state, expires: c.expires_at };
}

/** Customer requests on a certificate: scope extension, transfer, notice of changes, copy / good standing. */
export function customerCertificateRequest(certId: string, kind: "scope" | "changes" | "copy" | "good_standing", text: string, who: string): void {
  certStore.guard("Certificate request");
  if (!text.trim()) throw new Error("Tell us what you need.");
  const label = { scope: "Scope extension", changes: "Notice of changes (CER_FO_028)", copy: "Certificate copy", good_standing: "Letter of good standing" }[kind];
  const c = certStore.mutate((s) => {
    const c = s.certs[certId];
    if (!c) throw new Error("Certificate not found.");
    c.history.push({ at: nowIso(), actor: `${who} (customer)`, action: `Requested: ${label}`, note: text });
    return c;
  });
  safe(() => openTask({ doctype: "Certification", name: c.id, state: `Request: ${label}`, seq: c.history.length + 200, family: "do", verb: "task", role: "Certification Officer", title: `${label} — ${c.org}`, module: "Certification", link: certLink(c.id), sla_days: 5, facts: { Certificate: c.number, Request: text } }));
}

export function startRenewal(certId: string, who: string): CertApplication {
  const c = certStore.read().certs[certId];
  if (!c) throw new Error("Certificate not found.");
  const prev = certStore.read().apps[c.application_id];
  return createApplication({ scheme: c.scheme, org: c.org, client_id: c.client_id, contact: prev?.contact ?? who, customer_email: c.customer_email, phone: prev?.phone, employees: prev?.employees ?? 10, sites: prev?.sites ?? [{ name: c.sites[0] ?? "Main site", address: "", employees: 10 }], scope: c.scope, channel: "renewal", uploaded: (prev?.documents ?? []).filter((d) => d.status === "acceptable").map((d) => d.key), renewal_of: c.number }, who);
}

/* ---------------- marks (C15) ---------------- */

export function listMarks(f: { email?: string; state?: string } = {}): MarkRequest[] {
  certStore.guard("Mark requests");
  reconcile();
  const email = f.email?.toLowerCase();
  return certStore.view((s) => Object.values(s.marks).filter((m) => !f.state || m.state === f.state).filter((m) => !email || m.customer_email === "demo" || m.customer_email.toLowerCase() === email).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)));
}

export function submitMark(certId: string, input: { usage: MarkRequest["usage"]; description: string; artwork: string; artwork_url?: string }, who: string): MarkRequest {
  certStore.guard("Mark request");
  if (!input.artwork.trim() || !input.description.trim()) throw new Error("Attach the artwork and describe how the mark will be used.");
  const m = certStore.mutate((s) => {
    const c = s.certs[certId];
    if (!c) throw new Error("Certificate not found.");
    if (!["Active", "Surveillance Due"].includes(c.state)) throw new Error("The mark can only be used while the certificate is valid.");
    s.seq += 1;
    const m: MarkRequest = { id: `MK-26-${String(s.seq).padStart(4, "0")}`, state: "Submitted", seq: 1, certificate_id: certId, org: c.org, customer_email: c.customer_email, ...input, submitted_at: nowIso(), history: [{ at: nowIso(), actor: `${who} (customer)`, action: "Submitted artwork", to: "Submitted" }] };
    s.marks[m.id] = m;
    return m;
  });
  syncMark(m, who);
  return m;
}

export function markActions(id: string, actor: Actor): ActionOption[] {
  const m = certStore.read().marks[id];
  return m ? allowedActions(MARK_DEF, m, actor) : [];
}

export async function actOnMark(id: string, action: string, actor: Actor, input: ActInput, patch?: Partial<Pick<MarkRequest, "artwork" | "artwork_url" | "description">>): Promise<MarkRequest> {
  const m = certStore.mutate((s) => {
    const m = s.marks[id];
    if (!m) throw new Error("Mark request not found.");
    applyTransition(MARK_DEF, m, action, actor, input);
    if (input.reason) m.comments = input.reason;
    if (patch) Object.assign(m, patch);
    return m;
  });
  syncMark(m, actor.name, action);
  if (action !== "resubmit") notifySafe({ audience: "customer", to: m.customer_email, kind: "certificate", ref: m.id, title: `Mark-use request ${m.id}: ${m.state.toLowerCase()}`, body: input.reason ?? "Your artwork is approved for use with the ESWASA mark.", link: "/account/certificates" });
  return m;
}

/* ---------------- competence (C8) ---------------- */

export function listCompetence(): Competence[] {
  return certStore.view((s) => Object.values(s.competence));
}

export function saveCompetence(c: Competence): Competence {
  return certStore.mutate((s) => {
    s.competence[c.name] = c;
    return c;
  });
}

/* ---------------- overview / misc ---------------- */

export function pipelineCounts(): Record<string, number> {
  const apps = listApplications();
  return Object.fromEntries(APP_DEF.states.map((st) => [st.id, apps.filter((a) => a.state === st.id).length]));
}

export async function resetCertificationDemo(): Promise<void> {
  certStore.reset();
  reconciled = false;
  cronRan = false;
}

/* ---------------- field & lab hooks (R-V4) ---------------- */

function afterVisitClosed(appId: string, v: FieldVisit) {
  const a = certStore.mutate((s) => {
    const a = s.apps[appId];
    if (!a) return null;
    const team = [v.lead, ...v.team].filter(Boolean) as string[];
    a.duties = { ...(a.duties ?? {}), "Audit team": [...new Set([...(a.duties?.["Audit team"] ?? []), ...team])], "Raised finding": [...new Set([...(a.duties?.["Raised finding"] ?? []), ...(v.findings.length && v.lead ? [v.lead] : [])])] };
    for (const f of v.findings) {
      if (a.findings.some((n) => n.visit_id === v.id && n.clause === f.clause && n.statement === f.statement)) continue;
      a.findings.push({ id: `NC-${a.findings.length + 1}`, clause: f.clause, severity: f.severity, statement: f.statement, raised_at: nowIso(), raised_by: v.lead ?? "Auditor", visit_id: v.id, due: isoIn(s.settings.nc_days), state: f.severity === "observation" ? "Verified closed" : "Raised", rejections: 0 });
    }
    for (const id of v.sample_ids) if (!a.sample_ids.includes(id)) a.sample_ids.push(id);
    a.history.push({ at: nowIso(), actor: "System", action: `Visit ${v.id} closed — ${v.findings.length} finding(s), ${v.sample_ids.length} sample(s)` });
    return a;
  });
  if (!a) return;
  if (a.state === "Audit Planned") systemMove(a.id, "Audit in Progress", `Visit ${v.id} carried out`);
  const now = certStore.read().apps[a.id];
  if (now.state !== "Audit in Progress") return;
  if (openNcs(now).length) {
    systemMove(a.id, "NC Resolution", "Findings need corrective action", undefined, "R-C2");
    notifyApp(now, "Action needed: respond to audit findings", `${openNcs(now).length} finding(s) were raised at ${v.title}. Respond with root cause, correction and corrective action within ${getCertSettings().nc_days} days.`, "audit");
    return;
  }
  const visits = tryOr(() => visitsFor(a.id), []);
  const allStagesDone = now.stages.every((st) => st.visit_id && visits.find((x) => x.id === st.visit_id)?.state === "Closed");
  if (allStagesDone && !labBlock(now)) systemMove(a.id, "Technical Review", "All visits closed, no open findings");
}

registerVisitParent("Certification Application", {
  eligibility: (v, person) => {
    const a = v.parent ? certStore.read().apps[v.parent.name] : undefined;
    return a ? competenceProblem(person.name, a.scheme, a.org, new Date(v.planned_date)) : null;
  },
  onClosed: (v) => afterVisitClosed(v.parent!.name, v),
  onAborted: (v) => {
    const a = v.parent ? certStore.read().apps[v.parent.name] : undefined;
    if (a?.officer) notifySafe({ audience: "staff", to: a.officer, kind: "audit", ref: v.id, title: `Visit aborted — ${a.org}`, body: v.abort?.reason ?? "", link: `/field/visits/${v.id}` });
  },
});

registerVisitParent("Certification", {
  eligibility: (v, person) => {
    const c = v.parent ? certStore.read().certs[v.parent.name] : undefined;
    return c ? competenceProblem(person.name, c.scheme, c.org, new Date(v.planned_date)) : null;
  },
  onClosed: (v) => {
    const c = certStore.mutate((s) => {
      const c = v.parent ? s.certs[v.parent.name] : undefined;
      if (!c) return null;
      const item = c.cycle.find((x) => x.visit_id === v.id);
      if (item) item.done_at = nowIso();
      const majors = v.findings.filter((f) => f.severity === "major").length;
      if (!majors && c.state === "Surveillance Due") {
        c.history.push({ at: nowIso(), actor: "System", action: `${item?.label ?? "Surveillance"} closed with no majors`, from: c.state, to: "Active", rule: "R-C5" });
        c.state = "Active";
        c.seq += 1;
      } else c.history.push({ at: nowIso(), actor: "System", action: `${item?.label ?? "Surveillance"} closed — ${majors} major finding(s)` });
      if (majors) c.duties = { ...(c.duties ?? {}), "Raised finding": [v.lead ?? "Auditor"] };
      return { c, majors };
    });
    if (!c) return;
    syncCert(c.c, "System");
    if (c.majors) safe(() => openTask({ doctype: "Certification", name: c.c.id, state: "Major at surveillance", seq: c.c.seq + 300, family: "approve", verb: "approve", role: "Certification Manager", title: `${c.majors} major finding(s) at surveillance — consider suspension of ${c.c.number}`, module: "Certification", link: certLink(c.c.id), sla_days: 5, rule: "R-C6", priority: "high" }));
  },
});

registerSampleParent("Certification Application", {
  onResult: (smp) => {
    const appId = smp.parent!.name;
    const a = certStore.mutate((s) => {
      const a = s.apps[appId];
      if (!a) return null;
      a.history.push({ at: nowIso(), actor: "LIMS", action: `Sample ${smp.seal}: ${smp.result}`, note: smp.result_note, rule: smp.result === "fail" ? "R-V4" : undefined });
      return a;
    });
    if (!a) return;
    if (smp.result === "fail") {
      notifyApp(a, "Laboratory result: sample did not conform", `Sample ${smp.seal} (${smp.product}) failed testing: ${smp.result_note ?? ""}. Your certification officer will contact you about next steps.`, "audit");
      safe(() => openSystemCase({ type: "product_report", subject: `Failed certification sample ${smp.seal} — ${a.org}`, description: `R-V4: ${smp.product} (${smp.batch ?? "batch ?"}) failed: ${smp.result_note ?? ""}. Application ${a.id}.`, client_id: a.client_id, priority: "high", about: { kind: "application", label: `${a.id} · ${a.standard}`, ref: a.id, client_id: a.client_id } }));
      const active = certStore.view((s) => Object.values(s.certs).filter((c) => c.org === a.org && ["Active", "Surveillance Due"].includes(c.state)));
      for (const c of active) safe(() => openTask({ doctype: "Certification", name: c.id, state: "Suspension proposed", seq: c.seq + 400, family: "approve", verb: "approve", role: "Certification Manager", title: `R-V4: failed sample — propose suspension of ${c.number} (${c.org})`, module: "Certification", link: certLink(c.id), sla_days: 2, rule: "R-V4", priority: "urgent" }));
      safe(() => openTask({ doctype: "Governance Risk", name: `RV4-${smp.id}`, state: "Signal", seq: 1, family: "alert", role: "Eswasa Risk Officer", title: `Failed product sample ${smp.seal} — ${a.org}: review the risk register`, module: "Governance", link: "/board/risks", sla_days: 5, rule: "R-V4" }));
    } else {
      const now = certStore.read().apps[appId];
      const visits = tryOr(() => visitsFor(appId), []);
      if (now.state === "Audit in Progress" && !openNcs(now).length && visits.every((v) => ["Closed", "Cancelled"].includes(v.state)) && !labBlock(now)) systemMove(appId, "Technical Review", "Lab results approved — all conforming");
    }
  },
});

/* ---------------- CRM hooks: signals (04 R10) and appeal panel exclusions (04 R11) ---------------- */

registerSignalGenerator({
  key: "certificates",
  label: "Certificates expiring / surveillance due",
  run: (rules) =>
    certStore.view((s) =>
      Object.values(s.certs)
        .filter((c) => ["Active", "Surveillance Due"].includes(c.state) && c.client_id)
        .flatMap((c) => {
          const out = [];
          const days = Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86_400_000);
          if (days <= rules.expiry_horizon_days) out.push({ kind: "cert_expiring" as const, title: `${c.standard} certificate expires in ${days} days`, detail: `${c.org} — ${c.number}. Offer recertification.`, client_id: c.client_id, services: ["certification" as const], value_estimate: 30000, due_at: c.expires_at, source_ref: `cert-exp:${c.id}` });
          const next = c.cycle.find((x) => !x.done_at);
          if (next && !next.visit_id && (new Date(next.due).getTime() - Date.now()) / 86_400_000 <= rules.expiry_horizon_days) out.push({ kind: "surveillance_due" as const, title: `${next.label} due ${new Date(next.due).toLocaleDateString()}`, detail: `${c.org} — ${c.number}. Confirm dates and offer pre-audit training.`, client_id: c.client_id, services: ["certification" as const, "training" as const], value_estimate: 13000, due_at: next.due, source_ref: `cert-surv:${c.id}:${next.id}` });
          return out;
        }),
    ),
});

registerSignalGenerator({
  key: "nonconformities",
  label: "Repeated nonconformities → training",
  run: () =>
    certStore.view((s) =>
      Object.values(s.apps)
        .filter((a) => a.client_id && a.findings.filter((n) => n.severity !== "observation").length >= 2)
        .map((a) => ({ kind: "nc_training" as const, title: `${a.findings.length} findings at ${a.org} — offer training`, detail: `Clauses: ${a.findings.map((n) => n.clause).join(", ")}. Offer an internal auditor or HACCP course (commercial team never sees the findings' detail).`, client_id: a.client_id, services: ["training" as const], value_estimate: 9000, source_ref: `nc-train:${a.id}` })),
    ),
});

registerAppealExclusion((c) => {
  const ref = c.about?.ref;
  if (!ref) return [];
  const s = certStore.read();
  const app = s.apps[ref] ?? Object.values(s.apps).find((a) => a.certificate_id === ref);
  const cert = s.certs[ref];
  const duties = { ...(app?.duties ?? {}), ...(cert?.duties ?? {}) };
  const why: Record<string, string> = { "Audit team": "On the audit team for this file", "Technical reviewer": "Technical reviewer of this file", "Decision maker": "Made the original decision", "Suspended by": "Suspended this certificate" };
  return Object.entries(duties).flatMap(([step, people]) => (why[step] ? people.map((name) => ({ name, why: why[step] })) : []));
});

/* ---------------- certification health per client (05 P3) ---------------- */

export type CertHealth = {
  ncTotal: number;
  ncOnTime: number;
  ncOverdue: number;
  /** On-time NC closure, 0–100 (null when there were no NCs). */
  ncOnTimePct: number | null;
  invoices: number;
  paidOnTimePct: number | null;
  overdueInvoices: number;
  score: number;
  /** Suggested surveillance frequency (risk-based). Proposes only — the Certification Manager decides. */
  surveillance: { months: 6 | 12; why: string };
};

const sameOrg = (a: { client_id?: string; org?: string; customer?: string }, clientId: string, org?: string) => a.client_id === clientId || (!!org && (a.org ?? a.customer ?? "").toLowerCase() === org.toLowerCase());

/** NC closure discipline and payment behaviour for one client. Feeds CRM health and surveillance planning. */
export function clientCertHealth(clientId: string, org?: string): CertHealth {
  const apps = certStore.view((s) => Object.values(s.apps).filter((a) => sameOrg(a, clientId, org)));
  const ncs = apps.flatMap((a) => a.findings).filter((n) => n.severity !== "observation");
  const closedAt = (n: Nonconformity) => n.verified?.at ?? n.review?.at ?? n.response?.at;
  const done = ncs.filter((n) => n.state === "Accepted" || n.state === "Verified closed");
  const onTime = done.filter((n) => (closedAt(n) ?? n.due) <= n.due).length;
  const overdue = ncs.filter((n) => !["Accepted", "Verified closed"].includes(n.state) && n.due < nowIso()).length;
  const inv = tryOr(() => listInvoices({ source: "certification" }).filter((i) => sameOrg(i, clientId, org) && i.status !== "cancelled"), [] as Invoice[]);
  const paid = inv.filter((i) => i.status === "paid");
  const paidOnTime = paid.filter((i) => (i.payments[i.payments.length - 1]?.at ?? i.due_at) <= i.due_at).length;
  const overdueInv = inv.filter((i) => i.status === "overdue").length;
  const ncPct = done.length ? Math.round((onTime / done.length) * 100) : null;
  const payPct = paid.length ? Math.round((paidOnTime / paid.length) * 100) : null;
  let score = 100;
  if (ncPct !== null) score -= Math.round((100 - ncPct) * 0.4);
  score -= overdue * 10;
  if (payPct !== null) score -= Math.round((100 - payPct) * 0.2);
  score -= overdueInv * 8;
  score = Math.max(0, Math.min(100, score));
  const majors = ncs.filter((n) => n.severity === "major").length;
  const risky = score < 70 || overdue > 0 || majors >= 2;
  return {
    ncTotal: ncs.length,
    ncOnTime: onTime,
    ncOverdue: overdue,
    ncOnTimePct: ncPct,
    invoices: inv.length,
    paidOnTimePct: payPct,
    overdueInvoices: overdueInv,
    score,
    surveillance: risky
      ? { months: 6, why: `${overdue ? `${overdue} NC(s) past due; ` : ""}${majors >= 2 ? `${majors} major NCs; ` : ""}certification health ${score}/100 — consider 6-monthly surveillance.` }
      : { months: 12, why: `Certification health ${score}/100 — annual surveillance is enough.` },
  };
}

registerHealthFactor((c) => {
  const h = clientCertHealth(c.id, c.name);
  const out: { label: string; delta: number }[] = [];
  if (h.ncOverdue) out.push({ label: `${h.ncOverdue} NC(s) past due`, delta: -8 * h.ncOverdue });
  if (h.ncOnTimePct !== null && h.ncOnTimePct >= 90 && h.ncTotal >= 2) out.push({ label: "Closes NCs on time", delta: +4 });
  else if (h.ncOnTimePct !== null && h.ncOnTimePct < 60) out.push({ label: `Late NC closure (${h.ncOnTimePct}% on time)`, delta: -6 });
  if (h.paidOnTimePct !== null && h.paidOnTimePct < 60) out.push({ label: `Pays certification fees late (${h.paidOnTimePct}% on time)`, delta: -5 });
  return out;
});

/* ---------------- audit report generator (05 P3) ---------------- */

/**
 * Builds a draft audit report from the Field record: checklist, findings, evidence photos and sign-offs.
 * The lead auditor edits it and saves it; nothing is sent until they do.
 * TODO: wire real — POST /certification/applications/{id}/audit-report/draft {visit} (server-side template).
 */
export function draftAuditReport(appId: string, visitId: string): string {
  const b = getApplication(appId);
  if (!b) throw new Error("Application not found.");
  const v = b.visits.find((x) => x.id === visitId);
  if (!v) throw new Error("Visit not found on this application.");
  const a = b.app;
  const ans = (k: "yes" | "no" | "na") => v.checklist.filter((c) => c.answer === k).length;
  const unanswered = v.checklist.filter((c) => !c.answer).length;
  const ncs = [...a.findings.filter((n) => n.visit_id === v.id), ...v.findings.filter((f) => !a.findings.some((n) => n.visit_id === v.id && n.statement === f.statement))];
  const sections = [...new Set(v.checklist.map((c) => c.section))];
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—");
  const majors = ncs.filter((n) => n.severity === "major").length;
  const minors = ncs.filter((n) => n.severity === "minor").length;
  const lines = [
    `AUDIT REPORT — ${v.title}`,
    "",
    `Organisation: ${a.org}`,
    `Standard: ${a.standard}`,
    `Scope: ${v.scope ?? a.scope}`,
    `Site: ${v.site.name}, ${v.site.address}`,
    `Date(s): ${fmt(v.checkin?.at ?? v.planned_date)} (${v.duration_days} day(s))`,
    `Audit team: ${[v.lead ? `${v.lead} (lead)` : null, ...v.team.filter((t) => t !== v.lead)].filter(Boolean).join(", ") || "—"}`,
    `Reference: ${a.id} / ${v.id} · checklist ${v.checklist_version}`,
    "",
    "1. Summary",
    `${v.checklist.length} checklist items assessed across ${sections.length} section(s): ${ans("yes")} conforming, ${ans("no")} not conforming, ${ans("na")} not applicable${unanswered ? `, ${unanswered} not answered` : ""}. ${majors} major and ${minors} minor nonconformit${majors + minors === 1 ? "y" : "ies"} raised.`,
    "",
    "2. Results by section",
    ...sections.map((sec) => {
      const items = v.checklist.filter((c) => c.section === sec);
      const no = items.filter((c) => c.answer === "no");
      return `• ${sec}: ${items.filter((c) => c.answer === "yes").length}/${items.length} conforming${no.length ? ` — gaps: ${no.map((c) => `${c.question}${c.note ? ` (${c.note})` : ""}`).join("; ")}` : ""}`;
    }),
    "",
    "3. Nonconformities",
    ...(ncs.length ? ncs.map((n, i) => `${i + 1}. [${n.severity.toUpperCase()}] Clause ${n.clause}: ${n.statement}`) : ["None raised."]),
    "",
    "4. Evidence",
    ...(v.photos.length ? v.photos.map((p) => `• ${p.name}${p.caption ? ` — ${p.caption}` : ""} (taken ${fmt(p.at)}, sha ${p.hash.slice(0, 10)})`) : ["No photos attached."]),
    ...(v.notes.trim() ? ["", "Auditor notes:", v.notes.trim()] : []),
    "",
    "5. Conclusion and recommendation",
    majors
      ? `The management system is not yet effective for the scope. Certification cannot be recommended until the ${majors} major nonconformit${majors === 1 ? "y is" : "ies are"} closed and verified.`
      : minors
        ? `The management system is effectively implemented, subject to acceptable corrective action plans for the ${minors} minor nonconformit${minors === 1 ? "y" : "ies"} within the agreed time.`
        : "The management system is effectively implemented and maintained for the scope. The audit team recommends certification.",
    "",
    "6. Sign-off",
    ...(v.signatures.length ? v.signatures.map((s) => `• ${s.name}${s.title ? `, ${s.title}` : ""} (${s.role}) — ${fmt(s.at)}`) : ["Not yet signed on site."]),
  ];
  return lines.join("\n");
}

export function auditReportFor(appId: string, visitId: string): AuditReport | null {
  const b = getApplication(appId);
  const rows = (b?.app.audit_reports ?? []).filter((r) => r.visit_id === visitId);
  return rows.sort((x, y) => y.version - x.version)[0] ?? null;
}

/** Saves a new version of the report and files it on the application (Documents). */
export function saveAuditReport(appId: string, visitId: string, text: string, actor: Actor): AuditReport {
  certStore.guard("Audit reports");
  if (!text.trim()) throw new Error("The report is empty.");
  // TODO: wire real — PUT /certification/applications/{id}/audit-report {visit, text}
  const r = certStore.mutate((s) => {
    const a = s.apps[appId];
    if (!a) throw new Error("Application not found.");
    const version = (a.audit_reports ?? []).filter((x) => x.visit_id === visitId).length + 1;
    const row: AuditReport = { visit_id: visitId, version, text, by: actor.name, at: nowIso() };
    a.audit_reports = [...(a.audit_reports ?? []), row];
    a.history.push({ at: row.at, actor: actor.name, action: `Audit report v${version} saved (${visitId})` });
    return row;
  });
  safe(() => addGeneratedDoc("Certification Application", appId, { family: `${appId}-report-${visitId}`, name: `Audit report ${visitId} v${r.version}.pdf`, category: "Audit", uploaded_by: actor.name, size: 90_000, version: r.version }));
  return r;
}
