/**
 * Metrology & LIMS store (gap 07). Calibration jobs from request to dispatch, the lab's own equipment
 * and reference standards (overdue ones are blocked in worksheets), the method / CMC library,
 * customers' instrument registers and LIMS test requests for certification and market samples.
 *
 * TODO: wire real — existing Core: GET /metrology/jobs | instruments | results, POST /metrology/jobs/{id}/act.
 *   New (add to contracts/openapi.yaml first): POST /metrology/requests, POST /metrology/jobs/{id}/quote,
 *   POST /metrology/jobs/{id}/receipt, PUT /metrology/jobs/{id}/worksheet, POST /metrology/jobs/{id}/certificate,
 *   POST /metrology/jobs/{id}/dispatch, GET/PATCH /metrology/equipment, POST /metrology/equipment/{id}/checks,
 *   GET/PUT /metrology/methods, GET /account/instruments, GET /verify/cal/{token},
 *   POST /lims/test-requests, PUT /lims/test-requests/{id}/results, POST /lims/test-requests/{id}/act.
 */
import { createInvoice, invoiceFor, type Invoice } from "../billing/store";
import { registerSignalGenerator } from "../crm/store";
import { planVisit, recordSampleResult, registerLabRouter, registerVisitParent, peekVisit } from "../field/store";
import type { FieldVisit, Sample } from "../field/types";
import { notifySafe } from "../notify/store";
import { createLocalStore, isoIn, nowIso } from "../store/localStore";
import { DEMO_STAFF, onLeave } from "../tasks/staff";
import { reconcileTasks, syncRecordTasks } from "../tasks/store";
import { allowedActions, applyTransition, SUPER_ROLES } from "../workflow/engine";
import type { ActInput, ActionOption, Actor } from "../workflow/types";
import { JOB_DEF, TEST_DEF } from "./defs";
import { DEFAULT_MET_SETTINGS, SEED_EQUIPMENT, SEED_INSTRUMENTS, SEED_METHODS, seedJobs, seedTests } from "./seed";
import type { CalItem, CalJob, CalPointRow, CustomerInstrument, Discipline, LabEquipment, Method, MetrologySettings, TestRequest, TestResult, Worksheet } from "./types";

type MetState = {
  v: 1;
  seq: number;
  jobs: Record<string, CalJob>;
  equipment: Record<string, LabEquipment>;
  methods: Record<string, Method>;
  instruments: Record<string, CustomerInstrument>;
  tests: Record<string, TestRequest>;
  settings: MetrologySettings;
};

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, structuredClone(r)]));

export const metStore = createLocalStore<MetState>({
  key: "eswasaone.metrology.v1",
  v: 1,
  seed: () => ({
    v: 1,
    seq: 245,
    jobs: byId(seedJobs()),
    equipment: byId(SEED_EQUIPMENT),
    methods: byId(SEED_METHODS),
    instruments: byId(SEED_INSTRUMENTS),
    tests: byId(seedTests()),
    settings: structuredClone(DEFAULT_MET_SETTINGS),
  }),
});

const SYSTEM: Actor = { name: "System", roles: ["System Manager"] };
const isSuper = (a: Actor) => a.roles.some((r) => SUPER_ROLES.includes(r));
const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn("[metrology]", e);
  }
};

/* ---------------- tasks ---------------- */

function syncJob(j: CalJob, by?: string, outcome?: string) {
  syncRecordTasks({ def: JOB_DEF, rec: j, name: j.id, title: `${j.id} — ${j.customer}`, link: `/metrology/jobs/${j.id}`, module: "Metrology", by, outcome, facts: { Customer: j.customer, Items: j.items.map((i) => i.description).join(", "), Discipline: j.discipline, ...(j.metrologist ? { Metrologist: j.metrologist } : {}) } });
}
function syncTest(t: TestRequest, by?: string, outcome?: string) {
  syncRecordTasks({ def: TEST_DEF, rec: t, name: t.id, title: `${t.id} — ${t.product}`, link: `/metrology/tests/${t.id}`, module: "Metrology", by, outcome, facts: { Sample: t.seal, Tests: t.tests, ...(t.parent ? { For: t.parent.label } : {}), ...(t.analyst ? { Analyst: t.analyst } : {}) } });
}

let reconciled = false;
function reconcile() {
  if (reconciled) return;
  reconciled = true;
  const s = metStore.read();
  reconcileTasks(JOB_DEF, Object.values(s.jobs).map((j) => ({ rec: j, name: j.id, title: `${j.id} — ${j.customer}`, link: `/metrology/jobs/${j.id}`, module: "Metrology" as const })));
  reconcileTasks(TEST_DEF, Object.values(s.tests).map((t) => ({ rec: t, name: t.id, title: `${t.id} — ${t.product}`, link: `/metrology/tests/${t.id}`, module: "Metrology" as const })));
}

