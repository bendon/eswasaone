/**
 * Governance store (gap 03; workflow map §3.10, §5.5). Replaces governance/stubs.ts.
 * Every transition runs through workflow/engine with the governance defs and syncs Approvals tasks.
 *
 * Provisional Core endpoints (TODO: wire real — add to contracts/openapi.yaml first):
 *   GET/POST /governance/meetings, POST /governance/meetings/{id}/act (exists),
 *   POST /governance/meetings/{id}/agenda, POST /governance/meetings/{id}/run (attendance, votes),
 *   PUT /governance/meetings/{id}/minutes, GET /governance/packs/{meeting} (exists),
 *   PATCH /governance/packs/{id}/sections (exists), POST /governance/packs/{id}/assemble|issue (exist),
 *   POST /governance/resolutions/{id}/act (exists), POST /governance/resolutions/written,
 *   POST /governance/resolutions/{id}/votes, GET/PATCH /governance/actions,
 *   GET/POST /governance/risks, PUT /governance/risk-appetite, POST /governance/declarations,
 *   PUT /governance/bodies/{id}, GET /governance/overview (exists).
 */
import { notifySafe } from "../notify/store";
import { renderTemplate } from "../notify/templates";
import { createLocalStore, isoIn, nowIso } from "../store/localStore";
import { closeRecordTasks, openTask, reconcileTasks, syncRecordTasks, taskStore } from "../tasks/store";
import { allowedActions, applyTransition, findTransition } from "../workflow/engine";
import type { ActInput, ActionOption, Actor, HistoryEvent } from "../workflow/types";
import { ACTION_DEF, MEETING_DEF, PACK_DEF, RESOLUTION_DEF, RISK_DEF } from "./defs";
import {
  SEED_ACTIONS,
  SEED_BODIES,
  SEED_DECLARATIONS,
  SEED_MEETINGS,
  SEED_MEMBERS,
  SEED_PACKS,
  SEED_RESOLUTIONS,
  SEED_RISKS,
  SEED_SETTINGS,
} from "./seed";
import type {
  AgendaItem,
  Attendance,
  Declaration,
  Evaluation,
  GovBody,
  GovMember,
  GovSettings,
  Meeting,
  Pack,
  PackSection,
  ResAction,
  Resolution,
  Risk,
  RiskCategory,
  Vote,
  OnboardingSignoff,
} from "./types";

type GovState = {
  v: 2;
  seq: number;
  bodies: Record<string, GovBody>;
  members: Record<string, GovMember>;
  meetings: Record<string, Meeting>;
  packs: Record<string, Pack>;
  resolutions: Record<string, Resolution>;
  actions: Record<string, ResAction>;
  risks: Record<string, Risk>;
  declarations: Record<string, Declaration>;
  settings: GovSettings;
  evaluations: Record<string, Evaluation>;
  /** Board member private notes: `${member}|${packId}|${sectionId}` → text (never shared). */
  notes: Record<string, string>;
  /** Onboarding pack sign-offs `${member}|${docId}` (03 P3). Optional so older saved state still loads. */
  onboarding?: Record<string, OnboardingSignoff>;
};

const byId = <T,>(rows: T[], key: (r: T) => string) => Object.fromEntries(rows.map((r) => [key(r), structuredClone(r)]));

function seed(): GovState {
  return {
    v: 2,
    seq: 40,
    bodies: byId(SEED_BODIES, (b) => b.id),
    members: byId(SEED_MEMBERS, (m) => m.name),
    meetings: byId(SEED_MEETINGS, (m) => m.id),
    packs: byId(SEED_PACKS, (p) => p.id),
    resolutions: byId(SEED_RESOLUTIONS, (r) => r.id),
    actions: byId(SEED_ACTIONS, (a) => a.id),
    risks: byId(SEED_RISKS, (r) => r.id),
    declarations: byId(SEED_DECLARATIONS, (d) => d.id),
    settings: structuredClone(SEED_SETTINGS),
    evaluations: {},
    notes: {},
  };
}

export const govStore = createLocalStore<GovState>({
  key: "eswasaone.governance.v2",
  v: 2,
  seed,
  onRead: (s) => {
    closeExpiredWrittenResolutions(s);
  },
});

const guard = (what: string) => govStore.guard(what);

/* ---------------- helpers ---------------- */

function nextId(s: GovState, prefix: string): string {
  s.seq += 1;
  return `${prefix}-${new Date().getFullYear()}-${String(s.seq).padStart(3, "0")}`;
}

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`${what} not found.`);
  return row;
}

export const riskScoreOf = (x: { l: number; i: number }) => x.l * x.i;

function bodyOf(s: GovState, m: Meeting): GovBody {
  return s.bodies[m.body_id] ?? SEED_BODIES[0];
}

function presentCount(m: Meeting): number {
  return Object.values(m.attendance).filter((a) => a.present).length;
}

export function quorumMet(m: Meeting, body: GovBody): boolean {
  return presentCount(m) >= body.quorum;
}

/** Previous meeting of the same body (whose minutes this meeting approves). */
function previousMeeting(s: GovState, m: Meeting): Meeting | undefined {
  return Object.values(s.meetings)
    .filter((x) => x.body_id === m.body_id && x.id !== m.id && x.scheduled_at < m.scheduled_at && x.state !== "Cancelled")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];
}

