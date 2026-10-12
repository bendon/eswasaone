/**
 * Field store (gap 08): visits and samples shared by the Field PWA, Institution and Service portals.
 * Every visit transition runs through workflow/engine with visitDef(type) and syncs Approvals tasks.
 * Parent modules (certification, metrology, CRM) register hooks so a closed visit or a sample result
 * moves the parent record on (R-V4) without this store importing them.
 *
 * TODO: wire real — add to contracts/openapi.yaml first:
 *   GET/POST /field/visits, GET /field/visits/{id}, POST /field/visits/{id}/act {action, expected_state, reason, payload},
 *   PUT /field/visits/{id}/captures (checklist, findings, photos, signatures, cal points; Idempotency-Key),
 *   GET /field/me/visits, GET/POST /field/samples, POST /field/samples/{id}/custody {action, seal},
 *   POST /field/visits/{id}/confirm | reschedule (customer).
 */
import { demoDataEnabled } from "../demo";
import { notifySafe } from "../notify/store";
import { createLocalStore, isoIn, nowIso } from "../store/localStore";
import { DEMO_STAFF, onLeave, staffByName, type StaffMember } from "../tasks/staff";
import { openTask, reconcileTasks, syncRecordTasks, taskStore } from "../tasks/store";
import { allowedActions, applyTransition, SUPER_ROLES } from "../workflow/engine";
import type { ActInput, ActionOption, Actor } from "../workflow/types";
import { CHECKLISTS, VISIT_TYPES, visitDef } from "./defs";
import { seedSamples, seedVisits } from "./seed";
import type { CalPoint, ChecklistItem, FieldVisit, Sample, VisitFinding, VisitParentRef, VisitSignature, VisitType } from "./types";

type FieldState = { v: 1; seq: number; visits: Record<string, FieldVisit>; samples: Record<string, Sample> };

export const fieldStore = createLocalStore<FieldState>({
  key: "eswasaone.field.v1",
  v: 1,
  seed: () => ({
    v: 1,
    seq: 160,
    visits: Object.fromEntries(seedVisits().map((v) => [v.id, v])),
    samples: Object.fromEntries(seedSamples().map((s) => [s.id, s])),
  }),
});

/* ---------------- parent hooks (R-V4) ---------------- */

export type VisitParentHook = {
  /** Visit closed by the reviewer — advance the parent. */
  onClosed?: (v: FieldVisit, actor: Actor) => void;
  onAborted?: (v: FieldVisit, actor: Actor) => void;
  onCancelled?: (v: FieldVisit, actor: Actor) => void;
  onSubmitted?: (v: FieldVisit, actor: Actor) => void;
  /** Extra eligibility for a team member (competence, impartiality, rotation). Return a reason to block. */
  eligibility?: (v: FieldVisit, person: StaffMember) => string | null;
};

export type SampleParentHook = { onResult?: (s: Sample) => void; onReceived?: (s: Sample) => void };

/** Sends a received sample to the lab; returns the test request id. Registered by the metrology store. */
export type LabRouter = (s: Sample, actor: Actor) => string;

const visitHooks = new Map<string, VisitParentHook>();
const sampleHooks = new Map<string, SampleParentHook>();
let labRouter: LabRouter | null = null;

export function registerVisitParent(doctype: string, hook: VisitParentHook): void {
  visitHooks.set(doctype, hook);
}
export function registerSampleParent(doctype: string, hook: SampleParentHook): void {
  sampleHooks.set(doctype, hook);
}
export function registerLabRouter(fn: LabRouter): void {
  labRouter = fn;
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn("[field] parent hook failed", e);
  }
};

/* ---------------- tasks ---------------- */

function sync(v: FieldVisit, by?: string, outcome?: string) {
  syncRecordTasks({
    def: visitDef(v.type),
    rec: v,
    name: v.id,
    title: v.title,
    link: `/field/visits/${v.id}`,
    module: VISIT_TYPES[v.type].module,
    by,
    outcome,
    facts: { Type: VISIT_TYPES[v.type].label, Client: v.client, Date: new Date(v.planned_date).toLocaleDateString(), ...(v.lead ? { Lead: v.lead } : {}) },
  });
}

