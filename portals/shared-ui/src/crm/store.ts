/**
 * CRM & service-desk data layer shared by the Service and Institution portals.
 *
 * Demo mode uses a local store shared across portals. With VITE_DEMO_MODE=false, reads go to
 * Core where endpoints exist (/crm/leads, /crm/deals, /crm/pipeline); case/client/signal screens
 * return empty lists until Complaint / client APIs land (see TODO).
 *
 * TODO: wire real — provisional endpoints:
 *   POST /cases · GET /cases · GET|PATCH /cases/{ref} · POST /cases/{ref}/act · POST /cases/{ref}/messages
 *   POST /cases/lookup · GET /crm/clients · GET /crm/clients/{id} · GET|PATCH /crm/signals
 *   GET|POST|PATCH /crm/opportunities · GET|POST|PATCH /crm/quotes · GET|PUT /crm/config
 */
import { DEFAULT_CONFIG } from "./config";
import { canTransition, findTransition, type CaseActionId } from "./caseFlow";
import { workingDaysBetween } from "./sla";
import { notifyCaseCustomer, reconcileCaseTasks, syncCaseTasks } from "./caseTasks";
import { SEED_CASES, SEED_CLIENTS, SEED_OPPORTUNITIES, SEED_QUOTES, SEED_SIGNALS } from "./seed";
import type {
  CampaignDraft,
  Case,
  CaseLink,
  CaseMessage,
  CaseReporter,
  CaseState,
  CaseSubject,
  CaseType,
  CaseChannel,
  Client,
  CrmActor,
  CrmConfig,
  CrmQuote,
  Opportunity,
  OpportunityStage,
  Signal,
  KbArticle,
  MessageDelivery,
  ServiceContract,
  SignalRules,
  Contact,
  CasePriority,
  AccountPlan,
  NpsSurvey,
  NpsTrigger,
} from "./types";
import { apiFetch } from "../api/client";
import { demoDataEnabled } from "../demo";
import { createInvoice } from "../billing/store";
import { planVisit, registerSampleParent, registerVisitParent } from "../field/store";
import type { VisitType } from "../field/types";
import { notifySafe } from "../notify/store";
import { openTask } from "../tasks/store";
import { DEMO_STAFF } from "../tasks/staff";
import { SEED_KB, SEED_CONTRACTS, DEFAULT_SIGNAL_RULES } from "./seedExtras";

/* ---------------- mode ---------------- */

export function crmDemoMode(): boolean {
  return demoDataEnabled();
}

export class CrmNotConnectedError extends Error {
  constructor(what = "This") {
    super(`${what} isn't connected to ESWASA's case and client system yet.`);
    this.name = "CrmNotConnectedError";
  }
}

function guard(what: string): void {
  if (!crmDemoMode()) throw new CrmNotConnectedError(what);
}

/* ---------------- store ---------------- */

type Store = {
  v: 1;
  seq: number;
  cases: Record<string, Case>;
  clients: Record<string, Client>;
  signals: Record<string, Signal>;
  opportunities: Record<string, Opportunity>;
  quotes: Record<string, CrmQuote>;
  config: CrmConfig;
  /* Added for gap 04 — created lazily so existing demo data survives (ensureExtras). */
  kb?: Record<string, KbArticle>;
  contracts?: Record<string, ServiceContract>;
  deliveries?: Record<string, MessageDelivery>;
  campaigns?: Record<string, CampaignDraft>;
  signal_rules?: SignalRules;
  /* 04 P3 */
  account_plans?: Record<string, AccountPlan>;
  nps?: Record<string, NpsSurvey>;
};

const KEY = "eswasaone.crm.v1";
const MINE_KEY = "eswasaone.crm.mine";

function seeded(): Store {
  const byId = <T,>(rows: T[], key: (r: T) => string) => Object.fromEntries(rows.map((r) => [key(r), r]));
  return {
    v: 1,
    seq: 142,
    cases: byId(structuredClone(SEED_CASES), (c) => c.ref),
    clients: byId(structuredClone(SEED_CLIENTS), (c) => c.id),
    signals: byId(structuredClone(SEED_SIGNALS), (s) => s.id),
    opportunities: byId(structuredClone(SEED_OPPORTUNITIES), (o) => o.id),
    quotes: byId(structuredClone(SEED_QUOTES), (q) => q.id),
    config: structuredClone(DEFAULT_CONFIG),
  };
}

let cache: Store | null = null;

function read(): Store {
  if (cache) return cache;
  let s: Store | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw) as Store;
  } catch {
    s = null;
  }
  if (!s || s.v !== 1) {
    s = seeded();
    persist(s);
  }
  cache = ensureExtras(autoClose(s));
  reconcileCaseTasks(Object.values(cache.cases));
  return cache;
}

function persist(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode: session-only */
  }
}

/* change notifications (same tab + other tabs) */
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeCrm(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function crmVersion(): number {
  return version;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      emit();
    }
  });
}

function mutate<T>(fn: (s: Store) => T): T {
  const s = read();
  const out = fn(s);
  persist(s);
  emit();
  // Hand out copies so React never holds a reference the store mutates later.
  return out === undefined ? out : structuredClone(out);
}

/** Reset demo data to the seed (Settings → Reset demo data). */
export async function resetCrmDemo(): Promise<void> {
  guard("Reset");
  cache = seeded();
  persist(cache);
  emit();
}

/* ---------------- helpers ---------------- */

const now = () => new Date().toISOString();

function nextRef(s: Store, prefix: string): string {
  s.seq += 1;
  const yy = String(new Date().getFullYear()).slice(2);
  return `${prefix}-${yy}-${String(s.seq).padStart(4, "0")}`;
}

function accessCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "TRK";
  for (let i = 0; i < 5; i += 1) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

function addMsg(c: Case, m: Omit<CaseMessage, "id" | "at">) {
  c.thread.push({ ...m, id: `${c.ref}-m${c.thread.length + 1}-${Date.now() % 10000}`, at: now() });
}

/** Resolved cases close automatically after the reopen window (confirmation pack F10). */
function autoClose(s: Store): Store {
  const days = s.config.reopen_days;
  for (const c of Object.values(s.cases)) {
    if (c.state === "Resolved" && c.resolved_at) {
      const age = (Date.now() - new Date(c.resolved_at).getTime()) / 86_400_000;
      if (age > days) {
        c.state = "Closed";
        c.closed_at = now();
        c.events.push({ at: now(), actor: "System", action: "Auto-close", from: "Resolved", to: "Closed", note: `No response within ${days} days` });
      }
    }
  }
  return s;
}

function normalise(v: string | undefined): string {
  return (v ?? "").toLowerCase().replace(/[\s+()-]/g, "");
}

function rememberMine(ref: string) {
  try {
    const list = JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]") as string[];
    if (!list.includes(ref)) localStorage.setItem(MINE_KEY, JSON.stringify([ref, ...list].slice(0, 50)));
  } catch {
    /* ignore */
  }
}

/** Case references lodged from this browser (anonymous / signed-out customers). */
export function myCaseRefs(): string[] {
  return mineRefs();
}

function mineRefs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Customer-safe copy: no internal notes. */
export function publicCase(c: Case): Case {
  const x = structuredClone(c);
  return { ...x, thread: x.thread.filter((m) => m.visibility === "public"), panel: undefined, decision_maker: undefined };
}

/* ---------------- routing / triage ---------------- */

export function routeCase(
  cfg: CrmConfig,
  input: { type: CaseType; subject: string; description: string; sector?: string },
): { team: string; priority: Case["priority"]; rule?: string } {
  let team = cfg.case_types[input.type].team;
  let priority: Case["priority"] = input.type === "mark_misuse" ? "high" : "normal";
  let rule: string | undefined;
  const text = `${input.subject} ${input.description}`;
  for (const r of cfg.routing) {
    if (!r.enabled) continue;
    if (r.when.type && r.when.type !== input.type) continue;
    if (r.when.sector && r.when.sector !== input.sector) continue;
    if (r.when.keyword) {
      let re: RegExp;
      try {
        re = new RegExp(r.when.keyword, "i");
      } catch {
        continue;
      }
      if (!re.test(text)) continue;
    }
    team = r.team;
    if (r.priority) priority = r.priority;
    rule = r.label;
    break;
  }
  return { team, priority, rule };
}

/* ---------------- cases: public ---------------- */

export type LodgeCaseInput = {
  type: CaseType;
  subject: string;
  description: string;
  channel: CaseChannel;
  reporter: CaseReporter;
  about?: CaseSubject;
  incident_date?: string;
  location?: string;
  attachments?: string[];
  /** Staff-logged cases (phone / walk-in) carry the agent's name. */
  logged_by?: string;
};

export async function lodgeCase(input: LodgeCaseInput): Promise<Case> {
  guard("Lodging a case");
  const c = mutate((s) => {
    const client = input.about?.client_id ? s.clients[input.about.client_id] : undefined;
    const { team, priority, rule } = routeCase(s.config, { ...input, sector: client?.sector });
    const ref = nextRef(s, "CS");
    const who = input.reporter.anonymous ? "Anonymous" : input.reporter.name || "Customer";
    const created = now();
    const c: Case = {
      ref,
      type: input.type,
      subject: input.subject.trim(),
      description: input.description.trim(),
      state: "Open",
      priority,
      channel: input.channel,
      team,
      created_at: created,
      updated_at: created,
      about: input.about,
      client_id: input.about?.client_id,
      reporter: input.reporter,
      access_code: accessCode(),
      incident_date: input.incident_date,
      location: input.location,
      sector: client?.sector,
      region: client?.region,
      thread: [],
      events: [{ at: created, actor: input.logged_by ?? who, action: input.logged_by ? `Logged (${input.channel.replace("_", " ")})` : "Submitted", to: "Open" }],
      links: [],
      tags: [],
      reopen_count: 0,
      paused_wd: 0,
    };
    addMsg(c, { author: who, role: "customer", visibility: "public", body: c.description, attachments: input.attachments });
    addMsg(c, {
      author: "ESWASA",
      role: "system",
      visibility: "public",
      body: `We have received your ${s.config.case_types[c.type].short.toLowerCase()} (reference ${ref}). Our ${team} team will acknowledge it within ${s.config.case_types[c.type].ack_days} working day(s).`,
    });
    if (rule) addMsg(c, { author: "Routing", role: "system", visibility: "internal", body: `Auto-routed by rule: ${rule}` });
    s.cases[ref] = c;
    syncCaseTasks(c, who, "Lodged");
    detectRepeatComplaints(s, c);
    return c;
  });
  rememberMine(c.ref);
  return publicCase(c);
}