function nextMeeting(s: GovState, m: Meeting): Meeting | undefined {
  return Object.values(s.meetings)
    .filter((x) => x.body_id === m.body_id && x.id !== m.id && x.scheduled_at > m.scheduled_at && x.state !== "Cancelled")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

/* ---------------- task sync ---------------- */

function meetingTasks(m: Meeting, by?: string, outcome?: string) {
  syncRecordTasks({ def: MEETING_DEF, rec: m, name: m.id, title: m.title, link: `/board/meetings/${m.id}`, module: "Governance", by, outcome, facts: { Body: m.body_id, Date: new Date(m.scheduled_at).toLocaleDateString(), Venue: m.venue } });
}

function actionTasks(a: ResAction, by?: string, outcome?: string) {
  syncRecordTasks({ def: ACTION_DEF, rec: a, name: a.id, title: a.description, link: `/board/resolutions/${a.resolution_id}`, module: "Governance", by, outcome, facts: { Resolution: a.resolution_id, Due: new Date(a.due).toLocaleDateString(), Progress: `${a.progress}%` } });
}

function riskTasks(r: Risk, by?: string, outcome?: string) {
  syncRecordTasks({ def: RISK_DEF, rec: r, name: r.id, title: r.title, link: `/board/risks/${r.id}`, module: "Governance", by, outcome, facts: { Category: r.category, Residual: String(riskScoreOf(r.residual)), Owner: r.owner } });
}

function sectionTask(p: Pack, sec: PackSection, meeting: Meeting) {
  if (sec.status === "ready" || !sec.included) {
    closeRecordTasks("Board Pack Section", `${p.id}:${sec.id}`, "Section ready", sec.updated_by ?? "System");
    return;
  }
  openTask({
    doctype: "Board Pack Section",
    name: `${p.id}:${sec.id}`,
    state: "Awaiting owner",
    seq: 1,
    family: "do",
    verb: "task",
    role: "Desk User",
    assignee: sec.owner,
    title: `Board pack section due: ${sec.title} (${meeting.title})`,
    module: "Governance",
    link: `/board/pack/${meeting.id}`,
    sla_days: Math.max(1, daysBetween(nowIso(), sec.due)),
    rule: "R-G1",
    facts: { Meeting: meeting.title, Due: new Date(sec.due).toLocaleDateString(), Source: sec.source.replace("_", " ") },
  });
}

/** R-G3: residual above appetite → alert task + flagged for the next pack. */
function appetiteCheck(s: GovState, r: Risk) {
  const limit = s.settings.appetite[r.category];
  const over = r.state !== "Closed" && riskScoreOf(r.residual) > limit;
  const name = `${r.id}:appetite`;
  if (over) {
    r.in_pack = true;
    openTask({
      doctype: "Risk Appetite Breach",
      name,
      state: `Above appetite (${riskScoreOf(r.residual)} > ${limit})`,
      seq: r.seq,
      family: "alert",
      role: "Eswasa Risk Officer",
      title: `Risk ${r.id} above ${r.category} appetite — ${r.title}`,
      module: "Governance",
      link: `/board/risks/${r.id}`,
      sla_days: 2,
      rule: "R-G3",
      priority: "high",
      facts: { Residual: `${riskScoreOf(r.residual)} (L${r.residual.l} × I${r.residual.i})`, Appetite: String(limit), Owner: r.owner },
    });
  } else {
    closeRecordTasks("Risk Appetite Breach", name, "Back within appetite", "System");
  }
}

let reconciled = false;
/** L1 reconciler — backfill tasks for the seed and anything that lost its task. Once per session. */
export function reconcileGovernanceTasks(): void {
  if (reconciled) return;
  reconciled = true;
  try {
    const s = govStore.read();
    const known = taskStore.read().tasks;
    reconcileTasks(MEETING_DEF, Object.values(s.meetings).map((m) => ({ rec: m, name: m.id, title: m.title, link: `/board/meetings/${m.id}`, module: "Governance" as const })));
    reconcileTasks(ACTION_DEF, Object.values(s.actions).map((a) => ({ rec: a, name: a.id, title: a.description, link: `/board/resolutions/${a.resolution_id}`, module: "Governance" as const })));
    reconcileTasks(RISK_DEF, Object.values(s.risks).map((r) => ({ rec: r, name: r.id, title: r.title, link: `/board/risks/${r.id}`, module: "Governance" as const })));
    for (const p of Object.values(s.packs)) {
      const m = s.meetings[p.meeting_id];
      if (!m || p.state === "Issued") continue;
      for (const sec of p.sections) {
        if (sec.status !== "ready" && sec.included && !Object.keys(known).some((k) => k.startsWith(`Board Pack Section|${p.id}:${sec.id}|`))) sectionTask(p, sec, m);
      }
    }
    for (const r of Object.values(s.risks)) {
      if (riskScoreOf(r.residual) > s.settings.appetite[r.category] && !Object.keys(known).some((k) => k.startsWith(`Risk Appetite Breach|${r.id}:appetite|`))) appetiteCheck(s, r);
    }
  } catch {
    /* task store unavailable */
  }
}

/* ---------------- written resolutions: auto close ---------------- */

export function tally(r: Resolution): { for: number; against: number; abstain: number; recused: number; cast: number; passes: boolean; needed: string } {
  const vs = Object.values(r.votes);
  const n = (v: Vote) => vs.filter((x) => x === v).length;
  const t = { for: n("for"), against: n("against"), abstain: n("abstain"), recused: n("recused") };
  const cast = t.for + t.against + t.abstain;
  const w = r.window;
  let passes = t.for > t.against;
  let needed = "More for than against";
  if (w) {
    if (w.threshold === "two_thirds") {
      passes = t.for * 3 >= cast * 2 && cast > 0;
      needed = "Two-thirds of votes cast";
    } else if (w.threshold === "unanimous") {
      passes = t.for === cast && cast > 0;
      needed = "Every vote cast in favour";
    }
    if (cast < w.min_votes) passes = false;
    needed += ` · at least ${w.min_votes} votes`;
  }
  return { ...t, cast, passes, needed };
}

function closeExpiredWrittenResolutions(s: GovState) {
  const now = Date.now();
  for (const r of Object.values(s.resolutions)) {
    if (r.state !== "Circulated" || !r.window || new Date(r.window.closes).getTime() > now) continue;
    const t = tally(r);
    const to = t.passes ? "Passed" : "Lapsed";
    r.history.push({ at: r.window.closes, actor: "System", action: "Voting window closed", from: "Circulated", to, note: `${t.for} for · ${t.against} against · ${t.abstain} abstain (${t.needed})`, rule: t.passes ? "R-G2" : undefined });
    r.state = to;
    r.seq += 1;
    r.decided_at = r.window.closes;
  }
}

/* ---------------- reads ---------------- */

export async function listBodies(): Promise<GovBody[]> {
  guard("Governance bodies");
  return govStore.view((s) => Object.values(s.bodies));
}

export async function listMembers(): Promise<GovMember[]> {
  guard("Board members");
  return govStore.view((s) => Object.values(s.members));
}

export async function getSettings(): Promise<GovSettings> {
  guard("Governance settings");
  return govStore.view((s) => s.settings);
}

export async function listMeetings(f: { body?: string } = {}): Promise<Meeting[]> {
  guard("Meetings");
  reconcileGovernanceTasks();
  return govStore.view((s) =>
    Object.values(s.meetings)
      .filter((m) => !f.body || m.body_id === f.body)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
  );
}

export type MeetingBundle = {
  meeting: Meeting;
  body: GovBody;
  pack: Pack | null;
  previous: Meeting | null;
  next: Meeting | null;
  resolutions: Resolution[];
  members: GovMember[];
};

export async function getMeeting(id: string): Promise<MeetingBundle | null> {
  guard("Meetings");
  reconcileGovernanceTasks();
  return govStore.view((s) => {
    const m = s.meetings[id];
    if (!m) return null;
    const body = bodyOf(s, m);
    return {
      meeting: m,
      body,
      pack: s.packs[m.pack_id] ?? null,
      previous: previousMeeting(s, m) ?? null,
      next: nextMeeting(s, m) ?? null,
      resolutions: Object.values(s.resolutions).filter((r) => r.meeting_id === id),
      members: body.members.map((n) => s.members[n]).filter(Boolean),
    };
  });
}

/** Meeting actions with the cross-record guards (pack ready, quorum, next meeting) explained. */
export function meetingActions(id: string, actor: Actor): ActionOption[] {
  const s = govStore.read();
  const m = s.meetings[id];
  if (!m) return [];
  const body = bodyOf(s, m);
  return allowedActions(MEETING_DEF, m, actor).map((a) => {
    let why: string | undefined = a.disabledReason;
    if (a.action === "issue_pack") why ??= packIssueBlock(s, m) ?? undefined;
    if (a.action === "close_meeting") {
      if (!m.run?.started_at) why ??= "Open Run meeting and take attendance first.";
      else if (!quorumMet(m, body)) why ??= `Quorum not met (${presentCount(m)} of ${body.quorum} present).`;
    }
    if (a.action === "approve_minutes") {
      const nxt = nextMeeting(s, m);
      if (!nxt || !nxt.run?.started_at) why ??= `Minutes are approved at the next ${body.short} meeting${nxt ? ` (${nxt.title})` : ""}. Approve them from its Run meeting console.`;
    }
    return { ...a, disabledReason: why };
  });
}

function packIssueBlock(s: GovState, m: Meeting): string | null {
  const p = s.packs[m.pack_id];
  const body = bodyOf(s, m);
  if (!p) return "No pack for this meeting.";
  const notReady = p.sections.filter((x) => x.included && x.status !== "ready");
  if (notReady.length) return `${notReady.length} included section(s) not Ready: ${notReady.map((x) => x.title).join(", ")}.`;
  if (p.state !== "Assembled") return "Assemble a version of the pack first.";
  if (!m.agenda_final) return "Finalise the agenda first.";
  if (!m.notice_issued_at) return "Issue the notice of meeting first.";
  if (daysBetween(m.notice_issued_at, m.scheduled_at) < body.notice_days) return `Notice was issued less than ${body.notice_days} days before the meeting (${body.short} rule).`;
  return null;
}

export function packIssueProblem(meetingId: string): string | null {
  const s = govStore.read();
  const m = s.meetings[meetingId];
  return m ? packIssueBlock(s, m) : "Meeting not found.";
}

/* ---------------- meetings: writes ---------------- */

export async function scheduleMeeting(
  input: { body_id: string; title: string; scheduled_at: string; venue: string; online_link?: string },
  actor: Actor,
): Promise<Meeting> {
  guard("Scheduling meetings");
  if (!input.title.trim()) throw new Error("Give the meeting a title.");
  if (Number.isNaN(new Date(input.scheduled_at).getTime())) throw new Error("Choose a valid date and time.");
  const m = govStore.mutate((s) => {
    const body = must(s.bodies[input.body_id], "Body");
    const id = nextId(s, input.body_id === "BOARD" ? "BM" : input.body_id);
    const packId = `BP-${id}`;
    const prev = Object.values(s.meetings)
      .filter((x) => x.body_id === body.id && x.state !== "Cancelled" && x.scheduled_at < input.scheduled_at)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];
    const agenda: AgendaItem[] = [
      { id: `${id}-1`, title: "Opening, apologies and declarations of interest", kind: "noting", presenter: body.chair, minutes: 5, section_ids: [], papers: [] },
    ];
    if (prev) agenda.push({ id: `${id}-2`, title: `Approval of minutes of ${prev.title}`, kind: "decision", presenter: body.chair, minutes: 5, section_ids: [], papers: [], approve_minutes_of: prev.id });
    const due = new Date(new Date(input.scheduled_at).getTime() - (body.pack_days + 3) * 86_400_000).toISOString();
    const sections: PackSection[] =
      body.kind === "board"
        ? s.settings.section_templates.map((t, i) => ({ id: `${packId}-S${i + 1}`, title: t.title, owner: t.owner, source: t.source, module: t.module, status: "awaiting", included: true, restricted: t.title.startsWith("Management accounts"), due }))
        : [{ id: `${packId}-S1`, title: "Committee papers", owner: body.secretary, source: "upload", status: "awaiting", included: true, restricted: false, due }];
    const meeting: Meeting = {
      id,
      body_id: body.id,
      title: input.title.trim(),
      scheduled_at: new Date(input.scheduled_at).toISOString(),
      venue: input.venue.trim() || "ESWASA Boardroom, Matsapha",
      online_link: input.online_link,
      agenda,
      agenda_final: false,
      attendance: Object.fromEntries(body.members.map((n) => [n, { rsvp: "pending" as const }])),
      declarations: [],
      pack_id: packId,
      state: "Scheduled",
      seq: 1,
      history: [{ at: nowIso(), actor: actor.name, action: "Scheduled", to: "Scheduled", rule: "R-G1", note: "Pack opened and section owners asked for papers", on_behalf_of: actor.on_behalf_of }],
    };
    // R-G1: open the pack (Draft) with section owner tasks.
    const pack: Pack = { id: packId, meeting_id: id, sections, versions: [], state: "Draft", seq: 0, history: [{ at: nowIso(), actor: "System", action: "Opened (R-G1)", to: "Draft", rule: "R-G1" }] };
    s.meetings[id] = meeting;
    s.packs[packId] = pack;
    return meeting;
  });
  meetingTasks(m, actor.name, "Scheduled");
  const s = govStore.read();
  const p = s.packs[m.pack_id];
  for (const sec of p.sections) sectionTask(p, sec, m);
  return m;
}