let reconciled = false;
function reconcile(s: FieldState) {
  if (reconciled) return;
  reconciled = true;
  for (const type of Object.keys(VISIT_TYPES) as VisitType[]) {
    reconcileTasks(
      visitDef(type),
      Object.values(s.visits)
        .filter((v) => v.type === type)
        .map((v) => ({ rec: v, name: v.id, title: v.title, link: `/field/visits/${v.id}`, module: VISIT_TYPES[type].module })),
    );
  }
  // Samples handed over but not yet received at the lab: a receipt task for the lab (§3.12 Sample).
  const known = Object.keys(taskStore.read().tasks);
  for (const smp of Object.values(s.samples)) if (smp.state === "In Transit" && !known.some((k) => k.startsWith(`Sample|${smp.id}|`))) receiptTask(smp);
}

function receiptTask(smp: Sample) {
  safe(() =>
    openTask({
      doctype: "Sample",
      name: smp.id,
      state: "In Transit",
      seq: smp.custody.length,
      family: "do",
      verb: "task",
      role: "Eswasa Lab Analyst",
      title: `Receive sample ${smp.seal} — ${smp.product}`,
      module: "Metrology",
      link: "/field/receipt",
      sla_days: 1,
      facts: { Seal: smp.seal, From: smp.collected_by, Parent: smp.parent?.label ?? "—" },
    }),
  );
}

/* ---------------- reads ---------------- */

export type VisitFilter = { type?: VisitType | ""; state?: string; parent?: string; person?: string; module?: string; client_email?: string };

export function listVisits(f: VisitFilter = {}): FieldVisit[] {
  // TODO: wire real — GET /field/visits (Core currently exposes /field/me/* and visit act only).
  if (!demoDataEnabled()) return [];
  fieldStore.guard("Field visits");
  reconcile(fieldStore.read());
  const email = f.client_email?.toLowerCase();
  return fieldStore.view((s) =>
    Object.values(s.visits)
      .filter((v) => !f.type || v.type === f.type)
      .filter((v) => !f.state || v.state === f.state)
      .filter((v) => !f.parent || v.parent?.name === f.parent)
      .filter((v) => !f.module || VISIT_TYPES[v.type].module === f.module)
      .filter((v) => !f.person || v.lead === f.person || v.team.includes(f.person))
      .filter((v) => !email || v.client_email === "demo" || v.client_email.toLowerCase() === email)
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
  );
}

export function getVisit(id: string): FieldVisit | null {
  if (!demoDataEnabled()) return peekVisit(id);
  fieldStore.guard("Field visit");
  reconcile(fieldStore.read());
  return fieldStore.view((s) => s.visits[id] ?? null);
}

export function peekVisit(id: string): FieldVisit | null {
  return fieldStore.view((s) => s.visits[id] ?? null);
}

export function visitsFor(parentName: string): FieldVisit[] {
  return fieldStore.view((s) => Object.values(s.visits).filter((v) => v.parent?.name === parentName).sort((a, b) => a.planned_date.localeCompare(b.planned_date)));
}

/** R-V2: confirmed visits whose date passed without a check-in. */
export function overdueCheckIn(v: Pick<FieldVisit, "state" | "planned_date" | "checkin">): boolean {
  return v.state === "Confirmed" && !v.checkin && new Date(v.planned_date).getTime() < Date.now() - 2 * 3_600_000;
}

/* ---------------- workflow ---------------- */

export function visitActions(id: string, actor: Actor): ActionOption[] {
  const v = fieldStore.read().visits[id];
  if (!v) return [];
  return allowedActions(visitDef(v.type), v, actor).map((a) => {
    let why = a.disabledReason;
    if (a.action === "submit") {
      const cfg = VISIT_TYPES[v.type];
      if (cfg.body.includes("checklist") && v.checklist.some((c) => !c.answer)) why ??= `Answer every checklist item first (${v.checklist.filter((c) => !c.answer).length} left).`;
      if (cfg.confirm && !v.signatures.some((x) => x.role === "client")) why ??= "Capture the client representative's signature at the closing meeting.";
      if (cfg.body.includes("samples") && v.type === "market_sampling" && !v.sample_ids.length) why ??= "Collect at least one sample, or abort the visit with a reason.";
    }
    if (a.action === "check_in" && !v.pack) why ??= "Download the visit pack first (it freezes the checklist).";
    return { ...a, disabledReason: why };
  });
}

