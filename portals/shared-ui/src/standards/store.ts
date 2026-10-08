/**
 * Standards development store (gap 06): proposals, work programme, draft versions, public comment and
 * resolution, TC ballots, publication (R-S3), periodic review (R-S4), TCs and subscriptions.
 * The Service portal ("Have your say", proposals, TC member area) and the Institution share it.
 *
 * TODO: wire real — existing Core: GET /standards, /standards/workitems | drafts | comments | ballots,
 *   POST /standards/ballots/{id}/vote, POST /standards/work-items/{id}/act, POST /standards/publish.
 *   New (contracts/openapi.yaml first): POST /standards/proposals, POST /standards/proposals/{id}/act,
 *   POST /standards/work-items/{id}/drafts, POST /standards/drafts/{id}/comments,
 *   PUT /standards/comments/{id}/disposition, POST /standards/work-items/{id}/replies,
 *   POST /standards/committees/{tc}/applications, PUT /standards/committees/{tc},
 *   PUT /standards/catalogue/{id}, POST /standards/catalogue/{id}/review,
 *   GET/POST/DELETE /standards/subscriptions, GET/PUT /standards/settings.
 */
import { createSignal } from "../crm/store";
import { notifySafe } from "../notify/store";
import { createLocalStore, isoIn, nowIso } from "../store/localStore";
import { openTask, reconcileTasks, syncRecordTasks, taskStore } from "../tasks/store";
import { allowedActions, applyTransition } from "../workflow/engine";
import type { ActInput, ActionOption, Actor } from "../workflow/types";
import { DISPOSITION_LABEL, PROPOSAL_DEF, WI_DEF } from "./defs";
import { DEFAULT_STD_SETTINGS, SEED_CATALOGUE, SEED_SUBSCRIPTIONS, SEED_TCS, seedBallots, seedComments, seedProposals, seedWorkItems } from "./seed";
import type { Ballot, CatalogueEntry, CommentDisposition, DraftComment, MemberCategory, Proposal, PublicationChecklist, StandardsSettings, Subscription, TcMember, TechnicalCommittee, Vote, WorkItem } from "./types";

type StdState = {
  v: 1;
  seq: number;
  tcs: Record<string, TechnicalCommittee>;
  items: Record<string, WorkItem>;
  comments: Record<string, DraftComment>;
  ballots: Record<string, Ballot>;
  catalogue: Record<string, CatalogueEntry>;
  proposals: Record<string, Proposal>;
  subscriptions: Record<string, Subscription>;
  settings: StandardsSettings;
};

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, structuredClone(r)]));

export const stdStore = createLocalStore<StdState>({
  key: "eswasaone.standards.v1",
  v: 1,
  seed: () => ({
    v: 1,
    seq: 40,
    tcs: byId(SEED_TCS),
    items: byId(seedWorkItems()),
    comments: byId(seedComments()),
    ballots: byId(seedBallots()),
    catalogue: byId(SEED_CATALOGUE),
    proposals: byId(seedProposals()),
    subscriptions: byId(SEED_SUBSCRIPTIONS),
    settings: structuredClone(DEFAULT_STD_SETTINGS),
  }),
});

const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn("[standards]", e);
  }
};

/* ---------------- tasks ---------------- */

function syncWi(w: WorkItem, by?: string, outcome?: string) {
  syncRecordTasks({ def: WI_DEF, rec: w, name: w.id, title: `${w.ref} ${w.title}`, link: `/standards/workitems/${w.id}`, module: "Standards", by, outcome, facts: { TC: w.tc_id, "Project leader": w.project_leader, Type: w.type } });
}
function syncProposal(p: Proposal, by?: string, outcome?: string) {
  syncRecordTasks({ def: PROPOSAL_DEF, rec: p, name: p.id, title: p.title, link: `/standards/proposals/${p.id}`, module: "Standards", by, outcome, facts: { Proposer: `${p.proposer.name}${p.proposer.org ? `, ${p.proposer.org}` : ""}`, Urgency: p.urgency } });
}

let reconciled = false;
function reconcile() {
  runCron();
  if (reconciled) return;
  reconciled = true;
  const s = stdStore.read();
  reconcileTasks(WI_DEF, Object.values(s.items).map((w) => ({ rec: w, name: w.id, title: `${w.ref} ${w.title}`, link: `/standards/workitems/${w.id}`, module: "Standards" as const })));
  reconcileTasks(PROPOSAL_DEF, Object.values(s.proposals).map((p) => ({ rec: p, name: p.id, title: p.title, link: `/standards/proposals/${p.id}`, module: "Standards" as const })));
  const known = Object.keys(taskStore.read().tasks);
  for (const tc of Object.values(s.tcs)) for (const a of tc.applications) if (a.state === "pending" && !known.some((k) => k.startsWith(`TC Application|${a.id}|`))) tcAppTask(tc, a.id);
}

function tcAppTask(tc: TechnicalCommittee, appId: string) {
  const a = tc.applications.find((x) => x.id === appId);
  if (!a) return;
  safe(() => openTask({ doctype: "TC Application", name: a.id, state: "pending", seq: 1, family: "approve", verb: "approve", role: "TC Secretary", title: `${tc.number} membership application — ${a.name} (${a.org})`, module: "Standards", link: `/standards/committees/${tc.id}`, sla_days: 10, facts: { Category: a.category, Motivation: a.motivation } }));
}

/* ---------------- cron: comment periods and ballots close themselves ---------------- */