/** Three or more product/mark reports about one client in 60 days → compliance signal (never a sales lead). */
function detectRepeatComplaints(s: Store, c: Case) {
  if (!c.client_id || !["product_report", "mark_misuse"].includes(c.type)) return;
  const since = Date.now() - 60 * 86_400_000;
  const related = Object.values(s.cases).filter(
    (x) =>
      x.client_id === c.client_id &&
      ["product_report", "mark_misuse"].includes(x.type) &&
      new Date(x.created_at).getTime() >= since,
  );
  if (related.length < 3) return;
  const existing = Object.values(s.signals).find(
    (x) => x.kind === "repeat_complaints" && x.client_id === c.client_id && x.status === "new",
  );
  if (existing) {
    existing.detail = `${related.length} reports in 60 days (latest ${c.ref}). Route to Certification for a special surveillance visit.`;
    return;
  }
  const id = `SIG-${Date.now() % 100000}`;
  s.signals[id] = {
    id,
    kind: "repeat_complaints",
    title: `${related.length} complaints in 60 days about ${s.clients[c.client_id]?.name ?? "one client"}`,
    detail: `Latest ${c.ref}. Route to Certification for a special surveillance visit.`,
    client_id: c.client_id,
    services: [],
    value_estimate: 0,
    created_at: now(),
    status: "new",
    compliance: true,
  };
}

/** Find a case by reference + (access code | email | phone). */
export async function lookupCase(ref: string, proof: string): Promise<Case | null> {
  guard("Case tracking");
  const c = read().cases[ref.trim().toUpperCase()];
  if (!c) return null;
  // publicCase() below copies the thread; the rest is read-only here.
  const p = normalise(proof);
  if (!p) return null;
  const ok =
    p === normalise(c.access_code) ||
    (c.reporter.email && p === normalise(c.reporter.email)) ||
    (c.reporter.phone && p === normalise(c.reporter.phone));
  return ok ? publicCase(c) : null;
}