export async function actOnMeeting(id: string, action: string, actor: Actor, input: ActInput): Promise<Meeting> {
  guard("Meeting actions");
  const opt = meetingActions(id, actor).find((a) => a.action === action);
  if (opt?.disabledReason) throw new Error(opt.disabledReason);
  if (action === "issue_pack") {
    const s = govStore.read();
    const m = must(s.meetings[id], "Meeting");
    await actOnPack(m.pack_id, "issue", actor, { expected_state: s.packs[m.pack_id]?.state ?? "", reason: input.reason });
    return must(govStore.view((x) => x.meetings[id]), "Meeting");
  }
  const m = govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    const res = applyTransition(MEETING_DEF, m, action, actor, input);
    if (action === "reschedule" && input.payload?.scheduled_at) {
      const d = new Date(input.payload.scheduled_at.replace(" ", "T"));
      if (Number.isNaN(d.getTime())) throw new Error("The new date isn't valid.");
      res.event.changes = [{ field: "Date", from: new Date(m.scheduled_at).toLocaleString(), to: d.toLocaleString() }];
      m.scheduled_at = d.toISOString();
      const p = s.packs[m.pack_id];
      if (p && p.state === "Issued") {
        p.state = "Draft";
        p.seq += 1;
        p.history.push({ at: nowIso(), actor: actor.name, action: "Back to draft (meeting rescheduled)", from: "Issued", to: "Draft", reason: input.reason });
      }
    }
    if (action === "close_meeting") m.run = { ...m.run, ended_at: m.run?.ended_at ?? nowIso() };
    if (action === "start_minutes") m.minutes ??= draftMinutes(s, m);
    if (action === "submit_minutes" && m.minutes) m.minutes.submitted_at = nowIso();
    if (action === "cancel") closeRecordTasks("Board Meeting", m.id, "Cancelled", actor.name);
    return m;
  });
  meetingTasks(m, actor.name, findTransition(MEETING_DEF, action, input.expected_state)?.label);
  if (["reschedule", "cancel"].includes(action)) notifyMembers(m, action === "cancel" ? `${m.title} cancelled` : `${m.title} rescheduled`, action === "cancel" ? `The meeting has been cancelled. Reason: ${input.reason}` : `The meeting is now on ${new Date(m.scheduled_at).toLocaleString()}. Reason: ${input.reason}`);
  return m;
}

function draftMinutes(s: GovState, m: Meeting): Meeting["minutes"] {
  const body = bodyOf(s, m);
  const present = Object.entries(m.attendance).filter(([, a]) => a.present).map(([n]) => n);
  const apologies = Object.entries(m.attendance).filter(([, a]) => a.apology).map(([n]) => n);
  const items: Record<string, string> = {};
  for (const it of m.agenda) {
    const d = it.decision;
    if (!d) {
      items[it.id] = "";
      continue;
    }
    const tallyText = Object.keys(d.votes).length
      ? ` Votes: ${Object.values(d.votes).filter((v) => v === "for").length} for, ${Object.values(d.votes).filter((v) => v === "against").length} against, ${Object.values(d.votes).filter((v) => v === "abstain").length} abstained${Object.values(d.votes).some((v) => v === "recused") ? `, ${Object.entries(d.votes).filter(([, v]) => v === "recused").map(([n]) => n).join(", ")} recused` : ""}.`
      : "";
    items[it.id] = `${d.text}${tallyText}${d.resolution_id ? ` (${d.resolution_id})` : ""}`;
  }
  const decl = m.declarations.length ? ` Declarations: ${m.declarations.map((d) => `${d.member} — ${d.interest}`).join("; ")}.` : " No declarations of interest were made.";
  return {
    general: `The ${body.name} met on ${new Date(m.scheduled_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} at ${m.venue}. Present: ${present.join(", ") || "—"}. Apologies: ${apologies.join(", ") || "none"}. ${quorumMet(m, body) ? "A quorum was present." : "No quorum."}${decl}`,
    items,
  };
}

export async function saveAgenda(id: string, agenda: AgendaItem[], actor: Actor): Promise<Meeting> {
  guard("Agenda");
  return govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    if (!["Scheduled", "Pack issued"].includes(m.state)) throw new Error("The agenda is locked once the meeting has been held.");
    m.agenda = agenda;
    m.history.push({ at: nowIso(), actor: actor.name, action: "Agenda updated", note: `${agenda.length} items` });
    return m;
  });
}

export async function finaliseAgenda(id: string, final: boolean, actor: Actor): Promise<Meeting> {
  return govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    m.agenda_final = final;
    m.history.push({ at: nowIso(), actor: actor.name, action: final ? "Agenda finalised" : "Agenda reopened" });
    return m;
  });
}

export function noticePreview(id: string, member = "Member"): { subject: string; body: string; channel: ("email" | "sms" | "portal")[] } | null {
  const s = govStore.read();
  const m = s.meetings[id];
  if (!m) return null;
  const body = bodyOf(s, m);
  const r = renderTemplate("board.meeting_notice", { name: member, meeting: m.title, date: new Date(m.scheduled_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }), venue: m.venue, pack_days: body.pack_days, secretary: body.secretary });
  if (!r) return null;
  return { ...r, body: `${r.body}\n\nAGENDA\n${m.agenda.map((a, i) => `${i + 1}. ${a.title} (${a.kind})`).join("\n")}` };
}

export async function issueNotice(id: string, actor: Actor): Promise<Meeting> {
  guard("Notice of meeting");
  const m = govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    if (!m.agenda_final) throw new Error("Finalise the agenda before issuing the notice.");
    m.notice_issued_at = nowIso();
    m.history.push({ at: m.notice_issued_at, actor: actor.name, action: "Notice of meeting issued" });
    return m;
  });
  notifyMembers(m, `Notice of meeting — ${m.title}`, noticePreview(id)?.body ?? "");
  return m;
}

function notifyMembers(m: Meeting, title: string, body: string) {
  for (const name of Object.keys(m.attendance)) {
    notifySafe({ audience: "member", to: name, kind: "board", title, body, link: `/member/meetings/${m.id}`, channel: ["email", "portal"] });
  }
}

/* ---------------- run meeting (G7) ---------------- */

export async function startRun(id: string, actor: Actor): Promise<Meeting> {
  guard("Run meeting");
  return govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    if (!["Pack issued", "Scheduled"].includes(m.state)) throw new Error("This meeting has already been held.");
    m.run = { ...m.run, started_at: m.run?.started_at ?? nowIso() };
    m.history.push({ at: nowIso(), actor: actor.name, action: "Meeting opened" });
    return m;
  });
}

export async function setAttendance(id: string, member: string, patch: Partial<Attendance>, actor: Actor): Promise<Meeting> {
  return govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    const cur = m.attendance[member] ?? { rsvp: "pending" };
    m.attendance[member] = { ...cur, ...patch, arrived_at: patch.present && !cur.present ? nowIso() : cur.arrived_at };
    if (patch.rsvp && actor.name !== member) m.history.push({ at: nowIso(), actor: actor.name, action: `RSVP for ${member}: ${patch.rsvp}` });
    return m;
  });
}

export async function recordDeclaration(input: Omit<Declaration, "id" | "at">): Promise<Declaration> {
  guard("Declarations");
  if (!input.interest.trim()) throw new Error("Describe the interest.");
  // TODO: wire real — POST /governance/declarations
  return govStore.mutate((s) => {
    const d: Declaration = { ...input, id: nextId(s, "DEC"), at: nowIso() };
    s.declarations[d.id] = d;
    if (d.meeting_id && s.meetings[d.meeting_id]) {
      s.meetings[d.meeting_id].declarations.push(d);
    }
    return d;
  });
}

/**
 * Record a per-item decision. For "decision" items this creates the resolution in one click and,
 * when passed, R-G2 action tasks. Approving previous minutes moves that meeting to Minutes approved.
 */