let lastCron = 0;
function runCron() {
  if (Date.now() - lastCron < 30_000) return;
  lastCron = Date.now();
  const moved: WorkItem[] = [];
  stdStore.mutate((s) => {
    for (const w of Object.values(s.items)) {
      if (w.state === "Public Review" && w.comment_period && new Date(w.comment_period.closes).getTime() < Date.now()) {
        w.history.push({ at: nowIso(), actor: "System", action: "Comment period closed", from: w.state, to: "Comment Resolution", rule: "R-S2" });
        w.state = "Comment Resolution";
        w.seq += 1;
        moved.push(w);
      }
    }
    for (const b of Object.values(s.ballots)) {
      if (b.state !== "Open") continue;
      const all = b.eligible.every((n) => b.votes[n]);
      if (new Date(b.closes).getTime() < Date.now() || all) {
        const w = closeBallotIn(s, b, all ? "All members voted" : "Ballot period ended");
        if (w) moved.push(w);
      }
    }
  });
  for (const w of moved) syncWi(w, "System");
}

/* ---------------- settings ---------------- */

export function getStdSettings(): StandardsSettings {
  return stdStore.view((s) => s.settings);
}
export async function saveStdSettings(patch: Partial<StandardsSettings>): Promise<StandardsSettings> {
  return stdStore.mutate((s) => (s.settings = { ...s.settings, ...patch }));
}
export async function resetStandardsDemo(): Promise<void> {
  stdStore.reset();
  reconciled = false;
  lastCron = 0;
}

/* ---------------- work items ---------------- */

export function listWorkItems(f: { state?: string; tc?: string } = {}): WorkItem[] {
  stdStore.guard("Work programme");
  reconcile();
  return stdStore.view((s) => Object.values(s.items).filter((w) => (!f.state || w.state === f.state) && (!f.tc || w.tc_id === f.tc)).sort((a, b) => a.ref.localeCompare(b.ref)));
}

export type WorkItemBundle = { wi: WorkItem; tc: TechnicalCommittee | undefined; comments: DraftComment[]; ballot: Ballot | null; proposal: Proposal | null; catalogue: CatalogueEntry | null; revises: CatalogueEntry | null; settings: StandardsSettings };

export function getWorkItem(id: string): WorkItemBundle | null {
  stdStore.guard("Work item");
  reconcile();
  return stdStore.view((s) => {
    const wi = s.items[id];
    if (!wi) return null;
    return {
      wi,
      tc: s.tcs[wi.tc_id],
      comments: Object.values(s.comments).filter((c) => c.work_item_id === id).sort((a, b) => a.clause.localeCompare(b.clause, undefined, { numeric: true })),
      ballot: wi.ballot_id ? s.ballots[wi.ballot_id] ?? null : null,
      proposal: wi.proposal_id ? s.proposals[wi.proposal_id] ?? null : null,
      catalogue: wi.catalogue_id ? s.catalogue[wi.catalogue_id] ?? null : null,
      revises: wi.revises ? s.catalogue[wi.revises] ?? null : null,
      settings: s.settings,
    };
  });
}

export function publicationProblem(p?: Partial<PublicationChecklist>): string | null {
  if (!p?.final_text) return "Confirm the final text.";
  if (!p.cover) return "Confirm the cover page.";
  if (!p.ics?.trim()) return "Enter the ICS code(s).";
  if (!p.price || p.price <= 0) return "Set the e-store price.";
  if (!p.gazette_ref?.trim() || !p.gazette_date) return "Record the gazette notice reference and date.";
  if (p.compulsory && !p.regulation?.trim()) return "Name the regulation that makes it compulsory.";
  return null;
}

export function wiActions(id: string, actor: Actor): ActionOption[] {
  const s = stdStore.read();
  const w = s.items[id];
  if (!w) return [];
  return allowedActions(WI_DEF, w, actor).map((a) => {
    let why = a.disabledReason;
    if (a.action === "promote_cd" && !w.drafts.length) why ??= "Upload a working draft first.";
    if (a.action === "open_comment" && !w.drafts.some((d) => d.stage === "Committee Draft")) why ??= "Upload the committee draft (CD) that goes out for comment.";
    if (a.action === "open_ballot") {
      const open = Object.values(s.comments).filter((c) => c.work_item_id === id && !c.disposition);
      if (open.length) why ??= `${open.length} comment(s) have no disposition yet.`;
    }
    if (a.action === "publish") why ??= publicationProblem(w.publication) ?? undefined;
    return { ...a, disabledReason: why };
  });
}

function notifySubscribers(s: StdState, w: { sector: string; tc_id?: string; ref: string; title: string }, event: Subscription["events"][number], title: string, body: string, link: string, catId?: string) {
  const subs = Object.values(s.subscriptions).filter((x) => x.events.includes(event) && ((x.kind === "sector" && x.value === w.sector) || (x.kind === "tc" && x.value === w.tc_id) || (x.kind === "standard" && x.value === catId)));
  const emails = [...new Set(subs.map((x) => x.email))];
  for (const to of emails) notifySafe({ audience: "customer", to, kind: "comment", ref: w.ref, title, body, link, channel: ["email", "portal"] });
  return emails.length;
}

