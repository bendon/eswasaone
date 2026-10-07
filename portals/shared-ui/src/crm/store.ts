/**
 * CRM & service-desk data layer shared by the Service and Institution portals.
 *
 * Core has no /crm/* or /cases/* endpoints yet, so every call goes to a local store that
 * loads only with VITE_DEMO_MODE=true (same rule as certification/deskApi.ts). Outside demo
 * mode each call throws CrmNotConnectedError and screens show their not-connected state.
 * Both portals share one origin (/ and /institution/), so a case lodged publicly shows up in
 * the staff queue, and the `storage` event keeps open tabs in sync.
 *
 * TODO: wire real — provisional endpoints:
 *   POST /cases · GET /cases · GET|PATCH /cases/{ref} · POST /cases/{ref}/act · POST /cases/{ref}/messages
 *   POST /cases/lookup · GET /crm/clients · GET /crm/clients/{id} · GET|PATCH /crm/signals
 *   GET|POST|PATCH /crm/opportunities · GET|POST|PATCH /crm/quotes · GET|PUT /crm/config
 */
import { DEFAULT_CONFIG } from "./config";
import { canTransition, findTransition, type CaseActionId } from "./caseFlow";
import { workingDaysBetween } from "./sla";
import { SEED_CASES, SEED_CLIENTS, SEED_OPPORTUNITIES, SEED_QUOTES, SEED_SIGNALS } from "./seed";
import type {
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
} from "./types";

/* ---------------- mode ---------------- */

export function crmDemoMode(): boolean {
  try {
    return String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
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
  cache = autoClose(s);
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
  guard("Case");
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
    if (visibility === "public") c.acknowledged_at ??= now();
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
  guard("Clients");
  return structuredClone(Object.values(read().clients)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(id: string): Promise<Client | null> {
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

export async function listOpportunities(): Promise<Opportunity[]> {
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

const STAGE_PROB: Record<OpportunityStage, number> = { qualify: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };

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