export async function recordItemDecision(
  meetingId: string,
  itemId: string,
  d: { outcome: NonNullable<AgendaItem["decision"]>["outcome"]; text: string; votes: Record<string, Vote>; actions?: { description: string; owner: string; due: string }[]; title?: string },
  actor: Actor,
): Promise<Meeting> {
  guard("Recording decisions");
  if (!d.text.trim()) throw new Error("Write the decision as it should appear in the minutes.");
  let approvePrev: string | undefined;
  let newRes: Resolution | undefined;
  const m = govStore.mutate((s) => {
    const m = must(s.meetings[meetingId], "Meeting");
    const it = must(m.agenda.find((x) => x.id === itemId), "Agenda item");
    const conflicted = m.declarations.filter((x) => x.item_id === itemId).map((x) => x.member);
    for (const c of conflicted) if (d.votes[c] && d.votes[c] !== "recused") throw new Error(`${c} declared an interest on this item and must be recorded as recused.`);
    let resolution_id = it.decision?.resolution_id;
    if (it.kind === "decision" && !it.approve_minutes_of && !resolution_id && d.outcome !== "noted") {
      const r: Resolution = {
        id: nextId(s, "RES"),
        title: d.title?.trim() || it.title,
        text: d.text.trim(),
        body_id: m.body_id,
        kind: "meeting",
        meeting_id: m.id,
        item_id: it.id,
        proposed_by: it.presenter,
        proposed_at: nowIso(),
        votes: d.votes,
        papers: it.papers,
        state: "Proposed",
        seq: 0,
        history: [{ at: nowIso(), actor: actor.name, action: "Proposed in meeting", to: "Proposed" }],
      };
      const action = d.outcome === "approved" ? "pass" : d.outcome === "rejected" ? "reject" : "defer";
      applyTransition(RESOLUTION_DEF, r, action, actor, { expected_state: "Proposed", reason: action === "pass" ? undefined : d.text.trim() });
      if (action === "pass") r.decided_at = nowIso();
      s.resolutions[r.id] = r;
      resolution_id = r.id;
      newRes = r;
    }
    if (it.approve_minutes_of && d.outcome === "approved") approvePrev = it.approve_minutes_of;
    it.decision = { outcome: d.outcome, text: d.text.trim(), votes: d.votes, resolution_id, at: nowIso() };
    m.history.push({ at: nowIso(), actor: actor.name, action: `Decision recorded: ${it.title}`, note: `${d.outcome}${resolution_id ? ` → ${resolution_id}` : ""}` });
    return m;
  });
  if (newRes && (newRes as Resolution).state === "Passed") {
    for (const a of d.actions ?? []) await addAction((newRes as Resolution).id, a, actor);
  }
  if (approvePrev) {
    const s = govStore.read();
    const prev = s.meetings[approvePrev];
    if (prev && prev.state === "Minutes submitted") {
      govStore.mutate((st) => {
        const p = st.meetings[approvePrev!];
        applyTransition(MEETING_DEF, p, "approve_minutes", actor, { expected_state: "Minutes submitted", note: `Approved at ${m.title}` });
        p.minutes = { ...(p.minutes ?? { general: "", items: {} }), approved_at: nowIso(), approved_at_meeting: m.id };
      });
      meetingTasks(govStore.view((st) => st.meetings[approvePrev!]), actor.name, "Minutes approved");
    }
  }
  return m;
}

export async function setCurrentItem(meetingId: string, itemId: string): Promise<void> {
  govStore.mutate((s) => {
    const m = must(s.meetings[meetingId], "Meeting");
    m.run = { ...m.run, current_item: itemId };
  });
}

/* ---------------- minutes (G1) ---------------- */

export async function saveMinutes(id: string, patch: { general?: string; items?: Record<string, string> }, actor: Actor): Promise<Meeting> {
  guard("Minutes");
  // TODO: wire real — PUT /governance/meetings/{id}/minutes
  return govStore.mutate((s) => {
    const m = must(s.meetings[id], "Meeting");
    if (m.state !== "Minutes draft") throw new Error(m.state === "Minutes approved" ? "Approved minutes are a gate document and can't be edited." : "Start the minutes first.");
    m.minutes = { ...(m.minutes ?? { general: "", items: {} }), ...(patch.general !== undefined ? { general: patch.general } : {}), items: { ...(m.minutes?.items ?? {}), ...(patch.items ?? {}) } };
    const last = m.history[m.history.length - 1];
    if (!(last?.action === "Minutes edited" && last.actor === actor.name)) m.history.push({ at: nowIso(), actor: actor.name, action: "Minutes edited" });
    return m;
  });
}

/* ---------------- pack (G9) ---------------- */

export async function getPack(meetingId: string): Promise<{ pack: Pack; meeting: Meeting; body: GovBody } | null> {
  guard("Board pack");
  reconcileGovernanceTasks();
  return govStore.view((s) => {
    const m = s.meetings[meetingId];
    if (!m) return null;
    const p = s.packs[m.pack_id];
    return p ? { pack: p, meeting: m, body: bodyOf(s, m) } : null;
  });
}

export function packActions(packId: string, actor: Actor): ActionOption[] {
  const s = govStore.read();
  const p = s.packs[packId];
  if (!p) return [];
  const m = s.meetings[p.meeting_id];
  return allowedActions(PACK_DEF, p, actor).map((a) => (a.action === "issue" && m ? { ...a, disabledReason: a.disabledReason ?? packIssueBlock(s, m) ?? undefined } : a));
}

export async function updateSection(packId: string, sectionId: string, patch: Partial<Pick<PackSection, "content" | "file" | "status" | "included" | "restricted" | "owner" | "due" | "title">>, actor: Actor): Promise<PackSection> {
  guard("Pack sections");
  // TODO: wire real — PATCH /governance/packs/{id}/sections
  const out = govStore.mutate((s) => {
    const p = must(s.packs[packId], "Pack");
    if (p.state === "Issued") throw new Error("This pack is issued. Supersede it with a new version to change sections.");
    const sec = must(p.sections.find((x) => x.id === sectionId), "Section");
    if (patch.status === "ready" && sec.source !== "live_module" && !(patch.content ?? sec.content)?.trim() && !(patch.file ?? sec.file)) throw new Error("Write the section or upload a paper before marking it Ready.");
    Object.assign(sec, patch, { updated_at: nowIso(), updated_by: actor.name });
    if (p.state === "Assembled" && (patch.content !== undefined || patch.file !== undefined)) {
      p.state = "Draft";
      p.seq += 1;
      p.history.push({ at: nowIso(), actor: actor.name, action: "Back to draft (section changed)", from: "Assembled", to: "Draft" });
    }
    return sec;
  });
  const s = govStore.read();
  const p = s.packs[packId];
  sectionTask(p, p.sections.find((x) => x.id === sectionId)!, s.meetings[p.meeting_id]);
  return out;
}

export async function addSection(packId: string, input: { title: string; owner: string; source: PackSection["source"]; due: string }, actor: Actor): Promise<PackSection> {
  guard("Pack sections");
  const sec = govStore.mutate((s) => {
    const p = must(s.packs[packId], "Pack");
    if (p.state === "Issued") throw new Error("This pack is issued.");
    const sec: PackSection = { id: `${packId}-S${p.sections.length + 1}-${Date.now() % 1000}`, title: input.title.trim(), owner: input.owner, source: input.source, status: "awaiting", included: true, restricted: false, due: input.due };
    p.sections.push(sec);
    p.history.push({ at: nowIso(), actor: actor.name, action: `Section added: ${sec.title}` });
    return sec;
  });
  const s = govStore.read();
  sectionTask(s.packs[packId], sec, s.meetings[s.packs[packId].meeting_id]);
  return sec;
}

export async function moveSection(packId: string, sectionId: string, dir: -1 | 1): Promise<void> {
  govStore.mutate((s) => {
    const p = must(s.packs[packId], "Pack");
    const i = p.sections.findIndex((x) => x.id === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.sections.length) return;
    [p.sections[i], p.sections[j]] = [p.sections[j], p.sections[i]];
  });
}

export function reminderPreview(packId: string, sectionId: string) {
  const s = govStore.read();
  const p = s.packs[packId];
  const sec = p?.sections.find((x) => x.id === sectionId);
  const m = p ? s.meetings[p.meeting_id] : undefined;
  if (!sec || !m) return null;
  const r = renderTemplate("board.section_reminder", { name: sec.owner, section: sec.title, meeting: m.title, due: new Date(sec.due).toLocaleDateString(undefined, { day: "numeric", month: "long" }), secretary: bodyOf(s, m).secretary });
  return r ? { to: sec.owner, ...r } : null;
}

export async function remindOwner(packId: string, sectionId: string, actor: Actor): Promise<void> {
  const prev = reminderPreview(packId, sectionId);
  if (!prev) throw new Error("Section not found.");
  notifySafe({ audience: "staff", to: prev.to, kind: "board", title: prev.subject, body: prev.body, link: `/board/pack`, channel: prev.channel });
  govStore.mutate((s) => {
    s.packs[packId].history.push({ at: nowIso(), actor: actor.name, action: `Reminder sent to ${prev.to}` });
  });
}