export async function actOnWorkItem(id: string, action: string, actor: Actor, input: ActInput): Promise<WorkItem> {
  stdStore.guard("Work item");
  const block = wiActions(id, actor).find((a) => a.action === action)?.disabledReason;
  if (block) throw new Error(block);
  let compulsory: CatalogueEntry | null = null;
  const w = stdStore.mutate((s) => {
    const w = s.items[id];
    if (!w) throw new Error("Work item not found.");
    const res = applyTransition(WI_DEF, w, action, actor, input);
    const p = input.payload ?? {};
    if (action === "open_comment") {
      const days = Number(p.days) || s.settings.comment_days;
      w.comment_period = { opens: nowIso(), closes: isoIn(days) };
      const cd = [...w.drafts].reverse().find((d) => d.stage === "Committee Draft");
      if (cd) cd.locked = true;
      const n = notifySubscribers(s, w, "drafts", `Draft open for comment: ${w.ref}`, `${w.title} is open for public comment until ${new Date(w.comment_period.closes).toLocaleDateString()}. Read it and comment clause by clause.`, `/standards/drafts/${w.id}`);
      res.event.note = `${days} days; ${n} subscriber(s) notified`;
    }
    if (action === "open_ballot") {
      const tc = s.tcs[w.tc_id];
      const days = Number(p.days) || s.settings.ballot_days;
      s.seq += 1;
      const bid = `BAL-26-${String(s.seq).padStart(3, "0")}`;
      const eligible = (tc?.members ?? []).filter((m) => m.voting).map((m) => m.name);
      const latest = w.drafts[w.drafts.length - 1];
      if (latest) latest.locked = true;
      s.ballots[bid] = { id: bid, work_item_id: w.id, draft_label: latest?.label ?? "CD", opens: nowIso(), closes: isoIn(days), eligible, votes: {}, state: "Open", rule: { approve_pct: s.settings.approve_pct, max_disapprove_pct: s.settings.max_disapprove_pct, quorum_pct: s.settings.quorum_pct } };
      w.ballot_id = bid;
      for (const m of tc?.members.filter((x) => x.voting) ?? []) notifySafe({ audience: "customer", to: m.email, kind: "comment", ref: bid, title: `Your vote: ${w.ref} ${w.title}`, body: `Ballot ${bid} is open until ${new Date(s.ballots[bid].closes).toLocaleDateString()}. Read the draft and vote in the TC member area.`, link: `/tc/ballots/${bid}`, channel: ["email", "portal"] });
      res.event.note = `${eligible.length} voting members`;
    }
    if (action === "publish") {
      const pub = w.publication!;
      const prev = w.revises ? s.catalogue[w.revises] : undefined;
      const cid = `CAT-${w.ref.replace(/\W+/g, "-")}`;
      const entry: CatalogueEntry = { id: cid, ref: w.ref, title: w.title, sector: w.sector, ics: pub.ics ?? "", keywords: w.title.toLowerCase().split(/\W+/).filter((x) => x.length > 4), price: pub.price ?? 0, pages: w.drafts[w.drafts.length - 1]?.pages ?? 20, status: "current", published_at: nowIso(), tc_id: w.tc_id, supersedes: prev?.ref, adoption: w.adoption, compulsory: pub.compulsory ? { regulation: pub.regulation ?? "", since: nowIso() } : undefined, preview_pages: w.adoption ? 2 : 4, abstract: w.scope, licensed: Boolean(w.adoption) };
      s.catalogue[cid] = entry;
      if (prev) {
        prev.status = "superseded";
        prev.superseded_by = w.ref;
      }
      for (const d of Object.values(s.catalogue)) if (d.status === "draft" && d.ref.startsWith(w.ref.split(":")[0])) delete s.catalogue[d.id];
      w.catalogue_id = cid;
      const n = notifySubscribers(s, w, "publications", `Published: ${w.ref}`, `${w.title} is now published${pub.compulsory ? ` and compulsory under ${pub.regulation}` : ""}. Gazette ${pub.gazette_ref}. Buy it from the e-store.`, `/standards/${cid}`, prev?.id);
      res.event.note = `Catalogue ${cid}; e-store E ${pub.price}; gazette ${pub.gazette_ref}; ${n} subscriber(s) notified`;
      if (pub.compulsory) compulsory = entry;
    }
    return w;
  });
  syncWi(w, actor.name, action);
  if (compulsory) {
    const c = compulsory as CatalogueEntry;
    safe(() => createSignal({ kind: "compulsory_standard", title: `${c.ref} is now compulsory`, detail: `${c.title} (${c.compulsory?.regulation}). Producers in ${c.sector} need certification and testing.`, services: ["certification", "testing", "standards"], value_estimate: 25000, sector: c.sector, source_ref: `std-comp:${c.id}`, prospect: { name: `${c.sector} producers` } }));
  }
  return w;
}

export function uploadDraft(id: string, input: { label: string; file: string; summary: string; pages?: number; text?: string }, actor: Actor): WorkItem {
  if (!input.label.trim() || !input.summary.trim()) throw new Error("Give the version a label (e.g. WD2) and a change summary.");
  return stdStore.mutate((s) => {
    const w = s.items[id];
    if (!w) throw new Error("Work item not found.");
    if (["Public Review", "Ballot", "Published", "Cancelled"].includes(w.state)) throw new Error(`Drafts are locked while the work item is ${w.state}.`);
    if (w.drafts.some((d) => d.label === input.label)) throw new Error(`${input.label} already exists — use the next number.`);
    const stage = w.state === "Comment Resolution" || w.state === "Committee Draft" ? "Committee Draft" : w.state === "Approved" ? "Approved" : "Working Draft";
    w.drafts.push({ id: input.label, label: input.label, stage, file: input.file || `${input.label}.pdf`, uploaded_by: actor.name, at: nowIso(), summary: input.summary, pages: input.pages, text: input.text });
    w.history.push({ at: nowIso(), actor: actor.name, action: `Uploaded ${input.label}`, note: input.summary });
    return w;
  });
}