function isSuper(actor: Actor) {
  return actor.roles.some((r) => SUPER_ROLES.includes(r));
}

export async function actOnVisit(id: string, action: string, actor: Actor, input: ActInput): Promise<FieldVisit> {
  fieldStore.guard("Visit actions");
  const block = visitActions(id, actor).find((a) => a.action === action)?.disabledReason;
  if (block && !(isSuper(actor) && action !== "close" && action !== "return")) throw new Error(block);
  const v = fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (!v) throw new Error("Visit not found.");
    const def = visitDef(v.type);
    const res = applyTransition(def, v, action, actor, input);
    const p = input.payload ?? {};
    switch (action) {
      case "assign":
        v.lead = p.lead;
        v.team = (p.team ?? "").split(",").map((x) => x.trim()).filter((x) => x && x !== p.lead);
        if (p.planned_date) v.planned_date = new Date(p.planned_date).toISOString();
        if (p.auditor_days) v.auditor_days = Number(p.auditor_days);
        res.event.note = `Lead ${v.lead}${v.team.length ? `; team ${v.team.join(", ")}` : ""}`;
        break;
      case "decline":
        v.lead = undefined;
        v.team = [];
        break;
      case "accept":
        if (!VISIT_TYPES[v.type].confirm) {
          v.state = "Confirmed";
          res.event.to = "Confirmed";
          res.event.note = "Unannounced visit — no customer confirmation.";
        }
        break;
      case "reschedule":
        v.planned_date = new Date(p.planned_date).toISOString();
        v.reschedule_request = undefined;
        v.customer_confirmed_at = undefined;
        if (!VISIT_TYPES[v.type].confirm) {
          v.state = v.lead ? "Confirmed" : "Planned";
          res.event.to = v.state;
        }
        break;
      case "confirm_date":
        v.customer_confirmed_at = nowIso();
        break;
      case "abort":
        v.abort = { code: (p.code as NonNullable<FieldVisit["abort"]>["code"]) || "other", reason: input.reason ?? "", at: nowIso(), evidence: p.evidence };
        break;
      case "close":
      case "return":
        v.review = { by: actor.name, at: nowIso(), outcome: action === "close" ? "closed" : "returned", note: input.reason ?? input.note };
        break;
      default:
        break;
    }
    return v;
  });
  sync(v, actor.name, action);
  const hook = v.parent ? visitHooks.get(v.parent.doctype) : undefined;
  if (v.state === "Closed") safe(() => hook?.onClosed?.(v, actor));
  if (v.state === "Aborted") safe(() => hook?.onAborted?.(v, actor));
  if (v.state === "Cancelled") safe(() => hook?.onCancelled?.(v, actor));
  if (v.state === "Submitted") safe(() => hook?.onSubmitted?.(v, actor));
  if (v.client_email && (action === "accept" || action === "reschedule") && v.state === "Accepted")
    notifySafe({ audience: "customer", to: v.client_email, kind: "audit", ref: v.id, title: `Please confirm your ${VISIT_TYPES[v.type].label.toLowerCase()} date`, body: `${v.title} is proposed for ${new Date(v.planned_date).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })} with ${v.lead ?? "our team"}. Confirm the date or ask for another from your account.`, link: "/account/visits", channel: ["email", "sms", "portal"] });
  return v;
}

/* ---------------- planning (Institution) ---------------- */

export type PlanVisitInput = {
  type: VisitType;
  title: string;
  parent?: VisitParentRef;
  client: string;
  client_email: string;
  site: FieldVisit["site"];
  planned_date: string;
  duration_days?: number;
  auditor_days?: number;
  scope?: string;
};