/** Live module figures for roll-up sections, frozen into the snapshot at assembly (map: snapshotted per version). */
async function liveFigures(s: GovState, sec: PackSection): Promise<{ content: string; figures: Record<string, string> }> {
  const asOf = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  switch (sec.module) {
    case "crm": {
      try {
        const { listCases } = await import("../crm/store");
        const { isOpen } = await import("../crm/caseFlow");
        const cases = await listCases();
        const open = cases.filter(isOpen);
        const rated = cases.filter((c) => c.csat);
        const csat = rated.length ? (rated.reduce((n, c) => n + (c.csat?.score ?? 0), 0) / rated.length).toFixed(1) : "—";
        const appeals = cases.filter((c) => c.type === "appeal").length;
        return {
          content: `Complaints and customer service as at ${asOf}. ${cases.length} cases logged; ${open.length} open; ${appeals} appeal(s). Average satisfaction ${csat}/5.`,
          figures: { "Cases logged": String(cases.length), Open: String(open.length), Appeals: String(appeals), "Avg CSAT": csat },
        };
      } catch {
        return { content: "Complaints figures unavailable.", figures: {} };
      }
    }
    case "risk": {
      const risks = Object.values(s.risks).filter((r) => r.state !== "Closed");
      const over = risks.filter((r) => riskScoreOf(r.residual) > s.settings.appetite[r.category]);
      return {
        content: `${risks.length} open risks. ${over.length} above appetite: ${over.map((r) => `${r.id} ${r.title} (residual ${riskScoreOf(r.residual)} vs appetite ${s.settings.appetite[r.category]})`).join("; ") || "none"}.`,
        figures: { "Open risks": String(risks.length), "Above appetite": String(over.length) },
      };
    }
    case "actions": {
      const acts = Object.values(s.actions);
      const open = acts.filter((a) => a.state === "Open");
      const overdue = open.filter((a) => new Date(a.due) < new Date());
      return {
        content: `${open.length} open board actions (${overdue.length} overdue).\n${open.map((a) => `• ${a.description} — ${a.owner}, due ${new Date(a.due).toLocaleDateString()}, ${a.progress}%`).join("\n")}`,
        figures: { Open: String(open.length), Overdue: String(overdue.length), Completed: String(acts.length - open.length) },
      };
    }
    // Board KPIs straight from the domain stores (03 P3) — frozen into the snapshot at assembly.
    case "certification": {
      try {
        const { listApplications, listCertificates } = await import("../certification/store");
        const year = String(new Date().getFullYear());
        const apps = await listApplications();
        const certs = listCertificates();
        const issuedYtd = certs.filter((c) => c.issued_at.startsWith(year)).length;
        const open = apps.filter((a) => !["Certified", "Rejected", "Withdrawn"].includes(a.state));
        const done = apps.filter((a) => a.state === "Certified" && a.decision?.at);
        const lead = done.length ? Math.round(done.reduce((n, a) => n + daysBetween(a.created_at, a.decision!.at), 0) / done.length) : 0;
        const suspended = certs.filter((c) => c.state === "Suspended").length;
        return {
          content: `Certification as at ${asOf}: ${issuedYtd} certificate(s) issued this year; ${open.length} application(s) in progress; ${certs.filter((c) => c.state === "Active").length} active certificates; average lead time ${lead || "—"} days; ${suspended} suspended.`,
          figures: { Issued: String(issuedYtd), "In progress": String(open.length), "Lead time": lead ? `${lead} d` : "—", Suspended: String(suspended) },
        };
      } catch {
        return { content: "Certification figures unavailable.", figures: {} };
      }
    }
    case "metrology": {
      try {
        const { listJobs, listEquipment } = await import("../metrology/store");
        const jobs = await listJobs();
        const done = jobs.filter((j) => j.certificate);
        const onTime = done.filter((j) => !j.due || j.certificate!.issued_at <= j.due).length;
        const active = jobs.filter((j) => !["Certified", "Dispatched", "Cancelled"].includes(j.state)).length;
        const refDue = listEquipment().filter((e) => e.kind === "reference" && new Date(e.cal_due).getTime() - Date.now() < 30 * 86_400_000).length;
        return {
          content: `Metrology as at ${asOf}: ${done.length} calibration certificate(s) issued; ${done.length ? Math.round((onTime / done.length) * 100) : 0}% on time; ${active} job(s) in the lab; ${refDue} reference standard(s) due for recalibration within 30 days.`,
          figures: { Calibrations: String(done.length), "On time": done.length ? `${Math.round((onTime / done.length) * 100)}%` : "—", "In lab": String(active), "Ref. due": String(refDue) },
        };
      } catch {
        return { content: "Metrology figures unavailable.", figures: {} };
      }
    }
    case "standards": {
      try {
        const { listWorkItems, listCatalogue } = await import("../standards/store");
        const wis = await listWorkItems();
        const active = wis.filter((w) => !["Published", "Cancelled"].includes(w.state));
        const review = wis.filter((w) => w.state === "Public Review").length;
        const q0 = new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1).toISOString();
        const published = (await listCatalogue()).filter((c) => c.published_at >= q0).length;
        return {
          content: `Standards as at ${asOf}: ${active.length} work item(s) active; ${review} draft(s) in public comment; ${published} standard(s) published this quarter.`,
          figures: { "Work items": String(active.length), "Public comment": String(review), Published: String(published) },
        };
      } catch {
        return { content: "Standards figures unavailable.", figures: {} };
      }
    }
    default:
      return { content: sec.content ?? "", figures: {} };
  }
}

export async function actOnPack(packId: string, action: string, actor: Actor, input: ActInput): Promise<Pack> {
  guard("Pack actions");
  const opt = packActions(packId, actor).find((a) => a.action === action);
  if (opt?.disabledReason) throw new Error(opt.disabledReason);
  let snapshot: Pack["versions"][number]["sections"] | undefined;
  if (action === "assemble") {
    const s = govStore.read();
    const p = must(s.packs[packId], "Pack");
    snapshot = [];
    for (const sec of p.sections.filter((x) => x.included)) {
      const live = sec.source === "live_module" ? await liveFigures(s, sec) : null;
      snapshot.push({ id: sec.id, title: sec.title, owner: sec.owner, restricted: sec.restricted, content: live?.content ?? sec.content ?? (sec.file ? `See attached: ${sec.file}` : ""), figures: live?.figures });
    }
  }
  const p = govStore.mutate((s) => {
    const p = must(s.packs[packId], "Pack");
    applyTransition(PACK_DEF, p, action, actor, input);
    const m = s.meetings[p.meeting_id];
    if (action === "assemble" && snapshot) {
      const v = (p.versions[p.versions.length - 1]?.v ?? 0) + 1;
      p.versions.push({ v, assembled_at: nowIso(), by: actor.name, note: input.note, sections: snapshot });
      p.history[p.history.length - 1].note = `Version v${v}`;
      for (const sec of p.sections) if (sec.source === "live_module" && sec.included) sec.status = "ready";
    }
    if (action === "issue") {
      p.issued_version = p.versions[p.versions.length - 1]?.v;
      if (m && m.state === "Scheduled") applyTransition(MEETING_DEF, m, "issue_pack", actor, { expected_state: "Scheduled" });
    }
    return p;
  });
  const s = govStore.read();
  const m = s.meetings[p.meeting_id];
  if (action === "assemble") for (const sec of p.sections) sectionTask(p, sec, m);
  if (action === "issue" && m) {
    meetingTasks(m, actor.name, "Pack issued");
    const body = bodyOf(s, m);
    for (const name of body.members) {
      const msg = renderTemplate("board.pack_issued", { name, meeting: m.title, version: p.issued_version, date: new Date(m.scheduled_at).toLocaleDateString(undefined, { dateStyle: "long" }), secretary: body.secretary });
      if (msg) notifySafe({ audience: "member", to: name, kind: "board", title: msg.subject, body: msg.body, link: `/member/meetings/${m.id}`, channel: msg.channel });
    }
  }
  return p;
}

export function packIssuePreview(packId: string) {
  const s = govStore.read();
  const p = s.packs[packId];
  const m = p && s.meetings[p.meeting_id];
  if (!m) return null;
  const body = bodyOf(s, m);
  const r = renderTemplate("board.pack_issued", { name: "{member}", meeting: m.title, version: (p.versions[p.versions.length - 1]?.v ?? 1), date: new Date(m.scheduled_at).toLocaleDateString(undefined, { dateStyle: "long" }), secretary: body.secretary });
  return r ? { to: `${body.members.length} members of the ${body.name}`, ...r } : null;
}

/* ---------------- resolutions (G5, G8) ---------------- */

export async function listResolutions(f: { state?: string; kind?: Resolution["kind"] } = {}): Promise<Resolution[]> {
  guard("Resolutions");
  return govStore.view((s) =>
    Object.values(s.resolutions)
      .filter((r) => (!f.state || r.state === f.state) && (!f.kind || r.kind === f.kind))
      .sort((a, b) => b.proposed_at.localeCompare(a.proposed_at)),
  );
}

export async function getResolution(id: string): Promise<{ resolution: Resolution; actions: ResAction[]; meeting: Meeting | null; body: GovBody } | null> {
  guard("Resolutions");
  return govStore.view((s) => {
    const r = s.resolutions[id];
    if (!r) return null;
    return {
      resolution: r,
      actions: Object.values(s.actions).filter((a) => a.resolution_id === id),
      meeting: r.meeting_id ? s.meetings[r.meeting_id] ?? null : null,
      body: s.bodies[r.body_id] ?? SEED_BODIES[0],
    };
  });
}

export function resolutionActions(id: string, actor: Actor): ActionOption[] {
  const s = govStore.read();
  const r = s.resolutions[id];
  if (!r) return [];
  return allowedActions(RESOLUTION_DEF, r, actor)
    .filter((a) => (r.kind === "written" ? ["close_vote", "withdraw", "implement"].includes(a.action) : a.action !== "close_vote"))
    .map((a) => {
      if (a.action === "implement") {
        const open = Object.values(s.actions).filter((x) => x.resolution_id === id && x.state === "Open");
        if (open.length) return { ...a, disabledReason: `${open.length} action(s) still open.` };
      }
      return a;
    });
}

export async function actOnResolution(id: string, action: string, actor: Actor, input: ActInput): Promise<Resolution> {
  guard("Resolution actions");
  const opt = resolutionActions(id, actor).find((a) => a.action === action);
  if (opt?.disabledReason) throw new Error(opt.disabledReason);
  return govStore.mutate((s) => {
    const r = must(s.resolutions[id], "Resolution");
    if (action === "close_vote") {
      if (input.expected_state !== r.state) throw new Error("This resolution changed while you were looking at it. Reload.");
      const t = tally(r);
      const to = t.passes ? "Passed" : "Lapsed";
      r.history.push({ at: nowIso(), actor: actor.name, action: "Vote closed early", from: r.state, to, note: `${t.for} for · ${t.against} against · ${t.abstain} abstain`, reason: input.reason, rule: t.passes ? "R-G2" : undefined });
      r.state = to;
      r.seq += 1;
      r.decided_at = nowIso();
      return r;
    }
    applyTransition(RESOLUTION_DEF, r, action, actor, input);
    if (action === "pass") r.decided_at = nowIso();
    if (action === "implement") r.implemented_at = nowIso();
    return r;
  });
}