export function savePublication(id: string, patch: Partial<PublicationChecklist>, actor: Actor): WorkItem {
  return stdStore.mutate((s) => {
    const w = s.items[id];
    if (!w) throw new Error("Work item not found.");
    w.publication = { ...(w.publication ?? {}), ...patch };
    w.history.push({ at: nowIso(), actor: actor.name, action: "Updated publication checklist" });
    return w;
  });
}

export function createWorkItem(input: Pick<WorkItem, "ref" | "title" | "scope" | "type" | "tc_id" | "project_leader" | "sector"> & Partial<Pick<WorkItem, "adoption" | "revises" | "proposal_id">>, actor: Actor): WorkItem {
  if (!input.ref.trim() || !input.title.trim()) throw new Error("Reference and title are required.");
  const w = stdStore.mutate((s) => {
    s.seq += 1;
    const id = `WI-26-${String(s.seq).padStart(3, "0")}`;
    const w: WorkItem = { ...input, id, state: "Working Draft", seq: 1, targets: { "Committee Draft": isoIn(90), "Public Review": isoIn(150), Published: isoIn(365) }, drafts: [], created_at: nowIso(), history: [{ at: nowIso(), actor: actor.name, action: "Work item created", to: "Working Draft" }] };
    s.items[id] = w;
    return w;
  });
  syncWi(w, actor.name);
  return w;
}

/* ---------------- comments (public review & resolution) ---------------- */

/** "Have your say": drafts open for public comment. */
export function openDrafts(): (WorkItem & { tc_name: string; comments: number })[] {
  stdStore.guard("Drafts for comment");
  reconcile();
  return stdStore.view((s) => Object.values(s.items).filter((w) => w.state === "Public Review").map((w) => ({ ...w, tc_name: `${s.tcs[w.tc_id]?.number} ${s.tcs[w.tc_id]?.name}`, comments: Object.values(s.comments).filter((c) => c.work_item_id === w.id).length })).sort((a, b) => (a.comment_period?.closes ?? "").localeCompare(b.comment_period?.closes ?? "")));
}