/* ---------------- equipment rules (M9) ---------------- */

export function equipmentProblem(e: LabEquipment | undefined, at = new Date()): string | null {
  if (!e) return "Unknown equipment.";
  if (e.status === "out_of_service") return `Out of service${e.out_reason ? ` — ${e.out_reason}` : ""}.`;
  if (new Date(e.cal_due).getTime() < at.getTime()) return `Calibration overdue since ${new Date(e.cal_due).toLocaleDateString()} — can't be used.`;
  return null;
}

export function pointError(p: Pick<CalPointRow, "nominal" | "as_found">): number {
  return Math.round((p.as_found - p.nominal) * 1e6) / 1e6;
}
export function pointOot(p: CalPointRow): boolean {
  return Math.abs(pointError(p)) > p.tolerance;
}
export function jobOot(j: Pick<CalJob, "worksheet">): boolean {
  return j.worksheet.points.some(pointOot);
}

function worksheetProblem(s: MetState, j: CalJob): string | null {
  const ws = j.worksheet;
  if (!ws.method_id) return "Choose the method / procedure.";
  if (!ws.refs.length) return "Select the reference standards used (traceability).";
  for (const r of ws.refs) {
    const p = equipmentProblem(s.equipment[r]);
    if (p) return `${r}: ${p}`;
  }
  if (j.location === "lab" && (ws.env.temp_c === undefined || ws.env.rh_pct === undefined)) return "Record the environmental conditions.";
  const missing = j.items.filter((i) => !ws.points.some((p) => p.item_id === i.id));
  if (missing.length) return `Enter measurement points for ${missing.map((i) => i.serial).join(", ")}.`;
  return null;
}

/* ---------------- reads ---------------- */