export async function circulateWritten(
  input: { title: string; text: string; body_id: string; closes: string; threshold: "simple" | "two_thirds" | "unanimous"; eligible: string[]; min_votes: number; papers: string[] },
  actor: Actor,
): Promise<Resolution> {
  guard("Written resolutions");
  if (!input.title.trim() || !input.text.trim()) throw new Error("Give the resolution a title and text.");
  if (!input.eligible.length) throw new Error("Choose at least one voter.");
  if (new Date(input.closes) <= new Date()) throw new Error("The voting window must close in the future.");
  if (input.min_votes > input.eligible.length) throw new Error("The minimum number of votes is more than the eligible voters.");
  // TODO: wire real — POST /governance/resolutions/written
  const r = govStore.mutate((s) => {
    const r: Resolution = {
      id: nextId(s, "RES-W"),
      title: input.title.trim(),
      text: input.text.trim(),
      body_id: input.body_id,
      kind: "written",
      proposed_by: actor.name,
      proposed_at: nowIso(),
      votes: {},
      papers: input.papers,
      window: { opens: nowIso(), closes: new Date(input.closes).toISOString(), threshold: input.threshold, eligible: input.eligible, min_votes: input.min_votes },
      state: "Circulated",
      seq: 1,
      history: [{ at: nowIso(), actor: actor.name, action: "Circulated for vote", to: "Circulated", note: `${input.eligible.length} voters; closes ${new Date(input.closes).toLocaleString()}` }],
    };
    s.resolutions[r.id] = r;
    return r;
  });
  for (const name of input.eligible) {
    const msg = renderTemplate("board.written_resolution", { name, title: r.title, closes: new Date(r.window!.closes).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }), secretary: actor.name });
    if (msg) notifySafe({ audience: "member", to: name, kind: "board", title: msg.subject, body: msg.body, link: `/member/votes`, channel: msg.channel });
  }
  return r;
}

/** Member vote on a written resolution (member area). */
export async function castVote(id: string, member: string, vote: Vote): Promise<Resolution> {
  guard("Voting");
  // TODO: wire real — POST /governance/resolutions/{id}/votes (member session)
  return govStore.mutate((s) => {
    const r = must(s.resolutions[id], "Resolution");
    if (r.state !== "Circulated" || !r.window) throw new Error("Voting is closed for this resolution.");
    if (!r.window.eligible.includes(member)) throw new Error("You're not on the voting list for this resolution.");
    if (new Date(r.window.closes) < new Date()) throw new Error("The voting window has closed.");
    const prev = r.votes[member];
    r.votes[member] = vote;
    r.history.push({ at: nowIso(), actor: member, action: prev ? `Changed vote to ${vote}` : `Voted ${vote}` });
    return r;
  });
}

/* ---------------- actions (R-G2) ---------------- */

export async function listActions(f: { state?: string } = {}): Promise<ResAction[]> {
  guard("Action tracker");
  return govStore.view((s) => Object.values(s.actions).filter((a) => !f.state || a.state === f.state).sort((a, b) => a.due.localeCompare(b.due)));
}

export async function addAction(resolutionId: string, input: { description: string; owner: string; due: string }, actor: Actor): Promise<ResAction> {
  guard("Actions");
  if (!input.description.trim() || !input.owner.trim()) throw new Error("Describe the action and choose an owner.");
  const a = govStore.mutate((s) => {
    const r = must(s.resolutions[resolutionId], "Resolution");
    if (!["Passed", "Implemented"].includes(r.state)) throw new Error("Actions are created once the resolution has passed (R-G2).");
    const a: ResAction = {
      id: nextId(s, "ACT"),
      resolution_id: resolutionId,
      description: input.description.trim(),
      owner: input.owner,
      due: new Date(input.due).toISOString(),
      progress: 0,
      updates: [],
      evidence: [],
      carry_to_pack: true,
      state: "Open",
      seq: 1,
      history: [{ at: nowIso(), actor: actor.name, action: "Opened", to: "Open", rule: "R-G2" }],
    };
    s.actions[a.id] = a;
    if (r.state === "Implemented") {
      r.state = "Passed";
      r.seq += 1;
      r.history.push({ at: nowIso(), actor: actor.name, action: "New action — back to Passed", from: "Implemented", to: "Passed" });
    }
    return a;
  });
  actionTasks(a, actor.name, "Opened");
  return a;
}

export async function updateActionProgress(id: string, progress: number, text: string, actor: Actor, evidence?: string): Promise<ResAction> {
  guard("Actions");
  return govStore.mutate((s) => {
    const a = must(s.actions[id], "Action");
    a.progress = Math.max(0, Math.min(100, Math.round(progress)));
    a.updates.push({ at: nowIso(), by: actor.name, text: text.trim() || "Progress updated", progress: a.progress });
    if (evidence) a.evidence.push(evidence);
    return a;
  });
}

export async function setCarryToPack(id: string, carry: boolean): Promise<void> {
  govStore.mutate((s) => {
    must(s.actions[id], "Action").carry_to_pack = carry;
  });
}

export async function actOnAction(id: string, action: string, actor: Actor, input: ActInput): Promise<ResAction> {
  guard("Actions");
  const a = govStore.mutate((s) => {
    const a = must(s.actions[id], "Action");
    applyTransition(ACTION_DEF, a, action, actor, input);
    if (action === "complete") {
      a.progress = 100;
      a.completed_at = nowIso();
    } else a.completed_at = undefined;
    return a;
  });
  actionTasks(a, actor.name, findTransition(ACTION_DEF, action, input.expected_state)?.label);
  return a;
}

export function actionActionsFor(id: string, actor: Actor): ActionOption[] {
  const a = govStore.read().actions[id];
  return a ? allowedActions(ACTION_DEF, a, actor) : [];
}

/* ---------------- risks (G10, R-G3) ---------------- */

export async function listRisks(): Promise<Risk[]> {
  guard("Risk register");
  reconcileGovernanceTasks();
  return govStore.view((s) => Object.values(s.risks).sort((a, b) => riskScoreOf(b.residual) - riskScoreOf(a.residual)));
}

export async function getRisk(id: string): Promise<{ risk: Risk; appetite: number } | null> {
  guard("Risk register");
  return govStore.view((s) => (s.risks[id] ? { risk: s.risks[id], appetite: s.settings.appetite[s.risks[id].category] } : null));
}

export function riskActions(id: string, actor: Actor): ActionOption[] {
  const r = govStore.read().risks[id];
  return r ? allowedActions(RISK_DEF, r, actor) : [];
}

export async function saveRisk(
  input: Partial<Risk> & Pick<Risk, "title" | "category" | "owner" | "inherent" | "residual">,
  actor: Actor,
): Promise<Risk> {
  guard("Risk register");
  if (!input.title.trim()) throw new Error("Give the risk a title.");
  // TODO: wire real — POST /governance/risks | PATCH /governance/risks/{id}
  const r = govStore.mutate((s) => {
    let r = input.id ? s.risks[input.id] : undefined;
    const changes: HistoryEvent["changes"] = [];
    if (r) {
      if (riskScoreOf(r.residual) !== riskScoreOf(input.residual)) changes.push({ field: "Residual", from: String(riskScoreOf(r.residual)), to: String(riskScoreOf(input.residual)) });
      if (riskScoreOf(r.inherent) !== riskScoreOf(input.inherent)) changes.push({ field: "Inherent", from: String(riskScoreOf(r.inherent)), to: String(riskScoreOf(input.inherent)) });
      if (r.owner !== input.owner) changes.push({ field: "Owner", from: r.owner, to: input.owner });
      const trend = riskScoreOf(input.residual) > riskScoreOf(r.residual) ? "worsening" : riskScoreOf(input.residual) < riskScoreOf(r.residual) ? "improving" : r.trend;
      Object.assign(r, input, { trend });
      r.history.push({ at: nowIso(), actor: actor.name, action: "Updated", changes });
    } else {
      r = {
        id: nextId(s, "RSK"),
        description: "",
        controls: [],
        mitigations: [],
        reviews: [],
        review_every_days: 90,
        next_review: isoIn(90),
        links: [],
        in_pack: false,
        trend: "stable",
        state: "Open",
        seq: 1,
        history: [{ at: nowIso(), actor: actor.name, action: "Logged", to: "Open" }],
        ...input,
      } as Risk;
      s.risks[r.id] = r;
    }
    appetiteCheck(s, r);
    return r;
  });
  return r;
}

export async function actOnRisk(id: string, action: string, actor: Actor, input: ActInput): Promise<Risk> {
  guard("Risk actions");
  const r = govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    applyTransition(RISK_DEF, r, action, actor, input);
    if (action === "complete_review") {
      r.reviews.push({ at: nowIso(), by: actor.name, note: input.note ?? input.reason ?? "", residual: { ...r.residual } });
      r.next_review = isoIn(r.review_every_days);
    }
    appetiteCheck(s, r);
    return r;
  });
  riskTasks(r, actor.name, findTransition(RISK_DEF, action, input.expected_state)?.label);
  return r;
}