export function planVisit(input: PlanVisitInput, actor: Actor): FieldVisit {
  fieldStore.guard("Plan visit");
  const v = fieldStore.mutate((s) => {
    s.seq += 1;
    const id = `FV-26-${String(s.seq).padStart(4, "0")}`;
    const tpl = CHECKLISTS[VISIT_TYPES[input.type].checklist];
    const v: FieldVisit = {
      id,
      state: "Planned",
      seq: 1,
      history: [{ at: nowIso(), actor: actor.name, action: "Planned", to: "Planned", note: input.parent ? `For ${input.parent.label}` : undefined }],
      duration_days: 1,
      team: [],
      created_at: nowIso(),
      created_by: actor.name,
      checklist_version: tpl.version,
      checklist: tpl.items.map((i) => ({ ...i })),
      findings: [],
      notes: "",
      photos: [],
      signatures: [],
      cal_points: [],
      sample_ids: [],
      ...input,
    };
    s.visits[id] = v;
    return v;
  });
  sync(v, actor.name);
  return v;
}

export type Eligibility = { name: string; title: string; ok: boolean; why?: string; load: number; disciplines: string[] };

/** Team picker eligibility: role/discipline, leave, workload, plus the parent module's checks (§5.7). */
export function eligibleTeam(visitId: string): Eligibility[] {
  const s = fieldStore.read();
  const v = s.visits[visitId];
  if (!v) return [];
  const hook = v.parent ? visitHooks.get(v.parent.doctype) : undefined;
  const open = (name: string) => Object.values(s.visits).filter((x) => (x.lead === name || x.team.includes(name)) && !["Closed", "Cancelled"].includes(x.state)).length;
  const fieldRole: Record<string, string[]> = {
    Certification: ["Certification Auditor", "Technical Reviewer"],
    Metrology: ["Eswasa Metrology Officer"],
    Field: ["Eswasa Inspector", "Certification Auditor"],
    CRM: ["Eswasa Inspector", "Certification Auditor"],
  };
  const roles = fieldRole[VISIT_TYPES[v.type].module] ?? ["Certification Auditor"];
  return DEMO_STAFF.filter((p) => p.roles.some((r) => roles.includes(r))).map((p) => {
    const load = open(p.name);
    let why: string | undefined;
    if (onLeave(p, new Date(v.planned_date)) || onLeave(p)) why = `On leave (${p.leave?.note ?? "leave"})`;
    else if (load >= Math.ceil(p.cap / 2)) why = `Workload: ${load} open visits`;
    else why = hook?.eligibility?.(v, p) ?? undefined;
    return { name: p.name, title: p.title, ok: !why, why, load, disciplines: p.disciplines ?? [] };
  });
}

/* ---------------- customer (Service) ---------------- */

export async function customerConfirmVisit(id: string, who: string): Promise<FieldVisit> {
  fieldStore.guard("Visit confirmation");
  const v = fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (!v) throw new Error("Visit not found.");
    if (v.state !== "Accepted") throw new Error("This visit isn't waiting for your confirmation any more.");
    v.state = "Confirmed";
    v.seq += 1;
    v.customer_confirmed_at = nowIso();
    v.reschedule_request = undefined;
    v.history.push({ at: nowIso(), actor: `${who} (customer)`, action: "Confirmed the date", from: "Accepted", to: "Confirmed" });
    return v;
  });
  sync(v, who, "Customer confirmed");
  if (v.lead) notifySafe({ audience: "staff", to: v.lead, kind: "audit", ref: v.id, title: `Date confirmed — ${v.title}`, body: `${v.client} confirmed ${new Date(v.planned_date).toLocaleString()}. Download the visit pack before you travel.`, link: `/field/visits/${v.id}` });
  return v;
}

export async function customerRequestReschedule(id: string, proposed: string, reason: string, who: string): Promise<FieldVisit> {
  fieldStore.guard("Reschedule request");
  if (!reason.trim()) throw new Error("Tell us why the date doesn't work.");
  const v = fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (!v) throw new Error("Visit not found.");
    v.reschedule_request = { at: nowIso(), proposed: new Date(proposed).toISOString(), reason };
    v.history.push({ at: nowIso(), actor: `${who} (customer)`, action: "Asked for another date", reason, note: `Proposed ${new Date(proposed).toLocaleDateString()}` });
    return v;
  });
  safe(() =>
    openTask({ doctype: "Field Visit", name: v.id, state: "Reschedule requested", seq: v.history.length, family: "do", verb: "task", role: VISIT_TYPES[v.type].planners[0], title: `Customer asked to reschedule — ${v.title}`, module: VISIT_TYPES[v.type].module, link: `/field/visits/${v.id}`, sla_days: 2, facts: { Proposed: new Date(proposed).toLocaleDateString(), Reason: reason } }),
  );
  return v;
}