export function listComments(f: { wi?: string; email?: string } = {}): (DraftComment & { wi_ref: string; wi_title: string; wi_state: string })[] {
  stdStore.guard("Comments");
  reconcile();
  const e = f.email?.toLowerCase();
  return stdStore.view((s) =>
    Object.values(s.comments)
      .filter((c) => !f.wi || c.work_item_id === f.wi)
      .filter((c) => !e || c.by.email === "demo" || c.by.email.toLowerCase() === e)
      .map((c) => ({ ...c, wi_ref: s.items[c.work_item_id]?.ref ?? "", wi_title: s.items[c.work_item_id]?.title ?? "", wi_state: s.items[c.work_item_id]?.state ?? "" }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
}

export function submitComments(wiId: string, by: DraftComment["by"], items: Pick<DraftComment, "clause" | "paragraph" | "type" | "comment" | "proposed_change">[]): DraftComment[] {
  stdStore.guard("Public comment");
  if (!by.name.trim() || !by.email.trim()) throw new Error("Your name and email are needed so the TC can reply.");
  const rows = items.filter((i) => i.comment.trim());
  if (!rows.length) throw new Error("Write at least one comment.");
  for (const r of rows) if (!r.clause.trim()) throw new Error("Each comment needs the clause it refers to (or 'General').");
  const out = stdStore.mutate((s) => {
    const w = s.items[wiId];
    if (!w) throw new Error("Draft not found.");
    if (w.state !== "Public Review" || (w.comment_period && new Date(w.comment_period.closes).getTime() < Date.now())) throw new Error("This draft is no longer open for comment.");
    const draft = [...w.drafts].reverse().find((d) => d.locked) ?? w.drafts[w.drafts.length - 1];
    return rows.map((r) => {
      s.seq += 1;
      const c: DraftComment = { ...r, id: `CMT-${wiId.slice(-3)}-${s.seq}`, work_item_id: wiId, draft_label: draft?.label ?? "CD", by, at: nowIso() };
      s.comments[c.id] = c;
      return c;
    });
  });
  const w = stdStore.read().items[wiId];
  notifySafe({ audience: "customer", to: by.email, kind: "comment", ref: w.ref, title: `Comments received — ${w.ref}`, body: `Thank you. We received ${out.length} comment(s) on ${w.title}. The TC will consider every comment after the period closes and you'll see the disposition in your account.`, link: "/account/comments", channel: ["email", "portal"] });
  return out;
}

export function setDisposition(ids: string[], disposition: CommentDisposition, response: string, actor: Actor): void {
  if (disposition === "rejected" && !response.trim()) throw new Error("Give the TC's reason for rejecting — the commenter sees it.");
  stdStore.mutate((s) => {
    for (const id of ids) {
      const c = s.comments[id];
      if (!c) continue;
      const w = s.items[c.work_item_id];
      if (w?.state !== "Comment Resolution") throw new Error("Dispositions are set during comment resolution.");
      c.disposition = disposition;
      c.response = response || c.response;
      c.resolved_by = actor.name;
      c.resolved_at = nowIso();
    }
  });
}

export function resolutionReport(wiId: string): string {
  const b = getWorkItem(wiId);
  if (!b) return "";
  const lines = b.comments.map((c, i) => `${i + 1}. [${c.clause}] ${c.type.toUpperCase()} — ${c.by.org || c.by.name}\n   Comment: ${c.comment}${c.proposed_change ? `\n   Proposed: ${c.proposed_change}` : ""}\n   Disposition: ${c.disposition ? DISPOSITION_LABEL[c.disposition] : "PENDING"}${c.response ? ` — ${c.response}` : ""}`);
  const counts = (Object.keys(DISPOSITION_LABEL) as CommentDisposition[]).map((d) => `${DISPOSITION_LABEL[d]}: ${b.comments.filter((c) => c.disposition === d).length}`).join(" · ");
  return `Comment resolution report — ${b.wi.ref} ${b.wi.title}\n${b.tc?.number} ${b.tc?.name}\nComment period: ${b.wi.comment_period ? `${new Date(b.wi.comment_period.opens).toLocaleDateString()} – ${new Date(b.wi.comment_period.closes).toLocaleDateString()}` : "—"}\n${b.comments.length} comments · ${counts}\n\n${lines.join("\n\n")}`;
}

export function replyToCommenters(wiId: string, actor: Actor): number {
  const b = getWorkItem(wiId);
  if (!b) throw new Error("Work item not found.");
  const pending = b.comments.filter((c) => c.disposition && !c.replied_at);
  const by = new Map<string, DraftComment[]>();
  for (const c of pending) by.set(c.by.email, [...(by.get(c.by.email) ?? []), c]);
  for (const [email, list] of by) notifySafe({ audience: "customer", to: email, kind: "comment", ref: b.wi.ref, title: `The TC's response to your comments on ${b.wi.ref}`, body: list.map((c) => `${c.clause}: ${DISPOSITION_LABEL[c.disposition!]}${c.response ? ` — ${c.response}` : ""}`).join("\n"), link: "/account/comments", channel: ["email", "portal"] });
  stdStore.mutate((s) => {
    for (const c of pending) if (s.comments[c.id]) s.comments[c.id].replied_at = nowIso();
    s.items[wiId].history.push({ at: nowIso(), actor: actor.name, action: `Replied to ${by.size} commenter(s)`, note: `${pending.length} comments` });
  });
  return by.size;
}

/** Assistant clustering (06 P3): groups comments by clause and suggests a disposition — proposes only. */
export function clusterComments(wiId: string): { clause: string; ids: string[]; suggestion: CommentDisposition; why: string }[] {
  const b = getWorkItem(wiId);
  if (!b) return [];
  const groups = new Map<string, DraftComment[]>();
  for (const c of b.comments.filter((x) => !x.disposition)) groups.set(c.clause.split(/[ .]/)[0], [...(groups.get(c.clause.split(/[ .]/)[0]) ?? []), c]);
  return [...groups.entries()].map(([clause, list]) => {
    const editorial = list.every((c) => c.type === "editorial");
    const general = list.every((c) => c.type === "general" && !c.proposed_change);
    return { clause, ids: list.map((c) => c.id), suggestion: editorial ? "accepted" : general ? "noted" : "accepted_in_principle", why: editorial ? "Editorial only — usually accepted." : general ? "General remark without a proposed change." : `${list.length} technical comment(s) — TC to decide the wording.` };
  });
}

/* ---------------- ballots ---------------- */

export type Tally = { approve: number; disapprove: number; abstain: number; cast: number; eligible: number; approvePct: number; disapprovePct: number; quorum: boolean; passes: boolean };

export function tallyBallot(b: Ballot): Tally {
  const votes = Object.values(b.votes);
  const approve = votes.filter((v) => v.vote === "approve" || v.vote === "approve_comments").length;
  const disapprove = votes.filter((v) => v.vote === "disapprove").length;
  const abstain = votes.filter((v) => v.vote === "abstain").length;
  const cast = votes.length;
  const decisive = approve + disapprove;
  const approvePct = decisive ? Math.round((approve / decisive) * 1000) / 10 : 0;
  const disapprovePct = cast ? Math.round((disapprove / cast) * 1000) / 10 : 0;
  const quorum = b.eligible.length ? (cast / b.eligible.length) * 100 >= b.rule.quorum_pct : false;
  return { approve, disapprove, abstain, cast, eligible: b.eligible.length, approvePct, disapprovePct, quorum, passes: quorum && approvePct >= b.rule.approve_pct && disapprovePct <= b.rule.max_disapprove_pct };
}

function closeBallotIn(s: StdState, b: Ballot, why: string): WorkItem | null {
  const t = tallyBallot(b);
  b.state = t.passes ? "Passed" : "Failed";
  b.closed_at = nowIso();
  const w = s.items[b.work_item_id];
  if (!w || w.state !== "Ballot") return null;
  const to = t.passes ? "Approved" : "Committee Draft";
  w.history.push({ at: nowIso(), actor: "System", action: `Ballot ${b.id} ${t.passes ? "passed" : "failed"} (${t.approve}–${t.disapprove}, ${t.abstain} abstain)`, from: "Ballot", to, note: why });
  w.state = to;
  w.seq += 1;
  return w;
}

export function getBallot(id: string): { ballot: Ballot; wi: WorkItem; tc: TechnicalCommittee | undefined; tally: Tally } | null {
  stdStore.guard("Ballot");
  reconcile();
  return stdStore.view((s) => {
    const ballot = s.ballots[id];
    if (!ballot) return null;
    const wi = s.items[ballot.work_item_id];
    return { ballot, wi, tc: s.tcs[wi?.tc_id], tally: tallyBallot(ballot) };
  });
}

export function listBallots(): (Ballot & { wi_ref: string; wi_title: string })[] {
  stdStore.guard("Ballots");
  reconcile();
  return stdStore.view((s) => Object.values(s.ballots).map((b) => ({ ...b, wi_ref: s.items[b.work_item_id]?.ref ?? "", wi_title: s.items[b.work_item_id]?.title ?? "" })).sort((a, b) => b.opens.localeCompare(a.opens)));
}

export function castVote(ballotId: string, member: string, vote: Vote, comment?: string): Ballot {
  stdStore.guard("Voting");
  if (vote === "disapprove" && !comment?.trim()) throw new Error("A disapproval needs your technical reasons.");
  let moved: WorkItem | null = null;
  const b = stdStore.mutate((s) => {
    const b = s.ballots[ballotId];
    if (!b) throw new Error("Ballot not found.");
    if (b.state !== "Open" || new Date(b.closes).getTime() < Date.now()) throw new Error("This ballot is closed.");
    if (!b.eligible.includes(member)) throw new Error(`${member} isn't a voting member of this committee.`);
    b.votes[member] = { vote, comment: comment?.trim() || undefined, at: nowIso() };
    if (b.eligible.every((n) => b.votes[n])) moved = closeBallotIn(s, b, "All members voted");
    return b;
  });
  if (moved) syncWi(moved, "System");
  return b;
}

export function closeBallotNow(ballotId: string, actor: Actor, reason: string): Ballot {
  if (!reason.trim()) throw new Error("Say why the ballot closes early.");
  let moved: WorkItem | null = null;
  const b = stdStore.mutate((s) => {
    const b = s.ballots[ballotId];
    if (!b || b.state !== "Open") throw new Error("Ballot isn't open.");
    moved = closeBallotIn(s, b, `Closed early by ${actor.name}: ${reason}`);
    return b;
  });
  if (moved) syncWi(moved, actor.name);
  return b;
}

/* ---------------- TC member area (Service /tc) ---------------- */

export function myCommittees(email?: string): { tc: TechnicalCommittee; member: TcMember }[] {
  stdStore.guard("TC membership");
  reconcile();
  const e = email?.toLowerCase();
  return stdStore.view((s) => Object.values(s.tcs).flatMap((tc) => tc.members.filter((m) => m.email === "demo" || (e && m.email.toLowerCase() === e)).map((member) => ({ tc, member }))));
}

export function myBallots(email?: string): { ballot: Ballot; wi: WorkItem; member: string; voted: boolean }[] {
  const mine = myCommittees(email);
  return stdStore.view((s) =>
    Object.values(s.ballots)
      .flatMap((b) => {
        const wi = s.items[b.work_item_id];
        const m = mine.find((x) => x.tc.id === wi?.tc_id && b.eligible.includes(x.member.name));
        return m && wi ? [{ ballot: b, wi, member: m.member.name, voted: Boolean(b.votes[m.member.name]) }] : [];
      })
      .sort((a, b) => b.ballot.opens.localeCompare(a.ballot.opens)),
  );
}

/* ---------------- proposals (R-S1) ---------------- */

export function listProposals(f: { email?: string; state?: string } = {}): Proposal[] {
  stdStore.guard("Proposals");
  reconcile();
  const e = f.email?.toLowerCase();
  return stdStore.view((s) => Object.values(s.proposals).filter((p) => (!f.state || p.state === f.state) && (!e || p.proposer.email === "demo" || p.proposer.email.toLowerCase() === e)).sort((a, b) => b.at.localeCompare(a.at)));
}

export function getProposal(id: string): Proposal | null {
  stdStore.guard("Proposal");
  reconcile();
  return stdStore.view((s) => s.proposals[id] ?? null);
}

export function submitProposal(input: Omit<Proposal, "id" | "state" | "seq" | "history" | "at" | "work_item_id">): Proposal {
  stdStore.guard("Proposal");
  if (!input.title.trim() || !input.scope.trim() || !input.justification.trim()) throw new Error("Title, scope and justification are required.");
  if (!input.proposer.name.trim() || !input.proposer.email.trim()) throw new Error("Your name and email are needed.");
  const p = stdStore.mutate((s) => {
    s.seq += 1;
    const id = `NWIP-26-${String(s.seq).padStart(3, "0")}`;
    const p: Proposal = { ...input, id, state: "Submitted", seq: 1, at: nowIso(), history: [{ at: nowIso(), actor: `${input.proposer.name} (stakeholder)`, action: "Submitted proposal", to: "Submitted" }] };
    s.proposals[id] = p;
    return p;
  });
  syncProposal(p, input.proposer.name);
  notifySafe({ audience: "customer", to: p.proposer.email, kind: "comment", ref: p.id, title: `Proposal received — ${p.id}`, body: `Thank you for proposing "${p.title}". The TC secretary will review it and put it to the technical committee. Track it in your account.`, link: "/account/comments", channel: ["email", "portal"] });
  return p;
}

export function proposalActions(id: string, actor: Actor): ActionOption[] {
  const p = stdStore.read().proposals[id];
  return p ? allowedActions(PROPOSAL_DEF, p, actor) : [];
}

export async function actOnProposal(id: string, action: string, actor: Actor, input: ActInput): Promise<Proposal> {
  stdStore.guard("Proposal");
  const cur = stdStore.read().proposals[id];
  if (!cur) throw new Error("Proposal not found.");
  let wi: WorkItem | null = null;
  if (action === "approve") {
    const tc = input.payload?.tc_id || cur.tc_id;
    if (!tc) throw new Error("Choose the technical committee.");
    wi = createWorkItem({ ref: input.payload?.ref || `SZNS ${100 + Math.floor(Math.random() * 800)}:2026`, title: cur.title, scope: cur.scope, type: "new", tc_id: tc, project_leader: input.payload?.project_leader ?? "", sector: stdStore.read().tcs[tc]?.sectors[0] ?? "General", proposal_id: id }, actor);
  }
  const p = stdStore.mutate((s) => {
    const p = s.proposals[id];
    applyTransition(PROPOSAL_DEF, p, action, actor, input);
    if (input.payload?.tc_id) p.tc_id = input.payload.tc_id;
    if (wi) p.work_item_id = wi.id;
    return p;
  });
  syncProposal(p, actor.name, action);
  if (action === "approve" || action === "reject")
    notifySafe({ audience: "customer", to: p.proposer.email, kind: "comment", ref: p.id, title: `Your proposal "${p.title}" was ${action === "approve" ? "approved" : "not taken forward"}`, body: action === "approve" ? `It's on the work programme as ${wi?.ref} with ${wi?.project_leader} as project leader.` : input.reason ?? "", link: "/account/comments", channel: ["email", "portal"] });
  return p;
}

/* ---------------- committees ---------------- */

export function listTcs(): TechnicalCommittee[] {
  stdStore.guard("Technical committees");
  reconcile();
  return stdStore.view((s) => Object.values(s.tcs));
}

export function getTc(id: string): TechnicalCommittee | null {
  stdStore.guard("Technical committee");
  reconcile();
  return stdStore.view((s) => s.tcs[id] ?? null);
}

export function applyToTc(tcId: string, input: { name: string; org: string; email: string; category: MemberCategory; motivation: string }): void {
  stdStore.guard("TC application");
  if (!input.name.trim() || !input.email.trim() || !input.motivation.trim()) throw new Error("Name, email and motivation are required.");
  const tc = stdStore.mutate((s) => {
    const tc = s.tcs[tcId];
    if (!tc) throw new Error("Committee not found.");
    if (tc.members.some((m) => m.email.toLowerCase() === input.email.toLowerCase())) throw new Error("You're already a member of this committee.");
    s.seq += 1;
    tc.applications.push({ ...input, id: `TCA-26-${String(s.seq).padStart(3, "0")}`, tc_id: tcId, at: nowIso(), state: "pending" });
    return tc;
  });
  tcAppTask(tc, tc.applications[tc.applications.length - 1].id);
  notifySafe({ audience: "customer", to: input.email, kind: "comment", ref: tcId, title: `Application to join ${tc.number} received`, body: `The TC secretary will consider your application to join ${tc.number} ${tc.name} and reply within 10 working days.`, link: "/standards/committees", channel: ["email"] });
}

export function decideTcApplication(tcId: string, appId: string, approve: boolean, reason: string, actor: Actor): void {
  if (!approve && !reason.trim()) throw new Error("Give a reason for declining.");
  const a = stdStore.mutate((s) => {
    const tc = s.tcs[tcId];
    const a = tc?.applications.find((x) => x.id === appId);
    if (!tc || !a) throw new Error("Application not found.");
    a.state = approve ? "approved" : "declined";
    a.decided_by = actor.name;
    a.reason = reason || undefined;
    if (approve) tc.members.push({ name: a.name, org: a.org, email: a.email, category: a.category, voting: true, role: "member", term_end: isoIn(3 * 365) });
    return a;
  });
  safe(() => taskStore.mutate((s) => {
    for (const t of Object.values(s.tasks)) if (t.doctype === "TC Application" && t.name === appId && !t.closed_at) Object.assign(t, { closed_at: nowIso(), closed_by: actor.name, outcome: a.state });
  }));
  notifySafe({ audience: "customer", to: a.email, kind: "comment", ref: tcId, title: approve ? `Welcome to ${tcId.replace("TC", "TC ")}` : "Your TC application", body: approve ? "You're now a voting member. Ballots and drafts appear in your TC member area." : reason, link: approve ? "/tc" : "/standards/committees", channel: ["email", "portal"] });
}

export function saveTcMember(tcId: string, member: TcMember, actor: Actor, remove = false): TechnicalCommittee {
  return stdStore.mutate((s) => {
    const tc = s.tcs[tcId];
    if (!tc) throw new Error("Committee not found.");
    tc.members = tc.members.filter((m) => m.email !== member.email);
    if (!remove) tc.members.push(member);
    void actor;
    return tc;
  });
}

export function addTcMeeting(tcId: string, m: { date: string; title: string; attendance: string[]; minutes?: string }): TechnicalCommittee {
  if (!m.date || !m.title.trim()) throw new Error("Date and title are required.");
  return stdStore.mutate((s) => {
    const tc = s.tcs[tcId];
    if (!tc) throw new Error("Committee not found.");
    tc.meetings.push({ ...m, id: `TCM-${tcId}-${tc.meetings.length + 1}`, date: new Date(m.date).toISOString() });
    return tc;
  });
}

/* ---------------- catalogue & periodic review (R-S4) ---------------- */

export function listCatalogue(f: { q?: string; status?: string; sector?: string } = {}): CatalogueEntry[] {
  stdStore.guard("Catalogue");
  const q = f.q?.trim().toLowerCase();
  return stdStore.view((s) =>
    Object.values(s.catalogue)
      .filter((c) => (!f.status || c.status === f.status) && (!f.sector || c.sector === f.sector))
      .filter((c) => !q || `${c.ref} ${c.title} ${c.keywords.join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })),
  );
}

/** Catalogue rows for the public Service list (never throws). */
export function publicCatalogue(): CatalogueEntry[] {
  try {
    return listCatalogue();
  } catch {
    return [];
  }
}

export function getCatalogueEntry(id: string): CatalogueEntry | null {
  return stdStore.view((s) => s.catalogue[id] ?? Object.values(s.catalogue).find((c) => c.ref === id) ?? null);
}

export function saveCatalogueEntry(e: CatalogueEntry, actor: Actor): CatalogueEntry {
  if (!e.ref.trim() || !e.title.trim()) throw new Error("Reference and title are required.");
  if (e.price < 0) throw new Error("Price can't be negative.");
  void actor;
  return stdStore.mutate((s) => (s.catalogue[e.id] = structuredClone(e)));
}

export function reviewQueue(): { entry: CatalogueEntry; due: string; years: number }[] {
  stdStore.guard("Periodic review");
  const s = stdStore.read();
  const span = s.settings.review_years * 365 * 86_400_000;
  return Object.values(s.catalogue)
    .filter((c) => c.status === "current")
    .map((entry) => {
      const last = entry.review && entry.review.decision === "confirm" ? entry.review.at : entry.published_at;
      return { entry: structuredClone(entry), due: new Date(new Date(last).getTime() + span).toISOString(), years: Math.floor((Date.now() - new Date(entry.published_at).getTime()) / (365 * 86_400_000)) };
    })
    .filter((r) => new Date(r.due).getTime() < Date.now() + 90 * 86_400_000)
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function decideReview(catId: string, decision: "confirm" | "revise" | "withdraw", reason: string, actor: Actor): CatalogueEntry {
  if (!reason.trim()) throw new Error("Record the TC's reason.");
  let wiId: string | undefined;
  const cur = stdStore.read().catalogue[catId];
  if (!cur) throw new Error("Standard not found.");
  if (decision === "revise") wiId = createWorkItem({ ref: `${cur.ref.split(":")[0]}:2026`, title: cur.title, scope: cur.abstract, type: "revision", tc_id: cur.tc_id ?? "TC3", project_leader: "", sector: cur.sector, revises: cur.id }, actor).id;
  const e = stdStore.mutate((s) => {
    const e = s.catalogue[catId];
    e.review = { decision, at: nowIso(), by: actor.name, reason, work_item_id: wiId };
    if (decision === "withdraw") e.status = "withdrawn";
    if (decision === "withdraw") notifySubscribers(s, { sector: e.sector, tc_id: e.tc_id, ref: e.ref, title: e.title }, "withdrawals", `Withdrawn: ${e.ref}`, `${e.title} has been withdrawn after periodic review. Reason: ${reason}`, `/standards/${e.id}`, e.id);
    return e;
  });
  return e;
}

/* ---------------- subscriptions (S12) ---------------- */

export function listSubscriptions(email?: string): Subscription[] {
  stdStore.guard("Subscriptions");
  const e = email?.toLowerCase();
  return stdStore.view((s) => Object.values(s.subscriptions).filter((x) => !e || x.email === "demo" || x.email.toLowerCase() === e));
}

export function subscribe(input: Omit<Subscription, "id" | "at">): Subscription {
  stdStore.guard("Subscriptions");
  if (!input.events.length) throw new Error("Pick at least one kind of update.");
  return stdStore.mutate((s) => {
    const dup = Object.values(s.subscriptions).find((x) => x.email === input.email && x.kind === input.kind && x.value === input.value);
    if (dup) {
      dup.events = input.events;
      return dup;
    }
    s.seq += 1;
    const sub = { ...input, id: `SUB-${s.seq}`, at: nowIso() };
    s.subscriptions[sub.id] = sub;
    return sub;
  });
}

export function unsubscribe(id: string): void {
  stdStore.mutate((s) => {
    delete s.subscriptions[id];
  });
}

/* ---------------- programme dashboard ---------------- */

export function programme() {
  const items = listWorkItems();
  const s = stdStore.read();
  const year = new Date().getFullYear();
  const overdue = items.filter((w) => {
    const t = w.targets[w.state];
    return t && new Date(t).getTime() < Date.now() && !["Published", "Cancelled"].includes(w.state);
  });
  return {
    byStage: WI_DEF.states.map((st) => ({ state: st.id, label: st.label, count: items.filter((w) => w.state === st.id).length })),
    byTc: Object.values(s.tcs).map((tc) => ({ tc: `${tc.number} ${tc.name}`, open: items.filter((w) => w.tc_id === tc.id && !["Published", "Cancelled"].includes(w.state)).length })),
    overdue,
    publishedThisYear: Object.values(s.catalogue).filter((c) => c.status === "current" && new Date(c.published_at).getFullYear() === year).length,
    contested: Object.values(s.ballots).filter((b) => Object.values(b.votes).some((v) => v.vote === "disapprove")),
    proposalsOpen: Object.values(s.proposals).filter((p) => ["Submitted", "Circulated"].includes(p.state)).length,
    reviewsDue: reviewQueue().length,
  };
}