export async function addMitigation(id: string, m: { action: string; owner: string; due: string }, actor: Actor): Promise<Risk> {
  return govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    r.mitigations.push({ id: `M${r.mitigations.length + 1}-${Date.now() % 1000}`, action: m.action.trim(), owner: m.owner, due: new Date(m.due).toISOString() });
    r.history.push({ at: nowIso(), actor: actor.name, action: `Mitigation added: ${m.action}` });
    return r;
  });
}

export async function toggleMitigation(id: string, mid: string, actor: Actor): Promise<Risk> {
  return govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    const m = must(r.mitigations.find((x) => x.id === mid), "Mitigation");
    m.done_at = m.done_at ? undefined : nowIso();
    r.history.push({ at: nowIso(), actor: actor.name, action: `${m.done_at ? "Completed" : "Reopened"} mitigation: ${m.action}` });
    return r;
  });
}

export async function addControl(id: string, control: string, actor: Actor): Promise<Risk> {
  return govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    r.controls.push(control.trim());
    r.history.push({ at: nowIso(), actor: actor.name, action: `Control added: ${control}` });
    return r;
  });
}

export async function linkIncident(id: string, link: Risk["links"][number], actor: Actor): Promise<Risk> {
  return govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    r.links.push(link);
    r.history.push({ at: nowIso(), actor: actor.name, action: `Linked ${link.kind} ${link.ref}` });
    return r;
  });
}

export async function setRiskInPack(id: string, inPack: boolean, actor: Actor): Promise<Risk> {
  return govStore.mutate((s) => {
    const r = must(s.risks[id], "Risk");
    r.in_pack = inPack;
    r.history.push({ at: nowIso(), actor: actor.name, action: inPack ? "Flagged for the next pack" : "Removed from the next pack" });
    return r;
  });
}

/* ---------------- declarations (G11) ---------------- */

export async function listDeclarations(): Promise<Declaration[]> {
  guard("Declarations");
  return govStore.view((s) => Object.values(s.declarations).sort((a, b) => b.at.localeCompare(a.at)));
}

export function declarationsDue(): { member: string; kind: "annual"; period: string }[] {
  const s = govStore.read();
  const year = String(new Date().getFullYear());
  return Object.values(s.members)
    .filter((m) => m.bodies.includes("BOARD"))
    .filter((m) => !Object.values(s.declarations).some((d) => d.member === m.name && d.kind === "annual" && d.period === year))
    .map((m) => ({ member: m.name, kind: "annual" as const, period: year }));
}

/* ---------------- settings (G12) ---------------- */

export async function saveBody(b: GovBody, actor: Actor): Promise<GovBody> {
  guard("Bodies");
  if (b.quorum < 1 || b.quorum > b.members.length) throw new Error(`Quorum must be between 1 and ${b.members.length}.`);
  // TODO: wire real — PUT /governance/bodies/{id}
  return govStore.mutate((s) => {
    s.bodies[b.id] = b;
    for (const n of b.members) {
      if (s.members[n] && !s.members[n].bodies.includes(b.id)) s.members[n].bodies.push(b.id);
    }
    void actor;
    return b;
  });
}

export async function saveSettings(patch: Partial<GovSettings>): Promise<GovSettings> {
  guard("Governance settings");
  // TODO: wire real — PUT /governance/risk-appetite, /governance/settings
  const out = govStore.mutate((s) => {
    s.settings = { ...s.settings, ...patch };
    for (const r of Object.values(s.risks)) appetiteCheck(s, r);
    return s.settings;
  });
  return out;
}

export async function saveMember(m: GovMember): Promise<GovMember> {
  return govStore.mutate((s) => {
    s.members[m.name] = m;
    return m;
  });
}

/* ---------------- member area ---------------- */

export function getNote(member: string, packId: string, sectionId: string): string {
  return govStore.read().notes[`${member}|${packId}|${sectionId}`] ?? "";
}

export async function saveNote(member: string, packId: string, sectionId: string, text: string): Promise<void> {
  govStore.mutate((s) => {
    s.notes[`${member}|${packId}|${sectionId}`] = text;
  });
}