/* ---------------- captures (Field PWA) ---------------- */

function capture(id: string, fn: (v: FieldVisit) => void, actor: Actor, what: string): FieldVisit {
  fieldStore.guard("Visit capture");
  return fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (!v) throw new Error("Visit not found.");
    if (!["Confirmed", "In Progress", "Returned"].includes(v.state)) throw new Error(`You can't change the report while the visit is ${v.state}.`);
    fn(v);
    v.history.push({ at: nowIso(), actor: actor.name, action: what });
    return v;
  });
}

/** Download the pack: freezes the checklist version for this visit (F4). */
export function downloadPack(id: string, actor: Actor): FieldVisit {
  return fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (!v) throw new Error("Visit not found.");
    if (!v.pack) {
      const open = Object.values(s.samples).filter((x) => x.parent?.name === v.parent?.name && x.state !== "Result").map((x) => x.seal);
      v.pack = { downloaded_at: nowIso(), summary: v.scope ?? v.title, previous_ncs: [], open_samples: open };
      v.history.push({ at: nowIso(), actor: actor.name, action: `Downloaded visit pack (checklist ${v.checklist_version} frozen)` });
    }
    return v;
  });
}

export function saveChecklist(id: string, items: ChecklistItem[], actor: Actor): FieldVisit {
  return capture(id, (v) => (v.checklist = items), actor, "Saved checklist");
}

export function addVisitFinding(id: string, f: Omit<VisitFinding, "id">, actor: Actor): FieldVisit {
  if (!f.statement.trim()) throw new Error("Write the finding statement.");
  return capture(id, (v) => v.findings.push({ ...f, id: `F-${v.findings.length + 1}` }), actor, `Raised ${f.severity} finding (${f.clause})`);
}

export function removeVisitFinding(id: string, fid: string, actor: Actor): FieldVisit {
  return capture(id, (v) => (v.findings = v.findings.filter((x) => x.id !== fid)), actor, "Removed a finding");
}

/** Cheap integrity hash so the photo shows a check mark (P2 photo hashing). TODO: wire real — SHA-256 in a worker. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function addVisitPhoto(id: string, p: { name: string; caption?: string; url?: string }, actor: Actor): FieldVisit {
  return capture(id, (v) => v.photos.push({ id: `P-${v.photos.length + 1}`, at: nowIso(), name: p.name, caption: p.caption, url: p.url, hash: hashText(`${p.name}${p.url?.slice(0, 2000) ?? ""}${Date.now()}`) }), actor, `Added photo ${p.name}`);
}

export function saveVisitNotes(id: string, notes: string, actor: Actor): FieldVisit {
  return capture(id, (v) => (v.notes = notes), actor, "Updated notes");
}

export function addSignature(id: string, sig: Omit<VisitSignature, "at">, actor: Actor): FieldVisit {
  if (!sig.name.trim()) throw new Error("Type the name of the person signing.");
  return capture(id, (v) => (v.signatures = [...v.signatures.filter((x) => x.role !== sig.role || sig.role === "team"), { ...sig, at: nowIso() }]), actor, `Signed by ${sig.name} (${sig.role})`);
}

export function saveCalPoints(id: string, points: CalPoint[], actor: Actor): FieldVisit {
  return capture(id, (v) => (v.cal_points = points), actor, `Saved ${points.length} calibration points`);
}

export function checkIn(id: string, gps: { lat: number; lng: number; accuracy: number }, actor: Actor): Promise<FieldVisit> {
  const v = fieldStore.read().visits[id];
  if (!v) throw new Error("Visit not found.");
  fieldStore.mutate((s) => {
    s.visits[id].checkin = { at: nowIso(), ...gps, by: actor.name };
  });
  return actOnVisit(id, "check_in", actor, { expected_state: v.state, note: `GPS ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} ±${Math.round(gps.accuracy)} m` });
}

export function linkClaim(id: string, claimRef: string): void {
  fieldStore.mutate((s) => {
    if (s.visits[id]) s.visits[id].claim_ref = claimRef;
  });
}

export function flagConflict(id: string, detail: string): void {
  fieldStore.mutate((s) => {
    if (s.visits[id]) s.visits[id].conflict = { at: nowIso(), detail };
  });
  safe(() => {
    const v = fieldStore.read().visits[id];
    openTask({ doctype: "Field Visit", name: id, state: "Sync conflict", seq: v.history.length + 100, family: "alert", role: VISIT_TYPES[v.type].planners[0], title: `Sync conflict on ${v.title}`, module: "Field", link: `/field/visits/${id}`, sla_days: 1, facts: { Detail: detail } });
  });
}

export function resolveConflict(id: string, actor: Actor, note: string): void {
  fieldStore.mutate((s) => {
    const v = s.visits[id];
    if (v?.conflict) {
      v.conflict.resolved = true;
      v.history.push({ at: nowIso(), actor: actor.name, action: "Resolved sync conflict", note });
    }
  });
}

/* ---------------- samples & chain of custody ---------------- */