export function listJobs(f: { state?: string; metrologist?: string; email?: string; discipline?: string } = {}): CalJob[] {
  metStore.guard("Calibration jobs");
  reconcile();
  const email = f.email?.toLowerCase();
  return metStore.view((s) =>
    Object.values(s.jobs)
      .filter((j) => !f.state || j.state === f.state)
      .filter((j) => !f.metrologist || j.metrologist === f.metrologist)
      .filter((j) => !f.discipline || j.discipline === f.discipline)
      .filter((j) => !email || j.customer_email === "demo" || j.customer_email.toLowerCase() === email)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}

export type JobBundle = { job: CalJob; method?: Method; refs: LabEquipment[]; invoice: Invoice | null; visit: FieldVisit | null; settings: MetrologySettings };

export function getJob(id: string): JobBundle | null {
  metStore.guard("Calibration job");
  reconcile();
  return metStore.view((s) => {
    const job = s.jobs[id];
    if (!job) return null;
    return {
      job,
      method: job.worksheet.method_id ? s.methods[job.worksheet.method_id] : undefined,
      refs: job.worksheet.refs.map((r) => s.equipment[r]).filter(Boolean),
      invoice: safeInvoice(job.id),
      visit: job.visit_id ? peekVisit(job.visit_id) : null,
      settings: s.settings,
    };
  });
}

const safeInvoice = (ref: string) => {
  try {
    return invoiceFor(ref);
  } catch {
    return null;
  }
};

export function jobActions(id: string, actor: Actor): ActionOption[] {
  const s = metStore.read();
  const j = s.jobs[id];
  if (!j) return [];
  return allowedActions(JOB_DEF, j, actor).map((a) => {
    let why = a.disabledReason;
    if (a.action === "submit_review") {
      if (j.metrologist && j.metrologist !== actor.name && !isSuper(actor)) why ??= `Only the assigned metrologist (${j.metrologist}) can submit.`;
      why ??= worksheetProblem(s, j) ?? undefined;
    }
    if (a.action === "receive" && j.location === "onsite") why ??= "On-site job — results come from the field visit.";
    return { ...a, disabledReason: why };
  });
}

/* ---------------- workflow ---------------- */

function act(id: string, action: string, actor: Actor, input: ActInput, side?: (j: CalJob, s: MetState) => void): CalJob {
  metStore.guard("Calibration job");
  const j = metStore.mutate((s) => {
    const j = s.jobs[id];
    if (!j) throw new Error("Job not found.");
    const res = applyTransition(JOB_DEF, j, action, actor, input);
    side?.(j, s);
    if (input.payload?.note) res.event.note = input.payload.note;
    return j;
  });
  syncJob(j, actor.name, action);
  return j;
}

export async function actOnJob(id: string, action: string, actor: Actor, input: ActInput): Promise<CalJob> {
  const block = jobActions(id, actor).find((a) => a.action === action)?.disabledReason;
  if (block) throw new Error(block);
  const p = input.payload ?? {};
  switch (action) {
    case "assign":
      return assignMetrologist(id, p.metrologist, actor, input.expected_state);
    case "issue_certificate":
      return issueCertificate(id, actor, input.expected_state);
    case "dispatch":
      return dispatchJob(id, { method: (p.method as "collection" | "courier") || "collection", name: p.name, reference: p.reference }, actor, input.expected_state);
    default: {
      const j = act(id, action, actor, input);
      if (["cancel", "decline_request"].includes(action))
        notifyCustomer(j, `Calibration ${j.id} ${action === "cancel" ? "cancelled" : "declined"}`, `${input.reason ?? ""}`.trim() || "Please contact the lab for details.");
      if (action === "approve") notifyCustomer(j, `Calibration ${j.id} results approved`, "Your calibration results passed technical review. The certificate is being issued.");
      return j;
    }
  }
}

function notifyCustomer(j: CalJob, title: string, body: string) {
  if (!j.customer_email) return;
  notifySafe({ audience: "customer", to: j.customer_email, kind: "calibration", ref: j.id, title, body, link: `/account/calibration/${j.id}`, channel: ["email", "portal"] });
}

export function quoteJob(id: string, lines: NonNullable<CalJob["quote"]>["lines"], validDays: number, actor: Actor): CalJob {
  if (!lines.length || lines.some((l) => !l.label.trim() || l.unit_price <= 0)) throw new Error("Add at least one priced line.");
  const j = metStore.read().jobs[id];
  const out = act(id, "quote", actor, { expected_state: j?.state ?? "Requested" }, (job) => {
    job.quote = { lines, valid_until: isoIn(validDays), issued_at: nowIso(), issued_by: actor.name };
  });
  const total = lines.reduce((n, l) => n + l.qty * l.unit_price, 0) * 1.15;
  notifyCustomer(out, `Calibration quote ready — ${out.id}`, `Your quote for ${out.items.length} item(s) is E ${total.toFixed(2)} incl. VAT, valid until ${new Date(out.quote!.valid_until).toLocaleDateString()}. Accept it online to book the work.`);
  return out;
}

export async function customerRespondQuote(id: string, accept: boolean, who: string, reason?: string): Promise<CalJob> {
  const cur = metStore.read().jobs[id];
  if (!cur) throw new Error("Job not found.");
  const actor: Actor = { name: `${who} (customer)`, roles: ["Customer"] };
  const j = act(id, accept ? "customer_accept" : "customer_decline", actor, { expected_state: cur.state, reason });
  if (accept) {
    safe(() => {
      if (!invoiceFor(j.id) && j.quote)
        metStore.mutate((s) => {
          const inv = createInvoice({ source: "metrology", ref: j.id, title: `Calibration ${j.id}`, customer: j.customer, customer_email: j.customer_email, client_id: j.client_id, lines: j.quote!.lines, due_at: isoIn(30) });
          s.jobs[id].quote!.invoice_id = inv.id;
        });
    });
    if (j.location === "onsite" && !j.visit_id)
      safe(() => {
        const v = planVisit({ type: "onsite_calibration", title: `On-site calibration — ${j.customer}`, parent: { doctype: "Calibration Job", name: j.id, label: j.id, link: `/metrology/jobs/${j.id}` }, client: j.customer, client_email: j.customer_email, site: { name: j.site ?? j.customer, address: j.site ?? "", contact: j.contact, phone: j.phone }, planned_date: j.preferred_date, scope: j.items.map((i) => `${i.description} (${i.range})`).join("; ") }, SYSTEM);
        metStore.mutate((s) => (s.jobs[id].visit_id = v.id));
      });
  }
  return metStore.view((s) => s.jobs[id]);
}

export function receiveItems(id: string, r: NonNullable<CalJob["receipt"]>, actor: Actor): CalJob {
  const cur = metStore.read().jobs[id];
  if (!cur) throw new Error("Job not found.");
  const j = act(id, "receive", actor, { expected_state: cur.state }, (job) => {
    job.receipt = { ...r, at: nowIso(), by: actor.name };
    job.due = isoIn(metStore.read().settings.lab_turnaround_days);
  });
  notifyCustomer(j, `Items received — job ${j.id}`, `We received ${j.items.length} item(s) (tag ${r.tag}). Condition: ${r.condition}${r.mismatch ? ` — ${r.mismatch}` : ""}. Expected ready by ${new Date(j.due!).toLocaleDateString()}.`);
  return j;
}

export function eligibleMetrologists(discipline: Discipline): { name: string; ok: boolean; why?: string; load: number }[] {
  const s = metStore.read();
  return DEMO_STAFF.filter((p) => p.roles.includes("Eswasa Metrology Officer")).map((p) => {
    const load = Object.values(s.jobs).filter((j) => j.metrologist === p.name && ["In Progress", "Pending Review"].includes(j.state)).length;
    let why: string | undefined;
    if (!(p.disciplines ?? []).includes(discipline)) why = `Not authorised for ${discipline}`;
    else if (onLeave(p)) why = "On leave";
    else if (load >= p.cap / 2) why = `Workload: ${load} open jobs`;
    return { name: p.name, ok: !why, why, load };
  });
}

export async function assignMetrologist(id: string, name: string, actor: Actor, expected?: string): Promise<CalJob> {
  const s = metStore.read();
  const j0 = s.jobs[id];
  if (!j0) throw new Error("Job not found.");
  const e = eligibleMetrologists(j0.discipline).find((x) => x.name === name);
  if (!e) throw new Error("Choose a metrologist.");
  if (!e.ok && !isSuper(actor)) throw new Error(`${name} can't take this job: ${e.why}.`);
  return act(id, "assign", actor, { expected_state: expected ?? j0.state, payload: { metrologist: name } }, (j) => {
    j.metrologist = name;
    j.due ??= isoIn(metStore.read().settings.lab_turnaround_days);
  });
}

export function saveWorksheet(id: string, ws: Worksheet, actor: Actor): CalJob {
  metStore.guard("Worksheet");
  let notifyOot: CalJob | null = null;
  const j = metStore.mutate((s) => {
    const j = s.jobs[id];
    if (!j) throw new Error("Job not found.");
    if (j.state !== "In Progress") throw new Error("The worksheet is locked once submitted for review.");
    if (j.metrologist && j.metrologist !== actor.name && !isSuper(actor)) throw new Error(`Only ${j.metrologist} can edit this worksheet.`);
    for (const r of ws.refs) {
      const p = equipmentProblem(s.equipment[r]);
      if (p) throw new Error(`${r} ${s.equipment[r]?.name ?? ""}: ${p}`);
    }
    const wasOot = jobOot(j);
    j.worksheet = { ...ws, saved_at: nowIso(), saved_by: actor.name };
    j.history.push({ at: nowIso(), actor: actor.name, action: "Saved worksheet", note: `${ws.points.length} points` });
    if (jobOot(j) && (!wasOot || !j.oot_notified_at) && s.settings.oot_notify === "immediate") {
      j.oot_notified_at = nowIso();
      j.history.push({ at: nowIso(), actor: "System", action: "Out-of-tolerance notice sent to customer", rule: "R-M2" });
      notifyOot = j;
    }
    return j;
  });
  if (notifyOot) {
    const n = notifyOot as CalJob;
    const bad = n.worksheet.points.filter(pointOot).map((p) => {
      const item = n.items.find((i) => i.id === p.item_id);
      return `${item?.description ?? "Item"} SN ${item?.serial ?? "?"} at ${p.nominal} ${p.unit}: as found ${p.as_found}, as left ${p.as_left} (tolerance ±${p.tolerance})`;
    });
    notifyCustomer(n, `Out of tolerance — ${n.id}`, `During calibration we found an instrument out of tolerance:\n${bad.join("\n")}\nIt was adjusted where possible — see as-found / as-left. Consider the impact on measurements made since the last calibration.`);
  }
  return j;
}

export function issueCertificate(id: string, actor: Actor, expected?: string): CalJob {
  const cur = metStore.read().jobs[id];
  if (!cur) throw new Error("Job not found.");
  const j = act(id, "issue_certificate", actor, { expected_state: expected ?? cur.state }, (job, s) => {
    job.certificate = { id: job.id.replace("CJ", "CAL"), issued_at: nowIso(), by: actor.name, token: `${job.id.toLowerCase().replace("cj-", "c")}-${Math.random().toString(16).slice(2, 6)}`, version: 1 };
    for (const item of job.items) updateRegister(s, job, item);
  });
  safe(() => {
    if (!invoiceFor(j.id)) createInvoice({ source: "metrology", ref: j.id, title: `Calibration ${j.id}`, customer: j.customer, customer_email: j.customer_email, client_id: j.client_id, lines: j.quote?.lines ?? j.items.map((i) => ({ label: `Calibration — ${i.description}`, qty: 1, unit_price: 650 })), due_at: isoIn(30) });
  });
  notifyCustomer(j, "Calibration certificate ready", `Certificate ${j.certificate!.id} for ${j.items.map((i) => i.description).join(", ")} is ready to download. Your items are ready for ${j.delivery === "courier" ? "dispatch" : "collection"}.`);
  return j;
}

/** Amend = a new certificate version; the earlier one stays on record (gate artefact). */
export function reissueCertificate(id: string, reason: string, actor: Actor): CalJob {
  if (!reason.trim()) throw new Error("A reason is required to reissue a certificate.");
  return metStore.mutate((s) => {
    const j = s.jobs[id];
    if (!j?.certificate) throw new Error("No certificate to reissue.");
    const v = j.certificate.version + 1;
    j.certificate = { ...j.certificate, id: `${j.certificate.id.replace(/-R\d+$/, "")}-R${v - 1}`, issued_at: nowIso(), by: actor.name, version: v, reason };
    j.history.push({ at: nowIso(), actor: actor.name, action: `Reissued certificate as ${j.certificate.id}`, reason });
    return j;
  });
}

function updateRegister(s: MetState, j: CalJob, item: CalItem) {
  const interval = s.settings.default_interval_months;
  const next = new Date();
  next.setMonth(next.getMonth() + interval);
  const oot = j.worksheet.points.some((p) => p.item_id === item.id && pointOot(p));
  let ins = item.instrument_id ? s.instruments[item.instrument_id] : Object.values(s.instruments).find((x) => x.serial === item.serial);
  if (!ins) {
    s.seq += 1;
    ins = { id: `INS-${1000 + s.seq}`, owner_email: j.customer_email, client: j.customer, description: item.description, make: item.make, model: item.model, serial: item.serial, range: item.range, discipline: item.discipline, interval_months: interval };
    s.instruments[ins.id] = ins;
  }
  Object.assign(ins, { last_cal: nowIso(), next_due: next.toISOString(), last_job: j.id, last_cert: j.certificate?.id, last_result: oot ? "out_of_tolerance" : "in_tolerance" });
}

export function dispatchJob(id: string, d: { method: "collection" | "courier"; name: string; reference?: string }, actor: Actor, expected?: string): CalJob {
  if (!d.name?.trim()) throw new Error("Record who collected the items (or the courier).");
  const cur = metStore.read().jobs[id];
  if (!cur) throw new Error("Job not found.");
  const j = act(id, "dispatch", actor, { expected_state: expected ?? cur.state, payload: { name: d.name } }, (job) => {
    job.dispatch = { at: nowIso(), method: d.method, name: d.name, reference: d.reference, signature: d.method === "collection" ? d.name : undefined };
  });
  notifyCustomer(j, `Job ${j.id} ${d.method === "courier" ? "dispatched" : "collected"}`, d.method === "courier" ? `Your items left the lab with ${d.name}${d.reference ? ` (${d.reference})` : ""}.` : `Your items were collected by ${d.name}. We'll remind you ${metStore.read().settings.reminder_days} days before the next calibration is due.`);
  return j;
}

/* ---------------- customer (Service) ---------------- */

export type CalRequestInput = {
  customer: string;
  customer_email: string;
  contact: string;
  phone?: string;
  location: "lab" | "onsite";
  site?: string;
  items: Omit<CalItem, "id">[];
  accreditation: boolean;
  preferred_date: string;
  delivery: "collect" | "courier";
  notes?: string;
};

export async function createCalRequest(input: CalRequestInput, who: string): Promise<CalJob> {
  metStore.guard("Calibration request");
  if (!input.items.length) throw new Error("Add at least one instrument.");
  for (const i of input.items) if (!i.description.trim() || !i.serial.trim() || !i.range.trim()) throw new Error("Each instrument needs a description, serial number and range.");
  const j = metStore.mutate((s) => {
    s.seq += 1;
    const id = `CJ-26-${String(s.seq).padStart(4, "0")}`;
    const items = input.items.map((x, n) => ({ ...x, id: `I${n + 1}` }));
    const j: CalJob = {
      ...input,
      id,
      state: "Requested",
      seq: 1,
      items,
      discipline: items[0].discipline,
      created_at: nowIso(),
      worksheet: { refs: [], env: {}, points: [], attachments: [] },
      history: [{ at: nowIso(), actor: `${who} (customer)`, action: "Requested calibration", to: "Requested" }],
    };
    s.jobs[id] = j;
    return j;
  });
  syncJob(j, who);
  notifyCustomer(j, `Calibration request received — ${j.id}`, `We received your request for ${j.items.length} instrument(s). The lab will send a quote within ${metStore.read().settings.quote_days} working days.`);
  return j;
}

/** What's outside the accredited scope (M P2 CMC warning). */
export function scopeWarnings(items: Pick<CalItem, "discipline">[], accreditation: boolean): string[] {
  if (!accreditation) return [];
  const methods = Object.values(metStore.read().methods);
  return [...new Set(items.map((i) => i.discipline))]
    .filter((d) => !methods.some((m) => m.discipline === d && m.accredited))
    .map((d) => `${d} calibration is outside ESWASA's accredited scope — we can calibrate it, but the certificate won't carry the accreditation mark.`);
}

export function listMyInstruments(email?: string): CustomerInstrument[] {
  metStore.guard("Instruments");
  const e = email?.toLowerCase();
  return metStore.view((s) => Object.values(s.instruments).filter((i) => !e || i.owner_email === "demo" || i.owner_email.toLowerCase() === e).sort((a, b) => (a.next_due ?? "").localeCompare(b.next_due ?? "")));
}

export function listAllInstruments(): CustomerInstrument[] {
  metStore.guard("Instruments");
  return metStore.view((s) => Object.values(s.instruments).sort((a, b) => a.client.localeCompare(b.client)));
}

export function verifyCalCertificate(token: string): { valid: boolean; id?: string; customer?: string; items?: string; issued?: string; version?: number } {
  const t = token.trim().toLowerCase();
  const j = metStore.view((s) => Object.values(s.jobs).find((x) => x.certificate && (x.certificate.token === t || x.certificate.id.toLowerCase() === t)) ?? null);
  if (!j?.certificate) return { valid: false };
  return { valid: true, id: j.certificate.id, customer: j.customer, items: j.items.map((i) => `${i.description} SN ${i.serial}`).join("; "), issued: j.certificate.issued_at, version: j.certificate.version };
}

/* ---------------- equipment & methods ---------------- */

export function listEquipment(): LabEquipment[] {
  metStore.guard("Lab equipment");
  return metStore.view((s) => Object.values(s.equipment).sort((a, b) => a.cal_due.localeCompare(b.cal_due)));
}

export function getEquipment(id: string): LabEquipment | null {
  return metStore.view((s) => s.equipment[id] ?? null);
}

export function recordCheck(id: string, ok: boolean, note: string, actor: Actor): LabEquipment {
  return metStore.mutate((s) => {
    const e = s.equipment[id];
    if (!e) throw new Error("Equipment not found.");
    e.checks.unshift({ at: nowIso(), by: actor.name, ok, note });
    if (!ok) {
      e.status = "out_of_service";
      e.out_reason = `Intermediate check failed: ${note}`;
    }
    return e;
  });
}

export function setEquipmentStatus(id: string, status: LabEquipment["status"], reason: string, actor: Actor): LabEquipment {
  if (status === "out_of_service" && !reason.trim()) throw new Error("A reason is required to take equipment out of service.");
  return metStore.mutate((s) => {
    const e = s.equipment[id];
    if (!e) throw new Error("Equipment not found.");
    e.status = status;
    e.out_reason = status === "out_of_service" ? reason : undefined;
    e.checks.unshift({ at: nowIso(), by: actor.name, ok: status === "in_service", note: status === "in_service" ? `Returned to service${reason ? `: ${reason}` : ""}` : `Out of service: ${reason}` });
    return e;
  });
}

export function recordEquipmentCalibration(id: string, certificate: string, dueDays: number, actor: Actor): LabEquipment {
  if (!certificate.trim()) throw new Error("Enter the external calibration certificate number.");
  return metStore.mutate((s) => {
    const e = s.equipment[id];
    if (!e) throw new Error("Equipment not found.");
    e.last_cal = nowIso();
    e.cal_due = isoIn(dueDays);
    e.traceability = certificate;
    e.status = "in_service";
    e.out_reason = undefined;
    e.checks.unshift({ at: nowIso(), by: actor.name, ok: true, note: `Recalibrated — ${certificate}` });
    return e;
  });
}

export function listMethods(): Method[] {
  return metStore.view((s) => Object.values(s.methods));
}

export function saveMethod(m: Method): Method {
  return metStore.mutate((s) => {
    s.methods[m.id] = m;
    return m;
  });
}

export function getMetSettings(): MetrologySettings {
  return metStore.view((s) => s.settings);
}

export async function saveMetSettings(patch: Partial<MetrologySettings>): Promise<MetrologySettings> {
  return metStore.mutate((s) => {
    s.settings = { ...s.settings, ...patch };
    return s.settings;
  });
}

export async function resetMetrologyDemo(): Promise<void> {
  metStore.reset();
  reconciled = false;
}

/* ---------------- capacity & overview ---------------- */

export function capacity(): { name: string; disciplines: string[]; jobs: { id: string; state: string; due?: string; discipline: string }[]; late: number }[] {
  const s = metStore.read();
  return DEMO_STAFF.filter((p) => p.roles.includes("Eswasa Metrology Officer")).map((p) => {
    const jobs = Object.values(s.jobs).filter((j) => j.metrologist === p.name && ["In Progress", "Pending Review"].includes(j.state));
    return { name: p.name, disciplines: p.disciplines ?? [], jobs: jobs.map((j) => ({ id: j.id, state: j.state, due: j.due, discipline: j.discipline })), late: jobs.filter((j) => j.due && new Date(j.due) < new Date()).length };
  });
}

export function metrologyOverview() {
  metStore.guard("Metrology");
  reconcile();
  const s = metStore.read();
  const jobs = Object.values(s.jobs);
  const byState = Object.fromEntries(JOB_DEF.states.map((st) => [st.id, jobs.filter((j) => j.state === st.id).length]));
  const done = jobs.filter((j) => j.certificate && j.receipt);
  const tat = done.length ? Math.round(done.reduce((n, j) => n + (new Date(j.certificate!.issued_at).getTime() - new Date(j.receipt!.at).getTime()) / 86_400_000, 0) / done.length) : 0;
  const measured = jobs.filter((j) => j.worksheet.points.length);
  return {
    byState,
    open: jobs.filter((j) => !["Dispatched", "Cancelled"].includes(j.state)).length,
    turnaround: tat,
    sla: s.settings.lab_turnaround_days,
    ootRate: measured.length ? Math.round((measured.filter(jobOot).length / measured.length) * 100) : 0,
    equipmentDue: Object.values(s.equipment).filter((e) => new Date(e.cal_due).getTime() < Date.now() + 30 * 86_400_000).length,
    equipmentBlocked: Object.values(s.equipment).filter((e) => equipmentProblem(e)).length,
    testsOpen: Object.values(s.tests).filter((t) => !["Approved", "Cancelled"].includes(t.state)).length,
  };
}

/* ---------------- LIMS test requests (M11) ---------------- */

export function listTests(f: { state?: string } = {}): TestRequest[] {
  metStore.guard("Test requests");
  reconcile();
  return metStore.view((s) => Object.values(s.tests).filter((t) => !f.state || t.state === f.state).sort((a, b) => b.requested_at.localeCompare(a.requested_at)));
}

export function testsFor(parentName: string): TestRequest[] {
  return metStore.view((s) => Object.values(s.tests).filter((t) => t.parent?.name === parentName));
}

export function getTest(id: string): TestRequest | null {
  metStore.guard("Test request");
  reconcile();
  return metStore.view((s) => s.tests[id] ?? null);
}

export function testActions(id: string, actor: Actor): ActionOption[] {
  const t = metStore.read().tests[id];
  if (!t) return [];
  return allowedActions(TEST_DEF, t, actor).map((a) => {
    let why = a.disabledReason;
    if (a.action === "submit") {
      if (!t.results.length) why ??= "Enter at least one result.";
      else if (!t.conclusion) why ??= "Choose the conclusion (pass / fail).";
    }
    return { ...a, disabledReason: why };
  });
}

export function createTestRequest(sample: Sample, actor: Actor): TestRequest {
  const t = metStore.mutate((s) => {
    s.seq += 1;
    const id = `LT-26-${String(s.seq - 150).padStart(4, "0")}`;
    const t: TestRequest = {
      id,
      state: "Requested",
      seq: 1,
      sample_id: sample.id,
      seal: sample.seal,
      product: `${sample.product}${sample.brand ? ` (${sample.brand})` : ""}`,
      parent: sample.parent,
      tests: sample.tests ?? "Per product standard",
      clauses: "Per scheme test plan",
      requested_at: nowIso(),
      due: isoIn(10),
      results: [],
      history: [{ at: nowIso(), actor: actor.name, action: "Requested from sample receipt", to: "Requested" }],
    };
    s.tests[id] = t;
    return t;
  });
  syncTest(t, actor.name);
  return t;
}

export function saveTestResults(id: string, results: TestResult[], conclusion: "pass" | "fail" | undefined, remarks: string, actor: Actor): TestRequest {
  return metStore.mutate((s) => {
    const t = s.tests[id];
    if (!t) throw new Error("Test request not found.");
    if (t.state !== "In Test") throw new Error("Results are locked once submitted.");
    t.results = results;
    t.conclusion = conclusion;
    t.remarks = remarks;
    t.history.push({ at: nowIso(), actor: actor.name, action: "Saved results", note: `${results.length} parameters` });
    return t;
  });
}

export async function actOnTest(id: string, action: string, actor: Actor, input: ActInput): Promise<TestRequest> {
  metStore.guard("Test request");
  const block = testActions(id, actor).find((a) => a.action === action)?.disabledReason;
  if (block) throw new Error(block);
  const t = metStore.mutate((s) => {
    const t = s.tests[id];
    if (!t) throw new Error("Test request not found.");
    applyTransition(TEST_DEF, t, action, actor, input);
    if (action === "assign") t.analyst = input.payload?.analyst;
    return t;
  });
  syncTest(t, actor.name, action);
  if (action === "approve") safe(() => recordSampleResult(t.sample_id, t.conclusion ?? "pass", t.remarks || t.results.map((r) => `${r.param}: ${r.value}${r.unit ?? ""} (${r.pass ? "pass" : "fail"})`).join("; "), actor.name));
  return t;
}

export function eligibleAnalysts(): { name: string; ok: boolean; why?: string }[] {
  return DEMO_STAFF.filter((p) => p.roles.includes("Eswasa Lab Analyst") || p.roles.includes("Eswasa Metrology Officer")).map((p) => ({ name: p.name, ok: !onLeave(p), why: onLeave(p) ? "On leave" : undefined }));
}

/* ---------------- registrations ---------------- */

registerLabRouter((sample, actor) => createTestRequest(sample, actor).id);

registerVisitParent("Calibration Job", {
  eligibility: (v, person) => {
    const j = v.parent ? metStore.read().jobs[v.parent.name] : undefined;
    if (j && !(person.disciplines ?? []).includes(j.discipline)) return `Not authorised for ${j.discipline}`;
    return null;
  },
  onClosed: (v) => {
    const j = metStore.mutate((s) => {
      const j = v.parent ? s.jobs[v.parent.name] : undefined;
      if (!j || !["Accepted", "Received", "In Progress"].includes(j.state)) return null;
      const from = j.state;
      j.metrologist = v.lead;
      j.worksheet = {
        ...j.worksheet,
        method_id: j.worksheet.method_id ?? Object.values(s.methods).find((m) => m.discipline === j.discipline)?.id,
        refs: j.worksheet.refs.length ? j.worksheet.refs : Object.values(s.equipment).filter((e) => e.discipline === j.discipline && !equipmentProblem(e)).slice(0, 1).map((e) => e.id),
        points: v.cal_points.map((p) => ({ id: p.id, item_id: j.items[0]?.id ?? "I1", nominal: p.nominal, unit: p.unit, as_found: p.as_found, as_left: p.as_left, tolerance: p.tolerance, uncertainty: p.uncertainty })),
        saved_at: nowIso(),
        saved_by: v.lead,
      };
      j.duties = { ...(j.duties ?? {}), Metrologist: [v.lead ?? "Field"] };
      j.state = "Pending Review";
      j.seq += 1;
      j.history.push({ at: nowIso(), actor: "System", action: `On-site results from ${v.id}`, from, to: "Pending Review", note: `${v.cal_points.length} points; customer signed on site` });
      return j;
    });
    if (j) syncJob(j, "System", "Visit closed");
  },
});

registerSignalGenerator({
  key: "instruments",
  label: "Instruments due for calibration",
  run: (rules) =>
    metStore.view((s) =>
      Object.values(s.instruments)
        .filter((i) => i.next_due && (new Date(i.next_due).getTime() - Date.now()) / 86_400_000 <= rules.calibration_horizon_days)
        .map((i) => ({ kind: "calibration_due" as const, title: `${i.description} due ${new Date(i.next_due!).toLocaleDateString()}`, detail: `${i.client} — SN ${i.serial}. Offer a recalibration booking.`, services: ["calibration" as const], value_estimate: 900, due_at: i.next_due, source_ref: `ins-due:${i.id}:${i.next_due?.slice(0, 10)}`, prospect: { name: i.client } })),
    ),
});