/** Cases for a signed-in customer: matched by email, plus cases lodged from this browser. */
export async function listMyCases(email?: string): Promise<Case[]> {
  guard("Your cases");
  const s = read();
  const mine = new Set(mineRefs());
  const e = normalise(email);
  return Object.values(s.cases)
    .filter((c) => mine.has(c.ref) || (e && normalise(c.reporter.email) === e))
    .map(publicCase)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function customerAct(
  ref: string,
  action: CaseActionId,
  opts: { note?: string; attachments?: string[] } = {},
): Promise<Case> {
  guard("Updating your case");
  return publicCase(
    mutate((s) => {
      const c = must(s, ref);
      const who = c.reporter.anonymous ? "Anonymous" : c.reporter.name || "Customer";
      if (action === "customer_reply" && c.state !== "Awaiting Customer") {
        // A reply outside an info request is just a message.
        addMsg(c, { author: who, role: "customer", visibility: "public", body: opts.note ?? "", attachments: opts.attachments });
        c.updated_at = now();
        return c;
      }
      applyTransition(s, c, action, who, opts.note);
      if (opts.note && action !== "dispute") {
        addMsg(c, { author: who, role: "customer", visibility: "public", body: opts.note, attachments: opts.attachments });
      }
      return c;
    }),
  );
}

export async function rateCase(ref: string, score: number, comment?: string): Promise<Case> {
  guard("Feedback");
  return publicCase(
    mutate((s) => {
      const c = must(s, ref);
      c.csat = { score, comment: comment?.trim() || undefined, at: now() };
      c.events.push({ at: now(), actor: "Customer", action: `Rated ${score}/5` });
      return c;
    }),
  );
}

/* ---------------- cases: staff ---------------- */

export type CaseFilter = {
  type?: CaseType | "all";
  state?: CaseState | "open" | "all";
  team?: string;
  assignee?: string;
  client_id?: string;
  includeAppeals?: boolean;
};

export async function listCases(f: CaseFilter = {}): Promise<Case[]> {
  // TODO: wire real — GET /cases once Complaint DocType lands (workflow registry complaint.yaml).
  if (!crmDemoMode()) return [];
  guard("Cases");
  const open = new Set(["Open", "Triaged", "In Progress", "Awaiting Customer", "Escalated", "Reopened"]);
  return structuredClone(Object.values(read().cases))
    .filter((c) => (f.includeAppeals ? true : c.type !== "appeal"))
    .filter((c) => !f.type || f.type === "all" || c.type === f.type)
    .filter((c) => !f.state || f.state === "all" || (f.state === "open" ? open.has(c.state) : c.state === f.state))
    .filter((c) => !f.team || c.team === f.team)
    .filter((c) => !f.assignee || c.assignee === f.assignee)
    .filter((c) => !f.client_id || c.client_id === f.client_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getCase(ref: string): Promise<Case | null> {
  if (!crmDemoMode()) return null;
  guard("Case");
  const c = read().cases[ref];
  return c ? structuredClone(c) : null;
}

/** Synchronous read for the Approvals preview (no guard: returns null when the store is off). */
export function peekCase(ref: string): Case | null {
  if (!crmDemoMode()) return null;
  const c = read().cases[ref];
  return c ? structuredClone(c) : null;
}

function must(s: Store, ref: string): Case {
  const c = s.cases[ref];
  if (!c) throw new Error(`Case ${ref} not found`);
  return c;
}

function applyTransition(s: Store, c: Case, action: CaseActionId, actor: string, note?: string, dupRef?: string) {
  const t = findTransition(action);
  if (!t || !canTransition(c, action)) throw new Error(`“${t?.label ?? action}” isn't allowed while the case is ${c.state}.`);
  if (t.requires === "reason" && !note?.trim()) throw new Error("A reason is required.");
  if (t.requires === "resolution" && !note?.trim()) throw new Error("A resolution note is required.");
  if (t.requires === "duplicate_ref") {
    if (!dupRef || !s.cases[dupRef] || dupRef === c.ref) throw new Error("Enter the reference of the original case.");
  }
  const from = c.state;
  const at = now();
  // SLA pause bookkeeping (Awaiting Customer pauses the clock).
  if (from === "Awaiting Customer" && c.paused_since) {
    c.paused_wd += workingDaysBetween(c.paused_since);
    c.paused_since = undefined;
  }
  if (t.to === "Awaiting Customer") c.paused_since = at;

  c.state = t.to;
  c.updated_at = at;
  c.events.push({ at, actor, action: t.label, from, to: t.to, note });

  switch (action) {
    case "triage":
      c.acknowledged_at ??= at;
      break;
    case "start":
    case "take_over":
    case "resume":
      c.assignee ??= actor;
      if (action === "take_over") c.assignee = actor;
      break;
    case "request_info":
      addMsg(c, { author: actor, role: "staff", visibility: "public", body: note ?? "" });
      break;
    case "resolve":
      c.resolution = note;
      c.resolved_at = at;
      addMsg(c, { author: actor, role: "staff", visibility: "public", body: note ?? "" });
      break;
    case "dispute":
      c.reopen_count += 1;
      c.resolved_at = undefined;
      addMsg(c, { author: actor, role: "customer", visibility: "public", body: note ?? "" });
      break;
    case "confirm":
    case "close":
    case "withdraw":
      c.closed_at = at;
      break;
    case "escalate":
      c.priority = c.priority === "urgent" ? "urgent" : "high";
      addMsg(c, { author: actor, role: "staff", visibility: "internal", body: `Escalated: ${note}` });
      break;
    case "mark_duplicate":
      c.duplicate_of = dupRef;
      c.closed_at = at;
      c.links.push({ kind: "case", ref: dupRef!, label: `Duplicate of ${dupRef}` });
      addMsg(c, {
        author: actor,
        role: "staff",
        visibility: "public",
        body: `This is being handled under case ${dupRef}. We have linked your report to it.`,
      });
      break;
    default:
      break;
  }
  syncCaseTasks(c, actor, t.label);
  notifyCaseCustomer(c, action, note);
  if (["request_info", "resolve", "mark_duplicate"].includes(action) && note) logDelivery(s, c, `${t.label} — ${c.ref}`, note);
}

export async function actOnCase(
  ref: string,
  action: CaseActionId,
  actor: CrmActor,
  opts: { note?: string; duplicate_ref?: string } = {},
): Promise<Case> {
  guard("Case actions");
  return mutate((s) => {
    const c = must(s, ref);
    applyTransition(s, c, action, actor.name, opts.note, opts.duplicate_ref?.trim().toUpperCase());
    return c;
  });
}

export async function postMessage(
  ref: string,
  actor: CrmActor,
  body: string,
  visibility: CaseMessage["visibility"],
): Promise<Case> {
  guard("Messages");
  return mutate((s) => {
    const c = must(s, ref);
    addMsg(c, { author: actor.name, role: "staff", visibility, body });
    if (visibility === "public") {
      c.acknowledged_at ??= now();
      logDelivery(s, c, `Update on your case ${c.ref}`, body);
    }
    c.updated_at = now();
    return c;
  });
}

export async function assignCase(ref: string, actor: CrmActor, assignee: string, team?: string): Promise<Case> {
  guard("Assignment");
  return mutate((s) => {
    const c = must(s, ref);
    if (c.type === "appeal" && c.decision_maker && assignee === c.decision_maker) {
      throw new Error("Impartiality: an appeal can't be assigned to the person who made the original decision.");
    }
    c.assignee = assignee;
    if (team) c.team = team;
    c.updated_at = now();
    c.events.push({ at: now(), actor: actor.name, action: `Assigned to ${assignee}${team ? ` (${team})` : ""}` });
    syncCaseTasks(c, actor.name, `Assigned to ${assignee}`);
    return c;
  });
}

export async function updateCase(
  ref: string,
  actor: CrmActor,
  patch: Partial<Pick<Case, "type" | "priority" | "team" | "tags" | "root_cause" | "client_id" | "panel">>,
): Promise<Case> {
  guard("Case update");
  return mutate((s) => {
    const c = must(s, ref);
    if (patch.panel && c.decision_maker && patch.panel.includes(c.decision_maker)) {
      throw new Error("Impartiality: the original decision-maker can't sit on the appeal panel.");
    }
    const changed = Object.keys(patch).join(", ");
    Object.assign(c, patch);
    c.updated_at = now();
    c.events.push({ at: now(), actor: actor.name, action: `Updated ${changed}` });
    return c;
  });
}

/** Hand-off: product/mark reports → surveillance investigation; service complaints → CAPA. */
export async function handOff(ref: string, actor: CrmActor, kind: "investigation" | "capa"): Promise<CaseLink> {
  guard("Hand-off");
  return mutate((s) => {
    const c = must(s, ref);
    const id = `${kind === "investigation" ? "SURV" : "CAPA"}-${String(s.seq + 20).padStart(4, "0")}`;
    s.seq += 1;
    const link: CaseLink = {
      kind,
      ref: id,
      label: kind === "investigation" ? `Surveillance investigation ${id}` : `Corrective action ${id}`,
    };
    c.links.push(link);
    c.events.push({ at: now(), actor: actor.name, action: kind === "investigation" ? "Opened surveillance investigation" : "Raised corrective action", note: id });
    addMsg(c, {
      author: actor.name,
      role: "staff",
      visibility: "internal",
      body:
        kind === "investigation"
          ? `Handed to Certification as ${id}. TODO: wire real — creates a Surveillance Audit (special) in eswasa_certification.`
          : `Corrective action ${id} raised for the Quality Manager. TODO: wire real — Quality Action DocType.`,
    });
    return link;
  });
}

/* ---------------- clients ---------------- */

export async function listClients(): Promise<Client[]> {
  // TODO: wire real — GET /crm/clients (Customer / CRM Organization).
  if (!crmDemoMode()) return [];
  guard("Clients");
  return structuredClone(Object.values(read().clients)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(id: string): Promise<Client | null> {
  if (!crmDemoMode()) return null;
  guard("Client");
  const c = read().clients[id];
  return c ? structuredClone(c) : null;
}

/** Public register search: certified clients only, public fields only. */
export async function searchCertifiedRegister(q: string): Promise<
  { client_id: string; name: string; certificates: { id: string; standard: string; status: string }[] }[]
> {
  guard("Register search");
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return Object.values(read().clients)
    .filter((c) => c.certificates.length)
    .filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        c.certificates.some((x) => x.id.toLowerCase().includes(t) || x.standard.toLowerCase().includes(t)),
    )
    .slice(0, 8)
    .map((c) => ({
      client_id: c.id,
      name: c.name,
      certificates: c.certificates.map((x) => ({ id: x.id, standard: x.standard, status: x.status })),
    }));
}

export async function logActivity(
  clientId: string,
  actor: CrmActor,
  kind: Client["activity"][number]["kind"],
  text: string,
): Promise<Client> {
  guard("Activity");
  return mutate((s) => {
    const c = s.clients[clientId];
    if (!c) throw new Error("Client not found");
    c.activity.unshift({ id: `${clientId}-a${Date.now() % 100000}`, at: now(), kind, by: actor.name, text });
    return c;
  });
}

export async function updateClient(id: string, patch: Partial<Pick<Client, "tier" | "account_manager" | "tags">>): Promise<Client> {
  guard("Client update");
  return mutate((s) => {
    const c = s.clients[id];
    if (!c) throw new Error("Client not found");
    Object.assign(c, patch);
    return c;
  });
}

/* ---------------- signals ---------------- */

export async function listSignals(): Promise<Signal[]> {
  // TODO: wire real — GET /crm/signals once Core exposes signal feed.
  if (!crmDemoMode()) return [];
  guard("Signals");
  return structuredClone(Object.values(read().signals)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function setSignalStatus(id: string, status: Signal["status"]): Promise<Signal> {
  guard("Signals");
  return mutate((s) => {
    const sig = s.signals[id];
    if (!sig) throw new Error("Signal not found");
    sig.status = status;
    return sig;
  });
}

/** Inbound "request a quote / talk to us" from the Service portal. */
export async function submitInboundEnquiry(input: {
  organisation: string;
  contact: string;
  email: string;
  phone?: string;
  sector?: string;
  services: Signal["services"];
  message: string;
}): Promise<Signal> {
  guard("Quote request");
  return mutate((s) => {
    const id = `SIG-${String(Date.now() % 100000).padStart(5, "0")}`;
    const existing = Object.values(s.clients).find((c) => c.name.toLowerCase() === input.organisation.trim().toLowerCase());
    const price = (svc: string) =>
      s.config.price_list.filter((p) => p.service === svc).reduce((m, p) => Math.max(m, p.amount), 0);
    const sig: Signal = {
      id,
      kind: "inbound_enquiry",
      title: `Quote request: ${input.services.map((x) => x).join(", ") || "general"}`,
      detail: `${input.organisation} — ${input.message}`,
      client_id: existing?.id,
      prospect: existing
        ? undefined
        : { name: input.organisation, contact: input.contact, email: input.email, phone: input.phone, sector: input.sector },
      services: input.services,
      value_estimate: input.services.reduce((sum, svc) => sum + price(svc) * 3, 0),
      created_at: now(),
      status: "new",
      sector: input.sector,
    };
    s.signals[id] = sig;
    return sig;
  });
}

export async function convertSignal(id: string, actor: CrmActor): Promise<Opportunity> {
  guard("Convert");
  return mutate((s) => {
    const sig = s.signals[id];
    if (!sig) throw new Error("Signal not found");
    if (sig.compliance) throw new Error("Compliance signals go to Certification, not the sales pipeline.");
    const oid = `OPP-${String(s.seq + 100).padStart(3, "0")}`;
    s.seq += 1;
    const client = sig.client_id ? s.clients[sig.client_id] : undefined;
    const opp: Opportunity = {
      id: oid,
      title: sig.title,
      client_id: sig.client_id,
      prospect_name: client ? undefined : sig.prospect?.name,
      stage: "qualify",
      services: sig.services,
      value: sig.value_estimate,
      probability: 25,
      owner: client?.account_manager ?? actor.name,
      created_at: now(),
      expected_close: new Date(Date.now() + 45 * 86_400_000).toISOString(),
      source: sig.kind,
      signal_id: sig.id,
      next_step: "Call the client to qualify",
      notes: [],
    };
    s.opportunities[oid] = opp;
    sig.status = "converted";
    sig.opportunity_id = oid;
    return opp;
  });
}

/* ---------------- opportunities ---------------- */

const STAGE_PROB: Record<OpportunityStage, number> = { qualify: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };

function dealStage(status: string): OpportunityStage {
  const s = status.toLowerCase();
  if (s.includes("won") || s.includes("closed won")) return "won";
  if (s.includes("lost") || s.includes("closed lost")) return "lost";
  if (s.includes("negotiat") || s.includes("propos")) return s.includes("negotiat") ? "negotiation" : "proposal";
  return "qualify";
}

export async function listOpportunities(): Promise<Opportunity[]> {
  if (!crmDemoMode()) {
    const res = await apiFetch<{ items: { id: string; title: string; amount?: number | null; status: string }[] }>(
      "/crm/deals?limit=100",
    );
    const now = new Date().toISOString();
    return (res.items ?? []).map((d) => {
      const stage = dealStage(d.status);
      return {
        id: d.id,
        title: d.title || d.id,
        stage,
        services: ["certification"] as Opportunity["services"],
        value: d.amount ?? 0,
        probability: STAGE_PROB[stage],
        owner: "—",
        created_at: now,
        expected_close: now.slice(0, 10),
        source: "manual" as const,
        notes: [],
      };
    });
  }
  guard("Opportunities");
  return structuredClone(Object.values(read().opportunities)).sort((a, b) => a.expected_close.localeCompare(b.expected_close));
}

export async function saveOpportunity(o: Opportunity): Promise<Opportunity> {
  guard("Opportunity");
  return mutate((s) => {
    if (!o.id) {
      o.id = `OPP-${String(s.seq + 100).padStart(3, "0")}`;
      s.seq += 1;
    }
    s.opportunities[o.id] = structuredClone(o);
    return o;
  });
}

export async function moveOpportunity(id: string, stage: OpportunityStage, actor: CrmActor, lostReason?: string): Promise<Opportunity> {
  guard("Opportunity");
  return mutate((s) => {
    const o = s.opportunities[id];
    if (!o) throw new Error("Opportunity not found");
    if (stage === "lost" && !lostReason?.trim()) throw new Error("A lost reason is required.");
    o.stage = stage;
    o.probability = STAGE_PROB[stage];
    if (lostReason) o.lost_reason = lostReason;
    o.notes.unshift({ at: now(), by: actor.name, text: `Moved to ${stage}${lostReason ? ` — ${lostReason}` : ""}` });
    return o;
  });
}

/* ---------------- quotes ---------------- */

export function quoteTotals(q: Pick<CrmQuote, "lines" | "discount_pct">) {
  const subtotal = q.lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0);
  const discount = Math.round(subtotal * (q.discount_pct / 100));
  const net = subtotal - discount;
  // TODO: confirm VAT treatment of ESWASA statutory fees (15% standard rate shown).
  const vat = Math.round(net * 0.15);
  return { subtotal, discount, net, vat, total: net + vat };
}

export async function listQuotes(): Promise<CrmQuote[]> {
  // TODO: wire real — certification quotes already live at GET /certification/quotes.
  if (!crmDemoMode()) return [];
  guard("Quotes");
  return structuredClone(Object.values(read().quotes)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveQuote(q: CrmQuote): Promise<CrmQuote> {
  guard("Quote");
  return mutate((s) => {
    if (!q.id) q.id = nextRef(s, "QT");
    s.quotes[q.id] = structuredClone(q);
    if (q.opportunity_id && s.opportunities[q.opportunity_id]) {
      const o = s.opportunities[q.opportunity_id];
      o.quote_id = q.id;
      o.value = quoteTotals(q).net;
      if (o.stage === "qualify") {
        o.stage = "proposal";
        o.probability = STAGE_PROB.proposal;
      }
    }
    return q;
  });
}

export type QuoteAction = "submit" | "approve" | "reject" | "send" | "accept" | "decline" | "convert";

export async function actOnQuote(id: string, action: QuoteAction, actor: CrmActor, note?: string): Promise<CrmQuote> {
  guard("Quote");
  return mutate((s) => {
    const q = s.quotes[id];
    if (!q) throw new Error("Quote not found");
    const at = now();
    const needsApproval = q.discount_pct > s.config.discount_approval_pct;
    switch (action) {
      case "submit":
        if (!needsApproval) throw new Error("No approval needed — send it directly.");
        q.status = "pending_approval";
        break;
      case "approve":
        q.approval = { by: actor.name, at, note };
        q.status = "draft";
        break;
      case "reject":
        q.status = "draft";
        q.discount_pct = s.config.discount_approval_pct;
        q.notes = `${q.notes ?? ""}\nDiscount rejected by ${actor.name}${note ? `: ${note}` : ""}`.trim();
        break;
      case "send":
        if (needsApproval && !q.approval) throw new Error(`Discounts over ${s.config.discount_approval_pct}% need a Sales Manager approval first.`);
        q.status = "sent";
        q.sent_at = at;
        break;
      case "accept":
        q.status = "accepted";
        q.accepted_at = at;
        if (q.opportunity_id && s.opportunities[q.opportunity_id]) {
          s.opportunities[q.opportunity_id].stage = "won";
          s.opportunities[q.opportunity_id].probability = 100;
        }
        break;
      case "decline":
        q.status = "declined";
        if (q.opportunity_id && s.opportunities[q.opportunity_id]) {
          s.opportunities[q.opportunity_id].stage = "lost";
          s.opportunities[q.opportunity_id].lost_reason = note || "Quote declined";
        }
        break;
      case "convert": {
        const codes = q.lines.map((l) => l.code);
        const out: CrmQuote["converted"] = [];
        if (codes.some((c) => c.startsWith("CERT"))) out.push({ kind: "application", ref: `CERT-${String(60 + s.seq).padStart(4, "0")}` });
        if (codes.some((c) => c.startsWith("CAL"))) out.push({ kind: "calibration_job", ref: `CAL-${2700 + s.seq}` });
        if (codes.some((c) => c.startsWith("TRN"))) out.push({ kind: "enrolment", ref: `ENR-${900 + s.seq}` });
        out.push({ kind: "invoice", ref: `INV-${4100 + s.seq}` });
        s.seq += 1;
        q.converted = out;
        // TODO: wire real — POST /certification/applications, /metrology/jobs, /training/enrol, /finance/invoices.
        break;
      }
      default:
        break;
    }
    return q;
  });
}

/* ---------------- config ---------------- */

export async function getCrmConfig(): Promise<CrmConfig> {
  if (!crmDemoMode()) return structuredClone(DEFAULT_CONFIG);
  guard("Settings");
  return structuredClone(read().config);
}

/** Config for public screens: falls back to defaults so SLA promises still render. */
export function publicCrmConfig(): CrmConfig {
  return crmDemoMode() ? structuredClone(read().config) : DEFAULT_CONFIG;
}

export async function saveCrmConfig(cfg: CrmConfig): Promise<CrmConfig> {
  guard("Settings");
  return mutate((s) => {
    s.config = structuredClone(cfg);
    return cfg;
  });
}

/* =====================================================================
 * Gap 04 additions — clients & contacts, customer quotes, knowledge base,
 * contracts, outbound delivery log, signal rules, field visits from cases,
 * appeals panel, campaign hand-off. TODO: wire real — /crm/clients (POST/PATCH,
 * /merge, /contacts), /crm/quotes/{id}/customer-act, /crm/knowledge, /crm/contracts,
 * /crm/deliveries (+resend), /crm/signal-rules, /crm/campaigns, /cases/{ref}/field-visit,
 * /cases/{ref}/appeal-decision.
 * ===================================================================== */

function ensureExtras(s: Store): Store {
  s.kb ??= Object.fromEntries(structuredClone(SEED_KB).map((a) => [a.id, a]));
  s.contracts ??= Object.fromEntries(structuredClone(SEED_CONTRACTS).map((c) => [c.id, c]));
  s.deliveries ??= {};
  s.campaigns ??= {};
  s.signal_rules ??= structuredClone(DEFAULT_SIGNAL_RULES);
  s.account_plans ??= {};
  s.nps ??= Object.fromEntries(
    (
      [
        ["certificate_issued", "SZNS-CERT-0412", 9, "Clear process and a helpful auditor."],
        ["certificate_issued", "SZNS-CERT-0398", 6, "Took longer than the quote said."],
        ["calibration_delivered", "CAL-26-0211", 10, "Fast turnaround on our balances."],
        ["calibration_delivered", "CAL-26-0198", 8, undefined],
        ["certificate_issued", "SZNS-CERT-0377", 10, undefined],
      ] as const
    ).map(([trigger, ref, score, comment], i) => {
      const id = `NPS-SEED-${i + 1}`;
      const at = new Date(Date.now() - (20 + i * 9) * 86_400_000).toISOString();
      return [id, { id, trigger, ref, email: "demo", sent_at: at, score, comment, answered_at: at } as NpsSurvey];
    }).concat([["NPS-SEED-OPEN", { id: "NPS-SEED-OPEN", trigger: "calibration_delivered", ref: "CAL-26-0233", email: "demo", sent_at: new Date(Date.now() - 2 * 86_400_000).toISOString() } as NpsSurvey]]),
  );
  const q = s.quotes["QT-26-014"];
  if (q && !q.customer_email) {
    q.customer_email = "demo";
    q.public_code = "VD7Q2K";
  }
  for (const x of Object.values(s.quotes)) {
    if (!x.customer_email && x.client_id) x.customer_email = s.clients[x.client_id]?.contacts.find((c) => c.primary)?.email;
    x.public_code ??= Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  return s;
}

/* ---------------- outbound delivery log (R7) ---------------- */

function logDelivery(s: Store, c: Case, subject: string, body: string) {
  s.deliveries ??= {};
  const pref = c.reporter.preferred;
  const to = pref === "email" ? c.reporter.email : c.reporter.phone ?? c.reporter.email;
  const channel: MessageDelivery["channel"] = c.reporter.anonymous ? "portal" : pref === "whatsapp" ? "whatsapp" : pref === "sms" || pref === "phone" ? "sms" : "email";
  const id = `DLV-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const failed = channel !== "portal" && !to;
  s.deliveries[id] = { id, case_ref: c.ref, to: to ?? "Tracking page only", channel, subject, body, status: failed ? "failed" : "sent", at: now(), attempts: 1, error: failed ? `No ${channel === "email" ? "email address" : "phone number"} on file` : undefined };
}

export async function listDeliveries(f: { case_ref?: string; quote_id?: string } = {}): Promise<MessageDelivery[]> {
  guard("Delivery log");
  return structuredClone(Object.values(read().deliveries ?? {}))
    .filter((d) => (!f.case_ref || d.case_ref === f.case_ref) && (!f.quote_id || d.quote_id === f.quote_id))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function resendDelivery(id: string, channel?: MessageDelivery["channel"], to?: string): Promise<MessageDelivery> {
  guard("Resend");
  return mutate((s) => {
    const d = s.deliveries?.[id];
    if (!d) throw new Error("Message not found");
    if (channel) d.channel = channel;
    if (to) d.to = to;
    d.attempts += 1;
    d.at = now();
    const ok = d.channel === "portal" || (d.to && d.to !== "Tracking page only");
    d.status = ok ? "sent" : "failed";
    d.error = ok ? undefined : "Still no address for this channel";
    return d;
  });
}

/* ---------------- system cases (R-V4 and other automation) ---------------- */

export function openSystemCase(input: { type: CaseType; subject: string; description: string; client_id?: string; priority?: CasePriority; about?: Case["about"] }): Case | null {
  if (!crmDemoMode()) return null;
  return mutate((s) => {
    const ref = nextRef(s, "CS");
    const at = now();
    const team = s.config.case_types[input.type].team;
    const c: Case = {
      ref,
      type: input.type,
      subject: input.subject,
      description: input.description,
      state: "Triaged",
      priority: input.priority ?? "high",
      channel: "web",
      team,
      created_at: at,
      updated_at: at,
      acknowledged_at: at,
      about: input.about,
      client_id: input.client_id,
      sector: input.client_id ? s.clients[input.client_id]?.sector : undefined,
      reporter: { anonymous: false, name: "ESWASA (system)", preferred: "email" },
      access_code: accessCode(),
      thread: [],
      events: [{ at, actor: "System", action: "Opened by automation", to: "Triaged" }],
      links: [],
      tags: ["system"],
      reopen_count: 0,
      paused_wd: 0,
    };
    addMsg(c, { author: "System", role: "system", visibility: "internal", body: input.description });
    s.cases[ref] = c;
    syncCaseTasks(c, "System", "Opened by automation");
    return c;
  });
}

/* ---------------- clients & contacts (R4, R5) ---------------- */

export function findClientDuplicates(name: string, regNo?: string, excludeId?: string): Client[] {
  if (!crmDemoMode()) return [];
  const norm = (x: string) => x.toLowerCase().replace(/\(pty\)|ltd|limited|co\.|company|[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const n = norm(name);
  if (n.length < 3) return [];
  return structuredClone(
    Object.values(read().clients).filter((c) => c.id !== excludeId && !c.merged_into && (norm(c.name) === n || norm(c.name).includes(n) || n.includes(norm(c.name)) || (regNo && c.reg_no && c.reg_no === regNo))),
  );
}

export type NewClientInput = { name: string; sector: string; region: Client["region"]; tier: Client["tier"]; employees?: number; exporter: boolean; reg_no?: string; address?: string; website?: string; account_manager?: string; contact?: Omit<Contact, "id"> };

export async function createClient(input: NewClientInput, actor: CrmActor): Promise<Client> {
  guard("New client");
  if (!input.name.trim()) throw new Error("Organisation name is required.");
  return mutate((s) => {
    const n = Object.keys(s.clients).length + 1;
    let id = `CL-${String(n).padStart(3, "0")}`;
    while (s.clients[id]) id = `CL-${String(Number(id.slice(3)) + 1).padStart(3, "0")}`;
    const c: Client = {
      id,
      name: input.name.trim(),
      sector: input.sector,
      region: input.region,
      tier: input.tier,
      status: input.tier === "prospect" ? "prospect" : "active",
      reg_no: input.reg_no,
      since: now(),
      employees: input.employees,
      exporter: input.exporter,
      account_manager: input.account_manager,
      address: input.address,
      website: input.website,
      tags: [],
      contacts: input.contact ? [{ ...input.contact, id: `${id}-c1`, primary: true, active: true }] : [],
      certificates: [],
      applications: [],
      instruments: [],
      training: [],
      orders: [],
      invoices: [],
      activity: [{ id: `${id}-a1`, at: now(), kind: "note", by: actor.name, text: "Client record created" }],
    };
    s.clients[id] = c;
    return c;
  });
}

export async function updateClientDetails(id: string, patch: Partial<Pick<Client, "name" | "sector" | "region" | "tier" | "status" | "employees" | "exporter" | "reg_no" | "address" | "website" | "account_manager" | "tags">>, actor: CrmActor): Promise<Client> {
  guard("Client update");
  return mutate((s) => {
    const c = s.clients[id];
    if (!c) throw new Error("Client not found");
    const changes = Object.entries(patch).filter(([k, v]) => JSON.stringify((c as Record<string, unknown>)[k]) !== JSON.stringify(v));
    Object.assign(c, patch);
    if (changes.length) c.activity.unshift({ id: `${id}-a${Date.now() % 100000}`, at: now(), kind: "note", by: actor.name, text: `Updated ${changes.map(([k]) => k).join(", ")}` });
    return c;
  });
}

/** Merge `dropId` into `keepId`: contacts, records and references move; the duplicate is retired. */
export async function mergeClients(keepId: string, dropId: string, actor: CrmActor): Promise<Client> {
  guard("Merge");
  if (keepId === dropId) throw new Error("Pick two different clients.");
  return mutate((s) => {
    const keep = s.clients[keepId];
    const drop = s.clients[dropId];
    if (!keep || !drop) throw new Error("Client not found");
    for (const ct of drop.contacts) if (!keep.contacts.some((x) => x.email && x.email === ct.email)) keep.contacts.push({ ...ct, id: `${keepId}-m${ct.id}`, primary: false });
    keep.certificates.push(...drop.certificates);
    keep.applications.push(...drop.applications);
    keep.instruments.push(...drop.instruments);
    keep.orders.push(...drop.orders);
    keep.invoices.push(...drop.invoices);
    keep.activity.unshift({ id: `${keepId}-a${Date.now() % 100000}`, at: now(), kind: "note", by: actor.name, text: `Merged duplicate ${drop.name} (${drop.id}) into this record` });
    for (const c of Object.values(s.cases)) if (c.client_id === dropId) c.client_id = keepId;
    for (const o of Object.values(s.opportunities)) if (o.client_id === dropId) o.client_id = keepId;
    for (const q of Object.values(s.quotes)) if (q.client_id === dropId) q.client_id = keepId;
    for (const g of Object.values(s.signals)) if (g.client_id === dropId) g.client_id = keepId;
    delete s.clients[dropId];
    return keep;
  });
}

export async function saveContact(clientId: string, contact: Omit<Contact, "id"> & { id?: string }, actor: CrmActor): Promise<Client> {
  guard("Contact");
  if (!contact.name.trim()) throw new Error("Contact name is required.");
  if (!contact.email?.trim() && !contact.phone?.trim()) throw new Error("Give an email or a phone number.");
  return mutate((s) => {
    const c = s.clients[clientId];
    if (!c) throw new Error("Client not found");
    if (contact.primary) c.contacts.forEach((x) => (x.primary = false));
    if (contact.id) {
      const ct = c.contacts.find((x) => x.id === contact.id);
      if (!ct) throw new Error("Contact not found");
      Object.assign(ct, contact);
    } else c.contacts.push({ ...contact, id: `${clientId}-c${c.contacts.length + 1}-${Date.now() % 1000}`, active: true });
    c.activity.unshift({ id: `${clientId}-a${Date.now() % 100000}`, at: now(), kind: "note", by: actor.name, text: `${contact.id ? "Updated" : "Added"} contact ${contact.name}` });
    return c;
  });
}

export async function setContactActive(clientId: string, contactId: string, active: boolean, actor: CrmActor): Promise<Client> {
  guard("Contact");
  return mutate((s) => {
    const c = s.clients[clientId];
    const ct = c?.contacts.find((x) => x.id === contactId);
    if (!c || !ct) throw new Error("Contact not found");
    if (!active && ct.primary) throw new Error("Make another contact primary first.");
    ct.active = active;
    c.activity.unshift({ id: `${clientId}-a${Date.now() % 100000}`, at: now(), kind: "note", by: actor.name, text: `${active ? "Reactivated" : "Deactivated"} contact ${ct.name}` });
    return c;
  });
}

/** Invite a contact to a Service portal business account linked to this client (R5). */
export async function inviteContact(clientId: string, contactId: string, actor: CrmActor): Promise<Client> {
  guard("Invite");
  const c = mutate((s) => {
    const c = s.clients[clientId];
    const ct = c?.contacts.find((x) => x.id === contactId);
    if (!c || !ct) throw new Error("Contact not found");
    if (!ct.email) throw new Error("The contact needs an email address to be invited.");
    ct.portal = { invited_at: now(), status: "invited" };
    c.activity.unshift({ id: `${clientId}-a${Date.now() % 100000}`, at: now(), kind: "email", by: actor.name, text: `Invited ${ct.name} to the Service portal business account` });
    return c;
  });
  const ct = c.contacts.find((x) => x.id === contactId)!;
  notifySafe({ audience: "customer", to: ct.email!, kind: "info", title: `You're invited to ${c.name}'s ESWASA account`, body: `${actor.name} invited you to manage ${c.name}'s certificates, quotes, calibration jobs and invoices. Sign in with this email to accept.`, link: "/account", channel: ["email"] });
  return c;
}

/** Contact directory / contact-centre lookup by phone, email or name. */
export async function lookupContacts(q: string): Promise<{ client: Client; contact: Contact; open_cases: Case[] }[]> {
  guard("Lookup");
  const t = normalise(q);
  if (t.length < 3) return [];
  const s = read();
  const out: { client: Client; contact: Contact; open_cases: Case[] }[] = [];
  for (const c of Object.values(s.clients)) {
    for (const ct of c.contacts) {
      if ([ct.phone, ct.email, ct.name].some((v) => normalise(v).includes(t))) {
        out.push({ client: structuredClone(c), contact: structuredClone(ct), open_cases: structuredClone(Object.values(s.cases).filter((x) => x.client_id === c.id && !["Closed", "Resolved"].includes(x.state))) });
      }
    }
  }
  // Callers who aren't contacts yet but lodged cases with this phone/email.
  for (const x of Object.values(s.cases)) {
    if ([x.reporter.phone, x.reporter.email].some((v) => v && normalise(v).includes(t)) && !out.some((o) => o.contact.phone === x.reporter.phone || o.contact.email === x.reporter.email)) {
      const client = x.client_id ? s.clients[x.client_id] : undefined;
      out.push({ client: structuredClone(client ?? ({ id: "", name: x.reporter.organisation ?? "Member of the public", contacts: [] } as unknown as Client)), contact: { id: `case-${x.ref}`, name: x.reporter.name ?? "Unknown caller", role: "Case reporter", email: x.reporter.email, phone: x.reporter.phone }, open_cases: structuredClone(Object.values(s.cases).filter((y) => y.reporter.phone === x.reporter.phone && !["Closed"].includes(y.state))) });
    }
  }
  return out.slice(0, 12);
}

export async function listAllContacts(): Promise<{ client: Pick<Client, "id" | "name" | "tier">; contact: Contact }[]> {
  if (!crmDemoMode()) return [];
  guard("Contacts");
  return structuredClone(Object.values(read().clients).flatMap((c) => c.contacts.map((contact) => ({ client: { id: c.id, name: c.name, tier: c.tier }, contact })))).sort((a, b) => a.contact.name.localeCompare(b.contact.name));
}

/** Won opportunity for a prospect → client record (pre-filled from the signal). */
export async function convertProspect(oppId: string, actor: CrmActor, mergeInto?: string): Promise<Client> {
  guard("Convert prospect");
  const s0 = read();
  const o = s0.opportunities[oppId];
  if (!o) throw new Error("Opportunity not found");
  if (o.client_id) throw new Error("This opportunity already has a client.");
  const sig = o.signal_id ? s0.signals[o.signal_id] : undefined;
  const client = mergeInto
    ? (structuredClone(s0.clients[mergeInto]) as Client)
    : await createClient({ name: o.prospect_name ?? sig?.prospect?.name ?? o.title, sector: sig?.prospect?.sector ?? sig?.sector ?? "Other", region: "Manzini", tier: "standard", exporter: false, contact: sig?.prospect?.contact ? { name: sig.prospect.contact, role: "Main contact", email: sig.prospect.email, phone: sig.prospect.phone, primary: true } : undefined }, actor);
  mutate((s) => {
    const opp = s.opportunities[oppId];
    opp.client_id = client.id;
    opp.prospect_name = undefined;
    opp.notes.unshift({ at: now(), by: actor.name, text: `Linked to client ${client.name} (${client.id})` });
    for (const q of Object.values(s.quotes)) if (q.opportunity_id === oppId) q.client_id = client.id;
  });
  return client;
}

/* ---------------- customer quotes (R2) ---------------- */

const quoteVisible = (q: CrmQuote) => ["sent", "accepted", "declined", "expired"].includes(q.status);

export async function listQuotesForCustomer(email?: string): Promise<CrmQuote[]> {
  guard("Your quotes");
  const e = normalise(email);
  return structuredClone(Object.values(read().quotes).filter((q) => quoteVisible(q) && (q.customer_email === "demo" || (e && normalise(q.customer_email) === e)))).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Customer view of one quote — by signed-in email or by the public code on the link. */
export async function getQuoteForCustomer(id: string, proof: { email?: string; code?: string }): Promise<CrmQuote | null> {
  guard("Quote");
  const q = read().quotes[id];
  if (!q || !quoteVisible(q)) return null;
  const ok = q.customer_email === "demo" || (proof.email && normalise(proof.email) === normalise(q.customer_email)) || (proof.code && proof.code.trim().toUpperCase() === q.public_code);
  if (!ok) return null;
  const out = structuredClone(q);
  out.approval = undefined;
  out.notes = undefined;
  return out;
}

export async function customerActOnQuote(id: string, action: "accept" | "decline", sig: { name: string; title: string; reason?: string }): Promise<CrmQuote> {
  guard("Quote response");
  if (action === "accept" && (!sig.name.trim() || !sig.title.trim())) throw new Error("Type your full name and position to accept.");
  if (action === "decline" && !sig.reason?.trim()) throw new Error("Tell us why, so we can improve the offer.");
  const q = mutate((s) => {
    const q = s.quotes[id];
    if (!q) throw new Error("Quote not found");
    if (q.status !== "sent") throw new Error(`This quote is ${q.status.replace("_", " ")} and can't be changed.`);
    if (new Date(q.valid_until).getTime() < Date.now()) {
      q.status = "expired";
      throw new Error("This quote has expired. Ask ESWASA for a new one.");
    }
    q.customer_acceptance = { name: sig.name, title: sig.title, at: now(), reason: sig.reason };
    const opp = q.opportunity_id ? s.opportunities[q.opportunity_id] : undefined;
    if (action === "accept") {
      q.status = "accepted";
      q.accepted_at = now();
      if (opp) {
        opp.stage = "won";
        opp.probability = 100;
        opp.notes.unshift({ at: now(), by: `${sig.name} (customer)`, text: "Accepted the quote online" });
      }
    } else {
      q.status = "declined";
      if (opp) {
        opp.stage = "lost";
        opp.lost_reason = `Declined online: ${sig.reason}`;
      }
    }
    if (q.client_id && s.clients[q.client_id]) s.clients[q.client_id].activity.unshift({ id: `${q.client_id}-a${Date.now() % 100000}`, at: now(), kind: "note", by: `${sig.name} (customer)`, text: `${action === "accept" ? "Accepted" : "Declined"} quote ${q.id} online` });
    return q;
  });
  if (action === "accept") {
    const t = quoteTotals(q);
    try {
      const inv = createInvoice({ source: "crm", ref: q.id, title: `Quote ${q.id} — ${q.client_name}`, customer: q.client_name, customer_email: q.customer_email ?? "demo", client_id: q.client_id, lines: q.lines.map((l) => ({ label: l.label, qty: l.qty, unit_price: Math.round(l.unit_price * (1 - q.discount_pct / 100) * 100) / 100 })), due_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), deposit: Math.round(t.total * 0.5 * 100) / 100 });
      mutate((s) => (s.quotes[id].invoice_id = inv.id));
      q.invoice_id = inv.id;
    } catch {
      /* billing off */
    }
    try {
      openTask({ doctype: "CRM Quote", name: q.id, state: "Accepted", seq: 1, family: "do", verb: "task", role: "Sales Manager", title: `Quote ${q.id} accepted online — create the work orders`, module: "CRM", link: "/crm/quotes", sla_days: 2, facts: { Client: q.client_name, "Signed by": `${sig.name}, ${sig.title}` } });
    } catch {
      /* ignore */
    }
  }
  return q;
}

/* ---------------- knowledge base ---------------- */

export async function listArticles(f: { status?: KbArticle["status"]; q?: string; type?: CaseType } = {}): Promise<KbArticle[]> {
  if (!crmDemoMode()) return [];
  guard("Knowledge base");
  const q = f.q?.trim().toLowerCase();
  return structuredClone(Object.values(read().kb ?? {}))
    .filter((a) => !f.status || a.status === f.status)
    .filter((a) => !f.type || a.types.includes(f.type))
    .filter((a) => !q || `${a.title} ${a.body} ${a.tags.join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => b.helpful - a.helpful);
}

/** Public search (Service /help and the lodge form). Published only; never throws. */
export function searchArticles(q: string, type?: CaseType): KbArticle[] {
  if (!crmDemoMode()) return [];
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return structuredClone(Object.values(read().kb ?? {}))
    .filter((a) => a.status === "published")
    .map((a) => ({ a, score: (type && a.types.includes(type) ? 2 : 0) + words.filter((w) => `${a.title} ${a.body} ${a.tags.join(" ")}`.toLowerCase().includes(w)).length }))
    .filter((x) => !q.trim() || x.score > 0)
    .sort((x, y) => y.score - x.score || y.a.helpful - x.a.helpful)
    .map((x) => x.a)
    .slice(0, 6);
}

export async function saveArticle(a: Omit<KbArticle, "id" | "updated_at" | "views" | "helpful"> & { id?: string }, actor: CrmActor): Promise<KbArticle> {
  guard("Article");
  if (!a.title.trim() || !a.body.trim()) throw new Error("Title and body are required.");
  return mutate((s) => {
    s.kb ??= {};
    const id = a.id ?? `KB-${String(Object.keys(s.kb).length + 1).padStart(3, "0")}`;
    const prev = s.kb[id];
    s.kb[id] = { ...a, views: prev?.views ?? 0, helpful: prev?.helpful ?? 0, id, by: actor.name, updated_at: now() };
    return s.kb[id];
  });
}

export async function articleFromCase(ref: string, actor: CrmActor): Promise<KbArticle> {
  const c = read().cases[ref];
  if (!c) throw new Error("Case not found");
  if (!c.resolution) throw new Error("Only resolved cases can become articles.");
  return saveArticle({ title: c.subject.endsWith("?") ? c.subject : `${c.subject} — what to do`, body: c.resolution, tags: c.tags, types: [c.type], status: "draft", by: actor.name, from_case: ref }, actor);
}

export function markArticleHelpful(id: string): void {
  if (!crmDemoMode()) return;
  mutate((s) => {
    const a = s.kb?.[id];
    if (a) a.helpful += 1;
  });
}

/* ---------------- contracts ---------------- */

export async function listContracts(): Promise<ServiceContract[]> {
  if (!crmDemoMode()) return [];
  guard("Contracts");
  return structuredClone(Object.values(read().contracts ?? {})).sort((a, b) => a.end.localeCompare(b.end));
}

export async function saveContract(c: Omit<ServiceContract, "id"> & { id?: string }): Promise<ServiceContract> {
  guard("Contract");
  if (!c.client_id || !c.title.trim()) throw new Error("Client and title are required.");
  if (new Date(c.end) <= new Date(c.start)) throw new Error("The end date must be after the start date.");
  return mutate((s) => {
    s.contracts ??= {};
    const id = c.id ?? nextRef(s, "CON");
    s.contracts[id] = { ...c, id };
    return s.contracts[id];
  });
}

export async function contractFromQuote(quoteId: string): Promise<ServiceContract> {
  const q = read().quotes[quoteId];
  if (!q) throw new Error("Quote not found");
  if (q.status !== "accepted") throw new Error("Only accepted quotes become agreements.");
  const codes = q.lines.map((l) => l.code).join(" ");
  const kind: ServiceContract["kind"] = codes.includes("CAL") ? "calibration_contract" : codes.includes("TRN") ? "training_agreement" : codes.includes("STD") ? "standards_subscription" : "certification_agreement";
  return saveContract({ client_id: q.client_id ?? "", client_name: q.client_name, kind, title: `Agreement from ${q.id}`, quote_id: q.id, start: now(), end: new Date(Date.now() + 365 * 86_400_000).toISOString(), value: quoteTotals(q).net, renewal_reminder_days: 60, status: "active" });
}

/* ---------------- signal rules & generators (R10) ---------------- */

export type SignalCandidate = Omit<Signal, "id" | "created_at" | "status"> & { source_ref: string };
type SignalGenerator = { key: keyof SignalRules["generators"]; label: string; run: (rules: SignalRules) => SignalCandidate[] };
const generators: SignalGenerator[] = [];

/** Domain stores register generators (certificates, instruments, …) so CRM never imports them. */
export function registerSignalGenerator(g: SignalGenerator): void {
  if (!generators.some((x) => x.key === g.key && x.label === g.label)) generators.push(g);
}

export function signalGenerators(): { key: string; label: string }[] {
  return generators.map((g) => ({ key: g.key, label: g.label }));
}

export async function getSignalRules(): Promise<SignalRules> {
  guard("Signal rules");
  return structuredClone(read().signal_rules ?? DEFAULT_SIGNAL_RULES);
}

export async function saveSignalRules(r: SignalRules): Promise<SignalRules> {
  guard("Signal rules");
  return mutate((s) => (s.signal_rules = structuredClone(r)));
}

export async function runSignalGenerators(): Promise<{ created: number; by: Record<string, number> }> {
  guard("Signal generators");
  const rules = read().signal_rules ?? DEFAULT_SIGNAL_RULES;
  const by: Record<string, number> = {};
  let created = 0;
  const found = generators.filter((g) => rules.generators[g.key]).flatMap((g) => g.run(rules).map((c) => ({ g, c })));
  mutate((s) => {
    for (const { g, c } of found) {
      if (Object.values(s.signals).some((x) => x.source_ref === c.source_ref)) continue;
      const id = `SIG-${String(Date.now() % 100000).padStart(5, "0")}${created}`;
      s.signals[id] = { ...c, id, created_at: now(), status: "new" };
      created += 1;
      by[g.label] = (by[g.label] ?? 0) + 1;
    }
  });
  return { created, by };
}

/* ---------------- campaigns (R9) ---------------- */

export async function createCampaignDraft(input: { name: string; client_ids: string[]; signal_kind?: Signal["kind"]; message: string }, actor: CrmActor): Promise<CampaignDraft> {
  guard("Campaign");
  if (!input.client_ids.length) throw new Error("Select at least one client.");
  return mutate((s) => {
    s.campaigns ??= {};
    const id = nextRef(s, "CMP");
    const d: CampaignDraft = { ...input, id, created_at: now(), by: actor.name, status: "draft" };
    s.campaigns[id] = d;
    for (const cid of input.client_ids) s.clients[cid]?.activity.unshift({ id: `${cid}-a${Date.now() % 100000}${id}`, at: now(), kind: "email", by: actor.name, text: `Added to campaign "${input.name}"` });
    return d;
  });
}

export async function listCampaigns(): Promise<CampaignDraft[]> {
  if (!crmDemoMode()) return [];
  guard("Campaigns");
  return structuredClone(Object.values(read().campaigns ?? {})).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markCampaignSent(id: string, actor: CrmActor): Promise<CampaignDraft> {
  return mutate((s) => {
    const d = s.campaigns?.[id];
    if (!d) throw new Error("Campaign not found");
    d.status = "sent";
    for (const cid of d.client_ids) s.clients[cid]?.activity.unshift({ id: `${cid}-a${Date.now() % 100000}s`, at: now(), kind: "email", by: actor.name, text: `Outreach sent: "${d.name}"` });
    return d;
  });
}

/* ---------------- bulk actions ---------------- */

export async function bulkAssign(refs: string[], assignee: string, team: string | undefined, actor: CrmActor): Promise<number> {
  guard("Bulk assign");
  let n = 0;
  for (const ref of refs) {
    try {
      await assignCase(ref, actor, assignee, team);
      n += 1;
    } catch {
      /* skip impartiality conflicts */
    }
  }
  return n;
}

/* ---------------- field visits from cases (R6) ---------------- */

export async function requestFieldVisit(ref: string, input: { type: Extract<VisitType, "market_sampling" | "complaint_investigation">; site: string; address: string; date: string; scope: string }, actor: CrmActor): Promise<Case> {
  guard("Field visit");
  const c0 = read().cases[ref];
  if (!c0) throw new Error("Case not found");
  if (c0.field_visit && !["Closed", "Cancelled"].includes(c0.field_visit.state)) throw new Error(`Visit ${c0.field_visit.id} is already open for this case.`);
  if (!input.site.trim() || !input.date) throw new Error("Give the location and date.");
  const v = planVisit({ type: input.type, title: `${input.type === "market_sampling" ? "Market sampling" : "Investigation"} — ${input.site} (${ref})`, parent: { doctype: "Case", name: ref, label: `${ref} · ${c0.subject}`, link: `/crm/cases/${ref}` }, client: c0.about?.label ?? input.site, client_email: "", site: { name: input.site, address: input.address, contact: "On site" }, planned_date: new Date(input.date).toISOString(), scope: input.scope }, { name: actor.name, roles: actor.roles });
  return mutate((s) => {
    const c = must(s, ref);
    c.field_visit = { id: v.id, type: input.type, state: v.state };
    c.links.push({ kind: "investigation", ref: v.id, label: `Field visit ${v.id}` });
    c.events.push({ at: now(), actor: actor.name, action: `Requested ${input.type.replace("_", " ")} visit`, note: v.id });
    addMsg(c, { author: actor.name, role: "staff", visibility: "internal", body: `Field visit ${v.id} planned for ${new Date(input.date).toLocaleDateString()} at ${input.site}. The case waits for the visit outcome.` });
    if (c.state === "Triaged" || c.state === "Open") {
      const from = c.state;
      c.state = "In Progress";
      c.assignee ??= actor.name;
      c.events.push({ at: now(), actor: actor.name, action: "Start work", from, to: "In Progress" });
      syncCaseTasks(c, actor.name, "Field visit requested");
    }
    return c;
  });
}

function caseNote(ref: string, body: string, patch?: (c: Case) => void) {
  if (!crmDemoMode()) return;
  mutate((s) => {
    const c = s.cases[ref];
    if (!c) return;
    addMsg(c, { author: "System", role: "system", visibility: "internal", body });
    c.events.push({ at: now(), actor: "System", action: body.split(".")[0] });
    patch?.(c);
    c.updated_at = now();
  });
}

registerVisitParent("Case", {
  onClosed: (v) => caseNote(v.parent!.name, `Field visit ${v.id} closed. ${v.sample_ids.length ? `${v.sample_ids.length} sample(s) sent to the lab — waiting for results.` : "No samples taken."} ${v.notes ? `Inspector notes: ${v.notes}` : ""}`, (c) => (c.field_visit = { ...(c.field_visit ?? { id: v.id, type: v.type }), state: "Closed" })),
  onAborted: (v) => caseNote(v.parent!.name, `Field visit ${v.id} aborted: ${v.abort?.reason ?? ""}`, (c) => (c.field_visit = { ...(c.field_visit ?? { id: v.id, type: v.type }), state: "Aborted" })),
  onSubmitted: (v) => caseNote(v.parent!.name, `Field visit ${v.id} report submitted for review.`, (c) => (c.field_visit = { ...(c.field_visit ?? { id: v.id, type: v.type }), state: "Submitted" })),
  onCancelled: (v) => caseNote(v.parent!.name, `Field visit ${v.id} cancelled.`, (c) => (c.field_visit = { ...(c.field_visit ?? { id: v.id, type: v.type }), state: "Cancelled" })),
});

registerSampleParent("Case", {
  onResult: (smp) => {
    const ref = smp.parent!.name;
    caseNote(ref, `Lab result for sample ${smp.seal} (${smp.product}): ${smp.result?.toUpperCase()}. ${smp.result_note ?? ""}`, (c) => {
      if (c.field_visit) c.field_visit.result = smp.result;
    });
    if (smp.result === "fail") {
      const c = read().cases[ref];
      try {
        openTask({ doctype: "Case", name: ref, state: "R-V4", seq: 900, family: "approve", verb: "approve", role: "Certification Manager", title: `R-V4: failed market sample ${smp.seal} — review certification of ${c?.about?.label ?? "the brand"}`, module: "Certification", link: `/crm/cases/${ref}`, sla_days: 2, rule: "R-V4", priority: "urgent" });
        openTask({ doctype: "Governance Risk", name: `RV4-${smp.id}`, state: "Signal", seq: 1, family: "alert", role: "Eswasa Risk Officer", title: `Failed market sample ${smp.seal}: review the risk register`, module: "Governance", link: "/board/risks", sla_days: 5, rule: "R-V4" });
      } catch {
        /* ignore */
      }
    }
  },
});

/* ---------------- appeals panel (R11) ---------------- */

type AppealExclusion = (c: Case) => { name: string; why: string }[];
const appealExclusions: AppealExclusion[] = [];

/** Certification registers who touched the contested file (audit team, reviewer, decision-maker). */
export function registerAppealExclusion(fn: AppealExclusion): void {
  appealExclusions.push(fn);
}

export function eligiblePanel(ref: string): { name: string; title: string; ok: boolean; why?: string }[] {
  const c = read().cases[ref];
  if (!c) return [];
  const excluded = new Map<string, string>();
  if (c.decision_maker) excluded.set(c.decision_maker, "Made the original decision");
  for (const fn of appealExclusions) for (const e of fn(c)) if (!excluded.has(e.name)) excluded.set(e.name, e.why);
  return DEMO_STAFF.filter((p) => p.roles.some((r) => ["Eswasa Appeals Panel", "Quality Manager", "Certification Manager", "Technical Reviewer", "Eswasa Board Member", "Company Secretary"].includes(r))).map((p) => ({ name: p.name, title: p.title, ok: !excluded.has(p.name), why: excluded.get(p.name) }));
}

export async function recordAppealDecision(ref: string, outcome: "uphold" | "overturn" | "partial", note: string, actor: CrmActor): Promise<Case> {
  guard("Appeal decision");
  if (!note.trim()) throw new Error("Record the panel's reasons.");
  const c = mutate((s) => {
    const c = must(s, ref);
    if (c.type !== "appeal") throw new Error("Only appeals have a panel decision.");
    if (!c.panel?.length) throw new Error("Appoint the panel first.");
    if (c.decision_maker === actor.name) throw new Error("Impartiality: you made the original decision.");
    const downstream = outcome === "uphold" ? "Original decision stands." : `Certification to implement: ${outcome === "overturn" ? "reverse the decision (e.g. reinstate / restore scope)" : "partly reverse the decision as the panel set out"}.`;
    c.appeal_outcome = { outcome, at: now(), by: actor.name, note, downstream };
    c.events.push({ at: now(), actor: actor.name, action: `Panel decision: ${outcome}`, note });
    addMsg(c, { author: actor.name, role: "staff", visibility: "public", body: `The appeals panel has decided to ${outcome === "uphold" ? "uphold the original decision" : outcome === "overturn" ? "overturn the original decision" : "partly uphold your appeal"}.\n\n${note}` });
    logDelivery(s, c, `Appeal decision — ${c.ref}`, note);
    return c;
  });
  if (outcome !== "uphold")
    try {
      openTask({ doctype: "Case", name: ref, state: "Appeal outcome", seq: 950, family: "do", verb: "task", role: "Certification Manager", title: `Implement appeal outcome (${outcome}) — ${c.subject}`, module: "Certification", link: `/crm/cases/${ref}`, sla_days: 5, facts: { Outcome: outcome, About: c.about?.label ?? "—" } });
    } catch {
      /* ignore */
    }
  return c;
}

/** One-off signal from another module (e.g. Standards publishes a compulsory standard). Deduped by source_ref. */
export function createSignal(c: SignalCandidate): Signal | null {
  if (!crmDemoMode()) return null;
  return mutate((s) => {
    const dup = Object.values(s.signals).find((x) => x.source_ref === c.source_ref);
    if (dup) return dup;
    const id = `SIG-${String(Date.now() % 100000).padStart(5, "0")}`;
    s.signals[id] = { ...c, id, created_at: now(), status: "new" };
    return s.signals[id];
  });
}

/* ---------------- WhatsApp channel (04 P3) ---------------- */

const digits = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-8);

/**
 * Inbound WhatsApp message: threads into the sender's most recent open case (matched on phone), or
 * opens a new enquiry/complaint. Replies on that case then go out on WhatsApp (reporter preference).
 * TODO: wire real — POST /crm/inbound/whatsapp (WhatsApp Business webhook → Frappe Communication).
 */
export async function ingestWhatsApp(input: { from: string; name?: string; body: string; type?: CaseType }): Promise<{ case: Case; threaded: boolean }> {
  guard("WhatsApp intake");
  const phone = digits(input.from);
  if (phone.length < 7) throw new Error("A sender phone number is required.");
  if (!input.body.trim()) throw new Error("The message is empty.");
  const existing = Object.values(read().cases)
    .filter((c) => !["Closed", "Resolved"].includes(c.state) && digits(c.reporter.phone) === phone)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (existing) {
    const c = mutate((s) => {
      const x = must(s, existing.ref);
      addMsg(x, { author: x.reporter.name ?? input.name ?? input.from, role: "customer", visibility: "public", body: `[WhatsApp] ${input.body.trim()}` });
      x.updated_at = now();
      return x;
    });
    return { case: c, threaded: true };
  }
  const c = await lodgeCase({
    type: input.type ?? "enquiry",
    subject: input.body.trim().split(/[.!?\n]/)[0].slice(0, 80) || "WhatsApp message",
    description: input.body.trim(),
    channel: "whatsapp",
    reporter: { anonymous: false, name: input.name, phone: input.from, preferred: "whatsapp" },
    logged_by: "WhatsApp",
  });
  return { case: c, threaded: false };
}

/* ---------------- account plans (04 P3) ---------------- */

export async function getAccountPlan(clientId: string, year = new Date().getFullYear()): Promise<AccountPlan | null> {
  guard("Account plans");
  const p = read().account_plans?.[`${clientId}|${year}`];
  return p ? structuredClone(p) : null;
}

/** Key-account plan: objectives, stakeholders (from contacts) and a yearly service plan. */
export async function saveAccountPlan(plan: Omit<AccountPlan, "updated_at" | "updated_by">, actor: CrmActor): Promise<AccountPlan> {
  guard("Account plans");
  // TODO: wire real — PUT /crm/clients/{id}/account-plan/{year}
  return mutate((s) => {
    const c = s.clients[plan.client_id];
    if (!c) throw new Error("Client not found");
    const next: AccountPlan = { ...plan, updated_at: now(), updated_by: actor.name };
    s.account_plans = { ...(s.account_plans ?? {}), [`${plan.client_id}|${plan.year}`]: next };
    c.activity.unshift({ id: `ACT-${Date.now().toString(36)}`, at: now(), kind: "note", by: actor.name, text: `Account plan ${plan.year} updated` });
    return next;
  });
}

/* ---------------- Net Promoter Score (04 P3) ---------------- */

/**
 * Sends one NPS survey after a milestone (certificate issued, calibration delivered). Idempotent per
 * milestone. Called by the certification and metrology stores; never blocks their transition.
 * TODO: wire real — POST /crm/nps {trigger, ref, email}
 */
export function sendNps(input: { trigger: NpsTrigger; ref: string; email?: string; name?: string; client_id?: string }): NpsSurvey | null {
  if (!crmDemoMode() || !input.email) return null;
  try {
    const id = `NPS-${input.trigger === "certificate_issued" ? "C" : "M"}-${input.ref}`;
    if (read().nps?.[id]) return null;
    const row = mutate((s) => {
      const r: NpsSurvey = { id, trigger: input.trigger, ref: input.ref, email: input.email!, name: input.name, client_id: input.client_id, sent_at: now() };
      s.nps = { ...(s.nps ?? {}), [id]: r };
      return r;
    });
    const what = input.trigger === "certificate_issued" ? "certification" : "calibration";
    notifySafe({ audience: "customer", to: input.email, kind: "info", ref: id, title: `How likely are you to recommend ESWASA ${what}?`, body: `${input.ref} is complete. Two clicks: score us 0–10 and tell us why.`, link: "/account/notifications", channel: ["email", "portal"] });
    return row;
  } catch {
    return null;
  }
}

export async function listNpsForCustomer(email?: string): Promise<NpsSurvey[]> {
  guard("Surveys");
  const e = email?.toLowerCase();
  return structuredClone(Object.values(read().nps ?? {}).filter((n) => !n.answered_at && (e === "demo" || !e || n.email.toLowerCase() === e || n.email === "demo")));
}

export async function answerNps(id: string, score: number, comment?: string): Promise<NpsSurvey> {
  guard("Surveys");
  if (!Number.isInteger(score) || score < 0 || score > 10) throw new Error("Choose a score from 0 to 10.");
  // TODO: wire real — POST /crm/nps/{id}/answer {score, comment}
  return mutate((s) => {
    const n = s.nps?.[id];
    if (!n) throw new Error("Survey not found");
    if (n.answered_at) throw new Error("Thanks — you've already answered this one.");
    n.score = score;
    n.comment = comment?.trim() || undefined;
    n.answered_at = now();
    if (n.client_id && s.clients[n.client_id]) s.clients[n.client_id].activity.unshift({ id: `ACT-${Date.now().toString(36)}`, at: now(), kind: "note", by: "NPS", text: `NPS ${score}/10 after ${n.ref}${n.comment ? ` — “${n.comment}”` : ""}` });
    return n;
  });
}

export type NpsSummary = { nps: number | null; responses: number; sent: number; promoters: number; passives: number; detractors: number; byTrigger: Record<NpsTrigger, { nps: number | null; responses: number }>; recent: NpsSurvey[] };

export async function npsSummary(): Promise<NpsSummary> {
  if (!crmDemoMode()) {
    return {
      nps: null,
      responses: 0,
      sent: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      byTrigger: {
        certificate_issued: { nps: null, responses: 0 },
        calibration_delivered: { nps: null, responses: 0 },
      },
      recent: [],
    };
  }
  guard("NPS");
  const all = Object.values(read().nps ?? {});
  const score = (rows: NpsSurvey[]) => {
    const a = rows.filter((r) => r.score !== undefined);
    if (!a.length) return { nps: null, responses: 0 };
    const p = a.filter((r) => r.score! >= 9).length;
    const d = a.filter((r) => r.score! <= 6).length;
    return { nps: Math.round(((p - d) / a.length) * 100), responses: a.length };
  };
  const answered = all.filter((r) => r.score !== undefined);
  return {
    ...score(all),
    sent: all.length,
    promoters: answered.filter((r) => r.score! >= 9).length,
    passives: answered.filter((r) => r.score! >= 7 && r.score! <= 8).length,
    detractors: answered.filter((r) => r.score! <= 6).length,
    byTrigger: { certificate_issued: score(all.filter((r) => r.trigger === "certificate_issued")), calibration_delivered: score(all.filter((r) => r.trigger === "calibration_delivered")) },
    recent: structuredClone(answered.sort((a, b) => b.answered_at!.localeCompare(a.answered_at!)).slice(0, 8)),
  };
}