export function listSamples(f: { holder?: string; state?: string; parent?: string; visit?: string } = {}): Sample[] {
  // TODO: wire real — GET /field/samples.
  if (!demoDataEnabled()) return [];
  fieldStore.guard("Samples");  reconcile(fieldStore.read());
  return fieldStore.view((s) =>
    Object.values(s.samples)
      .filter((x) => !f.holder || x.holder === f.holder || x.collected_by === f.holder)
      .filter((x) => !f.state || x.state === f.state)
      .filter((x) => !f.parent || x.parent?.name === f.parent)
      .filter((x) => !f.visit || x.visit_id === f.visit)
      .sort((a, b) => b.collected_at.localeCompare(a.collected_at)),
  );
}

export function sampleBySeal(seal: string): Sample | null {
  const t = seal.trim().toUpperCase();
  return fieldStore.view((s) => Object.values(s.samples).find((x) => x.seal.toUpperCase() === t || x.id.toUpperCase() === t) ?? null);
}

export function collectSample(
  visitId: string,
  input: { seal: string; product: string; brand?: string; batch?: string; quantity: string; split: Sample["split"]; witness?: string; photo?: string; gps?: { lat: number; lng: number } },
  actor: Actor,
): Sample {
  fieldStore.guard("Sample collection");
  if (!input.seal.trim()) throw new Error("Scan or type the seal number.");
  if (!input.product.trim()) throw new Error("Describe the product.");
  if (sampleBySeal(input.seal)) throw new Error(`Seal ${input.seal} is already used on another sample.`);
  return fieldStore.mutate((s) => {
    const v = s.visits[visitId];
    if (!v) throw new Error("Visit not found.");
    if (!["In Progress", "Returned"].includes(v.state)) throw new Error("Check in before collecting samples.");
    s.seq += 1;
    const id = `SMP-26-${String(400 + s.seq).padStart(4, "0")}`;
    const smp: Sample = {
      id,
      seal: input.seal.trim().toUpperCase(),
      visit_id: visitId,
      parent: v.parent,
      product: input.product,
      brand: input.brand,
      batch: input.batch,
      quantity: input.quantity,
      split: input.split,
      collected_by: actor.name,
      collected_at: nowIso(),
      witness: input.witness,
      photo: input.photo,
      state: "Collected",
      holder: actor.name,
      custody: [{ at: nowIso(), actor: actor.name, action: "Collected and sealed", gps: input.gps, note: input.witness ? `Witness: ${input.witness}` : undefined }],
    };
    s.samples[id] = smp;
    v.sample_ids.push(id);
    v.history.push({ at: nowIso(), actor: actor.name, action: `Collected sample ${smp.seal}` });
    return smp;
  });
}