export async function memberHome(member: string): Promise<{
  next: Meeting | null;
  packs: { meeting: Meeting; pack: Pack }[];
  votes: Resolution[];
  declarationDue: boolean;
  minutes: Meeting[];
}> {
  guard("Member area");
  return govStore.view((s) => {
    const mine = Object.values(s.meetings).filter((m) => Object.keys(m.attendance).includes(member) || (s.bodies[m.body_id]?.members ?? []).includes(member));
    const upcoming = mine.filter((m) => ["Scheduled", "Pack issued"].includes(m.state)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return {
      next: upcoming[0] ?? null,
      packs: mine
        .map((m) => ({ meeting: m, pack: s.packs[m.pack_id] }))
        .filter((x) => x.pack && x.pack.issued_version)
        .sort((a, b) => b.meeting.scheduled_at.localeCompare(a.meeting.scheduled_at)),
      votes: Object.values(s.resolutions).filter((r) => r.kind === "written" && r.window?.eligible.includes(member)).sort((a, b) => b.proposed_at.localeCompare(a.proposed_at)),
      declarationDue: !Object.values(s.declarations).some((d) => d.member === member && d.kind === "annual" && d.period === String(new Date().getFullYear())),
      minutes: mine.filter((m) => m.state === "Minutes approved" || m.state === "Minutes submitted").sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    };
  });
}

/* ---------------- overview, search, calendar, evaluation ---------------- */

export type GovOverview = {
  next: (MeetingBundle & { readiness: { agenda: number; pack: number; notice: boolean; noticeOk: boolean; ready: number; total: number } }) | null;
  openActions: ResAction[];
  overdueActions: number;
  aboveAppetite: Risk[];
  written: Resolution[];
  declarationsDue: number;
  minutesAwaiting: Meeting[];
  attendanceRate: number;
};

export async function governanceOverview(): Promise<GovOverview> {
  guard("Governance overview");
  reconcileGovernanceTasks();
  const s = govStore.read();
  const upcoming = Object.values(s.meetings)
    .filter((m) => ["Scheduled", "Pack issued"].includes(m.state) && m.body_id === "BOARD")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  let next: GovOverview["next"] = null;
  if (upcoming) {
    const b = await getMeeting(upcoming.id);
    if (b) {
      const inc = b.pack?.sections.filter((x) => x.included) ?? [];
      const ready = inc.filter((x) => x.status === "ready").length;
      const noticeOk = Boolean(upcoming.notice_issued_at && daysBetween(upcoming.notice_issued_at, upcoming.scheduled_at) >= b.body.notice_days);
      next = { ...b, readiness: { agenda: upcoming.agenda_final ? 100 : Math.min(90, upcoming.agenda.length * 12), pack: inc.length ? Math.round((ready / inc.length) * 100) : 0, notice: Boolean(upcoming.notice_issued_at), noticeOk, ready, total: inc.length } };
    }
  }
  return govStore.view((st) => {
    const held = Object.values(st.meetings).filter((m) => m.run?.started_at);
    const slots = held.flatMap((m) => Object.values(m.attendance));
    const open = Object.values(st.actions).filter((a) => a.state === "Open");
    return {
      next,
      openActions: open.sort((a, b) => a.due.localeCompare(b.due)),
      overdueActions: open.filter((a) => new Date(a.due) < new Date()).length,
      aboveAppetite: Object.values(st.risks).filter((r) => r.state !== "Closed" && riskScoreOf(r.residual) > st.settings.appetite[r.category]),
      written: Object.values(st.resolutions).filter((r) => r.kind === "written" && r.state === "Circulated"),
      declarationsDue: declarationsDue().length,
      minutesAwaiting: Object.values(st.meetings).filter((m) => ["Held", "Minutes draft", "Minutes submitted"].includes(m.state)),
      attendanceRate: slots.length ? Math.round((slots.filter((a) => a.present).length / slots.length) * 100) : 0,
    };
  });
}

export type SearchHit = { kind: "minutes" | "resolution"; id: string; title: string; snippet: string; link: string; at: string };

/** "When did the board approve the fee schedule?" — searches minutes and resolutions. */
export async function searchGovernance(q: string): Promise<SearchHit[]> {
  guard("Search");
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2 && !["when", "did", "the", "board", "what", "which"].includes(t));
  if (!terms.length) return [];
  const hit = (text: string) => terms.every((t) => text.toLowerCase().includes(t.replace(/s$/, "")));
  const snippet = (text: string) => {
    const i = text.toLowerCase().indexOf(terms[0].replace(/s$/, ""));
    return (i > 40 ? "…" : "") + text.slice(Math.max(0, i - 40), i + 140) + "…";
  };
  return govStore.view((s) => {
    const out: SearchHit[] = [];
    for (const r of Object.values(s.resolutions)) {
      const text = `${r.title} ${r.text}`;
      if (hit(text)) out.push({ kind: "resolution", id: r.id, title: `${r.id} — ${r.title} (${r.state})`, snippet: snippet(text), link: `/board/resolutions/${r.id}`, at: r.decided_at ?? r.proposed_at });
    }
    for (const m of Object.values(s.meetings)) {
      if (!m.minutes) continue;
      const text = [m.minutes.general, ...Object.values(m.minutes.items)].join(" ");
      if (hit(text)) out.push({ kind: "minutes", id: m.id, title: `Minutes — ${m.title}`, snippet: snippet(text), link: `/board/meetings/${m.id}`, at: m.scheduled_at });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  });
}

export type CalendarEntry = { id: string; title: string; at: string; kind: "meeting" | "statutory" | "pack" | "action"; body?: string; link?: string };

export async function governanceCalendar(): Promise<CalendarEntry[]> {
  guard("Calendar");
  return govStore.view((s) => {
    const out: CalendarEntry[] = [];
    for (const m of Object.values(s.meetings)) {
      if (m.state === "Cancelled") continue;
      out.push({ id: m.id, title: m.title, at: m.scheduled_at, kind: "meeting", body: m.body_id, link: `/board/meetings/${m.id}` });
      const body = s.bodies[m.body_id];
      if (body && ["Scheduled"].includes(m.state)) out.push({ id: `${m.id}-pack`, title: `Pack due — ${m.title}`, at: new Date(new Date(m.scheduled_at).getTime() - body.pack_days * 86_400_000).toISOString(), kind: "pack", body: m.body_id, link: `/board/pack/${m.id}` });
    }
    for (const st of s.settings.statutory) out.push({ id: st.id, title: st.title, at: st.due, kind: "statutory" });
    for (const a of Object.values(s.actions)) if (a.state === "Open") out.push({ id: a.id, title: `Action due — ${a.description}`, at: a.due, kind: "action", link: `/board/resolutions/${a.resolution_id}` });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  });
}

export function calendarIcs(entries: CalendarEntry[]): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ESWASA//EswasaOne Governance//EN"];
  for (const e of entries) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@eswasaone`, `DTSTAMP:${fmt(nowIso())}`, `DTSTART:${fmt(e.at)}`, `DTEND:${fmt(new Date(new Date(e.at).getTime() + 2 * 3_600_000).toISOString())}`, `SUMMARY:${e.title.replace(/[,;]/g, " ")}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export const EVALUATION_QUESTIONS = [
  "The Board sets clear strategic direction",
  "Board papers arrive on time and are fit for decision",
  "Meetings are well chaired and decisions are clear",
  "The Board oversees risk effectively",
  "Members declare and manage conflicts well",
  "Committees report usefully to the Board",
];

export async function submitEvaluation(member: string, scores: Record<string, number>, comment?: string): Promise<void> {
  guard("Board evaluation");
  const year = String(new Date().getFullYear());
  govStore.mutate((s) => {
    const id = `${member}|${year}`;
    s.evaluations[id] = { id, member, year, scores, comment, at: nowIso() };
  });
}

export async function evaluationResults(): Promise<{ responses: number; eligible: number; averages: { q: string; avg: number }[]; comments: string[]; submitted: string[] }> {
  guard("Board evaluation");
  const year = String(new Date().getFullYear());
  return govStore.view((s) => {
    const rows = Object.values(s.evaluations).filter((e) => e.year === year);
    return {
      responses: rows.length,
      eligible: s.bodies.BOARD?.members.length ?? 0,
      averages: EVALUATION_QUESTIONS.map((q) => ({ q, avg: rows.length ? Math.round((rows.reduce((n, r) => n + (r.scores[q] ?? 0), 0) / rows.length) * 10) / 10 : 0 })),
      comments: rows.map((r) => r.comment).filter(Boolean) as string[],
      submitted: rows.map((r) => r.member),
    };
  });
}

/** Attendance per member across held meetings (P2 analytics). */
export async function attendanceStats(): Promise<{ member: string; invited: number; present: number; rate: number }[]> {
  guard("Attendance");
  return govStore.view((s) => {
    const held = Object.values(s.meetings).filter((m) => m.run?.started_at);
    const names = new Set(held.flatMap((m) => Object.keys(m.attendance)));
    return [...names]
      .map((member) => {
        const invited = held.filter((m) => m.attendance[member]).length;
        const present = held.filter((m) => m.attendance[member]?.present).length;
        return { member, invited, present, rate: invited ? Math.round((present / invited) * 100) : 0 };
      })
      .sort((a, b) => a.rate - b.rate);
  });
}

export async function resetGovernanceDemo(): Promise<void> {
  govStore.reset();
  reconciled = false;
}

export type { RiskCategory };

/* ---------------- member onboarding pack (03 P3) ---------------- */

export const ONBOARDING_DOCS: { id: string; title: string; summary: string; file: string }[] = [
  { id: "charter", title: "Board charter", summary: "Mandate of the ESWASA Council under the Standards and Quality Act, its committees, delegations and the matters reserved for the Board.", file: "ESWASA-Board-Charter.pdf" },
  { id: "conduct", title: "Code of conduct", summary: "Duties of care and loyalty, gifts and hospitality, use of information, and how conflicts of interest are declared and managed.", file: "ESWASA-Board-Code-of-Conduct.pdf" },
  { id: "confidentiality", title: "Confidentiality undertaking", summary: "Board papers, restricted sections and deliberations stay confidential during and after your term.", file: "ESWASA-Confidentiality-Undertaking.pdf" },
  { id: "calendar", title: "Year planner and how papers work", summary: "Meeting cycle, when packs are issued, how written resolutions are voted, and where minutes are kept.", file: "ESWASA-Board-Year-Planner.pdf" },
];

export function onboardingStatus(member: string): { docs: (typeof ONBOARDING_DOCS[number] & { signed_at?: string })[]; complete: boolean } {
  guard("Onboarding pack");
  return govStore.view((s) => {
    const docs = ONBOARDING_DOCS.map((d) => ({ ...d, signed_at: s.onboarding?.[`${member}|${d.id}`]?.at }));
    return { docs, complete: docs.every((d) => d.signed_at) };
  });
}

/** The member confirms they have read and accept a document. Kept as evidence for governance audits. */
export async function signOnboarding(member: string, docId: string): Promise<void> {
  guard("Onboarding pack");
  if (!ONBOARDING_DOCS.some((d) => d.id === docId)) throw new Error("Unknown onboarding document.");
  // TODO: wire real — POST /governance/members/{member}/onboarding/{docId}/sign
  govStore.mutate((s) => {
    s.onboarding = { ...(s.onboarding ?? {}), [`${member}|${docId}`]: { member, doc_id: docId, at: nowIso() } };
  });
}

/* ---------------- assistant briefing (03 P3) ---------------- */

export type PackBriefing = {
  meeting: string;
  version: number;
  assembled_at: string;
  previous?: string;
  changes: { section: string; metric: string; before: string; after: string }[];
  decisions: string[];
  text: string;
};

/**
 * "Summarise this pack in one page" and "What changed since last quarter?" — built only from the frozen
 * snapshot figures, so it never drifts from what was issued. Proposes; the Secretary edits before sharing.
 * TODO: wire real — POST /agent/briefing {pack, version} (Esi, L8) with the same snapshot as input.
 */
export function packBriefing(packId: string, v?: number, opts: { includeRestricted?: boolean } = {}): PackBriefing | null {
  guard("Pack briefing");
  return govStore.view((s) => {
    const pack = s.packs[packId];
    if (!pack?.versions.length) return null;
    const snap = pack.versions.find((x) => x.v === (v ?? pack.issued_version ?? pack.versions.length)) ?? pack.versions[pack.versions.length - 1];
    const meeting = s.meetings[pack.meeting_id];
    const prevMeeting = Object.values(s.meetings)
      .filter((m) => m.body_id === meeting?.body_id && m.scheduled_at < (meeting?.scheduled_at ?? "") && s.packs[m.pack_id]?.versions.length)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];
    const prevPack = prevMeeting ? s.packs[prevMeeting.pack_id] : undefined;
    const prevSnap = prevPack ? prevPack.versions.find((x) => x.v === prevPack.issued_version) ?? prevPack.versions[prevPack.versions.length - 1] : undefined;
    const sections = snap.sections.filter((x) => opts.includeRestricted || !x.restricted);
    const changes: PackBriefing["changes"] = [];
    for (const sec of sections) {
      const before = prevSnap?.sections.find((x) => x.title === sec.title)?.figures ?? {};
      for (const [metric, after] of Object.entries(sec.figures ?? {})) {
        if (before[metric] !== undefined && before[metric] !== after) changes.push({ section: sec.title, metric, before: before[metric], after });
      }
    }
    const decisions = (meeting?.agenda ?? []).filter((a) => a.kind === "decision").map((a) => a.title);
    const firstSentence = (t: string) => (t.split(/(?<=\.)\s/)[0] ?? "").trim();
    const lines = [
      `Briefing — ${meeting?.title ?? packId}, pack v${snap.v} (frozen ${new Date(snap.assembled_at).toLocaleDateString()})`,
      "",
      "In one page",
      ...sections.map((sec) => `• ${sec.title}: ${firstSentence(sec.content) || "(no text)"}${sec.figures && Object.keys(sec.figures).length ? ` [${Object.entries(sec.figures).map(([k, x]) => `${k} ${x}`).join(", ")}]` : ""}`),
      "",
      prevMeeting ? `What changed since ${prevMeeting.title}` : "What changed since last quarter",
      ...(changes.length ? changes.map((c) => `• ${c.section} — ${c.metric}: ${c.before} → ${c.after}`) : [prevSnap ? "• No headline figure changed." : "• No earlier pack to compare with."]),
      "",
      "Decisions asked of the Board",
      ...(decisions.length ? decisions.map((d) => `• ${d}`) : ["• None on the agenda."]),
      ...(sections.length < snap.sections.length ? ["", `${snap.sections.length - sections.length} restricted section(s) left out.`] : []),
    ];
    return { meeting: meeting?.title ?? packId, version: snap.v, assembled_at: snap.assembled_at, previous: prevMeeting?.title, changes, decisions, text: lines.join("\n") };
  });
}