export function handOverSample(seal: string, actor: Actor, to = "Lab reception"): Sample {
  fieldStore.guard("Sample hand-over");
  const smp = fieldStore.mutate((s) => {
    const smp = Object.values(s.samples).find((x) => x.seal.toUpperCase() === seal.trim().toUpperCase());
    if (!smp) throw new Error(`No sample with seal ${seal}.`);
    if (smp.state !== "Collected") throw new Error(`Sample ${smp.seal} is already ${smp.state.toLowerCase()}.`);
    smp.state = "In Transit";
    smp.holder = to;
    smp.custody.push({ at: nowIso(), actor: actor.name, action: `Handed over to ${to}` });
    return smp;
  });
  receiptTask(smp);
  return smp;
}

export function receiveSample(seal: string, condition: NonNullable<Sample["condition"]>, actor: Actor, note?: string): Sample {
  fieldStore.guard("Sample receipt");
  const smp = fieldStore.mutate((s) => {
    const smp = Object.values(s.samples).find((x) => x.seal.toUpperCase() === seal.trim().toUpperCase());
    if (!smp) throw new Error(`No sample with seal ${seal}. Check the label or log it as a mismatch.`);
    if (!["In Transit", "Collected"].includes(smp.state)) throw new Error(`Sample ${smp.seal} was already received.`);
    smp.condition = condition;
    smp.holder = "Lab reception";
    if (condition === "ok") {
      smp.state = "Received";
      smp.custody.push({ at: nowIso(), actor: actor.name, action: "Received — seal intact", note });
    } else {
      smp.state = "Rejected";
      smp.custody.push({ at: nowIso(), actor: actor.name, action: `Rejected at receipt (${condition.replace("_", " ")})`, note });
    }
    return smp;
  });
  safe(() => taskStore.mutate((s) => {
    for (const t of Object.values(s.tasks)) if (t.doctype === "Sample" && t.name === smp.id && !t.closed_at) Object.assign(t, { closed_at: nowIso(), closed_by: actor.name, outcome: smp.state });
  }));
  if (smp.state === "Rejected")
    safe(() => openTask({ doctype: "Sample", name: smp.id, state: "Rejected", seq: smp.custody.length, family: "alert", role: "Quality Manager", title: `Sample ${smp.seal} rejected at lab receipt (${condition.replace("_", " ")})`, module: "Metrology", link: "/field/receipt", sla_days: 1, priority: "high", facts: { Collected: smp.collected_by, Note: note ?? "—" } }));
  if (smp.parent) safe(() => sampleHooks.get(smp.parent!.doctype)?.onReceived?.(smp));
  return smp;
}

export function sendSampleToLab(id: string, actor: Actor, tests?: string): Sample {
  if (!labRouter) throw new Error("The laboratory isn't available in this portal yet.");
  const cur = fieldStore.read().samples[id];
  if (!cur) throw new Error("Sample not found.");
  if (cur.state !== "Received") throw new Error("Receive the sample before sending it for testing.");
  const tr = labRouter({ ...cur, tests: tests ?? cur.tests }, actor);
  return fieldStore.mutate((s) => {
    const smp = s.samples[id];
    smp.state = "Testing";
    smp.test_request_id = tr;
    smp.tests = tests ?? smp.tests;
    smp.holder = "LIMS";
    smp.custody.push({ at: nowIso(), actor: actor.name, action: `Sent for testing (${tr})` });
    return smp;
  });
}

/** Called by the LIMS when the Technical Manager approves a result (R-V4 trigger). */
export function recordSampleResult(id: string, result: "pass" | "fail", note: string, by: string): void {
  const smp = fieldStore.mutate((s) => {
    const smp = s.samples[id];
    if (!smp) return null;
    smp.state = "Result";
    smp.result = result;
    smp.result_note = note;
    smp.holder = "Retained store";
    smp.custody.push({ at: nowIso(), actor: by, action: `Result approved: ${result}`, note });
    return smp;
  });
  if (smp?.parent) safe(() => sampleHooks.get(smp.parent!.doctype)?.onResult?.(smp));
}

export async function resetFieldDemo(): Promise<void> {
  fieldStore.reset();
  reconciled = false;
}

export const visitTypeLabel = (t: VisitType) => VISIT_TYPES[t].label;
export const nextVisitDate = (days: number) => isoIn(days, 8);
export { staffByName };
