/**
 * Standards development tabs (gap 06): Programme · Proposals · Work items · Public review · Ballots ·
 * Catalogue · Committees · Periodic review · Settings, plus proposal, catalogue and TC record pages.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import { Facts, HistoryTimeline, ModuleSettings, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import {
  actOnProposal,
  addTcMeeting,
  createWorkItem,
  decideReview,
  decideTcApplication,
  getCatalogueEntry,
  getProposal,
  getStdSettings,
  getTc,
  listBallots,
  listCatalogue,
  listComments,
  listProposals,
  listTcs,
  listWorkItems,
  programme,
  PROPOSAL_DEF,
  proposalActions,
  resetStandardsDemo,
  reviewQueue,
  saveCatalogueEntry,
  saveStdSettings,
  saveTcMember,
  tallyBallot,
  WI_DEF,
  type CatalogueEntry,
  type MemberCategory,
  type StandardsSettings,
} from "@eswasaone/shared-ui/standards";
import { ReasonDialog, stateDef } from "@eswasaone/shared-ui/workflow";
import { Acts, Empty, Gate, PageHead, run, Tile, useDomain, useStaffActor, useToast, WfPill } from "../domain/ui";

const wiLink = (id: string) => `/standards/workitems/${id}`;

export function ProgrammeView() {
  const res = useDomain(() => programme(), []);
  return (
    <Gate res={res} what="Work programme">
      {(p) => (
        <div className="crm-stack">
          <PageHead title="Work programme" sub="Every work item by stage and committee, overdue against target dates, contested ballots and standards published this year." />
          <div className="crm-kpis crm-kpis--6">
            <Tile label="Open work items" value={p.byStage.filter((s) => !["Published", "Cancelled"].includes(s.state)).reduce((n, s) => n + s.count, 0)} to="/standards/workitems" />
            <Tile label="In public review" value={p.byStage.find((s) => s.state === "Public Review")?.count ?? 0} to="/standards/comments" />
            <Tile label="Overdue vs target" value={p.overdue.length} tone={p.overdue.length ? "red" : "green"} />
            <Tile label="Published this year" value={p.publishedThisYear} tone="green" sub="Board roll-up" />
            <Tile label="Proposals open" value={p.proposalsOpen} to="/standards/proposals" />
            <Tile label="Reviews due" value={p.reviewsDue} tone={p.reviewsDue ? "amber" : undefined} to="/standards/reviews" />
          </div>
          <div className="crm-grid crm-grid--2">
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Stage funnel</h3>
              </div>
              {p.byStage.map((s) => (
                <div key={s.state} className="crm-row" style={{ margin: "6px 0" }}>
                  <span style={{ width: 170 }}>{s.label}</span>
                  <div className="crm-bar__track" style={{ flex: 1 }}>
                    <div className="crm-bar__fill" style={{ width: `${Math.min(100, s.count * 20)}%` }} />
                  </div>
                  <b>{s.count}</b>
                </div>
              ))}
            </div>
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>By committee</h3>
              </div>
              {p.byTc.map((t) => (
                <p key={t.tc}>
                  {t.tc}: <b>{t.open}</b> open
                </p>
              ))}
              <h4>Overdue</h4>
              {p.overdue.map((w) => (
                <p key={w.id} className="crm-small">
                  <Link className="crm-link" to={wiLink(w.id)}>
                    {w.ref}
                  </Link>{" "}
                  {w.state} target {fmtDate(w.targets[w.state])}
                </p>
              ))}
              {!p.overdue.length ? <p className="crm-muted">None.</p> : null}
              <h4>Contested ballots</h4>
              {p.contested.map((b) => (
                <p key={b.id} className="crm-small">
                  <Link className="crm-link" to={`/standards/ballots/${b.id}`}>
                    {b.id}
                  </Link>{" "}
                  {tallyBallot(b).disapprove} disapprove
                </p>
              ))}
              {!p.contested.length ? <p className="crm-muted">None.</p> : null}
            </div>
          </div>
        </div>
      )}
    </Gate>
  );
}

export function ProposalsView() {
  const res = useDomain(() => listProposals(), []);
  return (
    <Gate res={res} what="Proposals">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="New work proposals (NWIP)" sub="Stakeholders propose from the Service portal (R-S1). The TC secretary reviews and circulates; the Head of Standards approves into the programme." />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Proposer</th>
                <th>Urgency</th>
                <th>State</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="crm-link" to={`/standards/proposals/${p.id}`}>
                      {p.title}
                    </Link>
                    <span className="crm-small">{p.id}</span>
                  </td>
                  <td>
                    {p.proposer.name}
                    <span className="crm-small">{p.proposer.org}</span>
                  </td>
                  <td>{p.urgency}</td>
                  <td>
                    <WfPill def={PROPOSAL_DEF} state={p.state} />
                  </td>
                  <td>{fmtDate(p.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function ProposalRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => ({ p: getProposal(id), tcs: listTcs() }), [id]);
  const [dlg, setDlg] = useState<null | "circulate" | "approve">(null);
  return (
    <Gate res={res} what="Proposal">
      {({ p, tcs }) =>
        !p ? (
          <Empty title="Proposal not found" />
        ) : (
          <>
            {toast}
            <RecordPage
              back={{ to: "/standards/proposals", label: "Proposals" }}
              reference={p.id}
              type="New work item proposal"
              title={p.title}
              state={stateDef(PROPOSAL_DEF, p.state)?.label}
              tone={stateDef(PROPOSAL_DEF, p.state)?.tone}
              actions={
                <>
                  {proposalActions(p.id, actor)
                    .filter((a) => a.action === "circulate" || a.action === "approve")
                    .map((a) => (
                      <button key={a.action} type="button" className="crm-btn crm-btn--pri" onClick={() => setDlg(a.action as "circulate" | "approve")}>
                        {a.label}
                      </button>
                    ))}
                  <Acts actions={proposalActions(p.id, actor)} hide={["circulate", "approve"]} state={p.state} toast={show} act={(a, input) => actOnProposal(p.id, a.action, actor, input)} />
                </>
              }
              summary={<Facts rows={[{ label: "Scope", value: p.scope }, { label: "Justification", value: p.justification }, { label: "International refs", value: p.intl_refs }, { label: "Stakeholders", value: p.stakeholders }, { label: "Proposer", value: `${p.proposer.name}${p.proposer.org ? `, ${p.proposer.org}` : ""} (${p.proposer.email === "demo" ? "demo customer" : p.proposer.email})` }, { label: "Work item", value: p.work_item_id ? <Link className="crm-link" to={wiLink(p.work_item_id)}>{p.work_item_id}</Link> : undefined }]} />}
              tabs={[{ id: "history", label: "History", render: () => <HistoryTimeline events={p.history} /> }]}
            />
            {dlg ? (
              <ReasonDialog
                title={dlg === "circulate" ? "Circulate to TC" : "Approve and create work item"}
                consequence={proposalActions(p.id, actor).find((a) => a.action === dlg)?.consequence}
                fields={[
                  { key: "tc_id", label: "Technical committee", type: "select", required: dlg === "circulate" || !p.tc_id, options: tcs.map((t) => ({ value: t.id, label: `${t.number} ${t.name}` })) },
                  ...(dlg === "approve" ? [{ key: "project_leader", label: "Project leader", required: true }, { key: "ref", label: "Reference (e.g. SZNS 345:2026)" }] : []),
                ]}
                onClose={() => setDlg(null)}
                onSubmit={async (v) => {
                  await actOnProposal(p.id, dlg, actor, { expected_state: p.state, payload: { tc_id: p.tc_id ?? "", ...v.payload }, note: v.note });
                  setDlg(null);
                  show(dlg === "approve" ? "Work item created; proposer notified." : "Circulated to the TC.");
                }}
              />
            ) : null}
          </>
        )
      }
    </Gate>
  );
}

export function WorkItemsView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [state, setState] = useState("");
  const [add, setAdd] = useState(false);
  const res = useDomain(() => ({ items: listWorkItems({ state }), tcs: listTcs() }), [state]);
  return (
    <Gate res={res} what="Work items">
      {({ items, tcs }) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Work items" actions={<button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setAdd(true)}><Icon name="i-plus" /> New work item (adoption / revision)</button>} />
          <div className="crm-seg">
            {["", ...WI_DEF.states.map((s) => s.id)].map((s) => (
              <button key={s} type="button" className={state === s ? "on" : ""} onClick={() => setState(s)}>
                {s || "All"}
              </button>
            ))}
          </div>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>TC</th>
                <th>Stage</th>
                <th>Latest draft</th>
                <th>Next target</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link className="crm-link crm-mono" to={wiLink(w.id)}>
                      {w.ref}
                    </Link>
                  </td>
                  <td>
                    {w.title}
                    <span className="crm-small">
                      {w.type}
                      {w.adoption ? ` ${w.adoption.degree} ${w.adoption.ref}` : ""}
                    </span>
                  </td>
                  <td>{w.tc_id}</td>
                  <td>
                    <WfPill def={WI_DEF} state={w.state} />
                  </td>
                  <td>{w.drafts[w.drafts.length - 1]?.label ?? "—"}</td>
                  <td>{fmtDate(w.targets[w.state] ?? w.targets.Published)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {add ? (
            <ReasonDialog
              title="New work item"
              consequence="Adds an item to the programme in Working Draft (identical/modified adoptions of ISO, IEC, SADC, ARSO or Codex standards, or revisions)."
              fields={[
                { key: "ref", label: "Reference", required: true },
                { key: "title", label: "Title", required: true },
                { key: "scope", label: "Scope", type: "textarea", required: true },
                { key: "type", label: "Type", type: "select", required: true, options: ["new", "revision", "amendment", "adoption"].map((x) => ({ value: x, label: x })) },
                { key: "source", label: "Adopted from (ISO/IEC/SADC/ARSO/Codex)" },
                { key: "source_ref", label: "Source reference" },
                { key: "degree", label: "Degree", type: "select", options: [{ value: "IDT", label: "Identical (IDT)" }, { value: "MOD", label: "Modified (MOD)" }] },
                { key: "tc_id", label: "Committee", type: "select", required: true, options: tcs.map((t) => ({ value: t.id, label: `${t.number} ${t.name}` })) },
                { key: "project_leader", label: "Project leader", required: true },
              ]}
              onClose={() => setAdd(false)}
              onSubmit={async (v) => {
                const p = v.payload ?? {};
                createWorkItem({ ref: p.ref, title: p.title, scope: p.scope, type: p.type as "new", tc_id: p.tc_id, project_leader: p.project_leader, sector: tcs.find((t) => t.id === p.tc_id)?.sectors[0] ?? "General", adoption: p.type === "adoption" ? { source: (p.source || "ISO") as "ISO", ref: p.source_ref, degree: (p.degree || "IDT") as "IDT" } : undefined }, actor);
                setAdd(false);
                show("Work item created.");
              }}
            />
          ) : null}
        </div>
      )}
    </Gate>
  );
}

export function PublicReviewView() {
  const res = useDomain(() => ({ items: listWorkItems().filter((w) => ["Public Review", "Comment Resolution"].includes(w.state)), comments: listComments() }), []);
  return (
    <Gate res={res} what="Public review">
      {({ items, comments }) => (
        <div className="crm-stack">
          <PageHead title="Public review & comment resolution" sub="Drafts open on the Service portal's 'Have your say' (R-S2). When the period closes, resolve each comment from the work item." />
          {items.map((w) => {
            const cs = comments.filter((c) => c.work_item_id === w.id);
            return (
              <div key={w.id} className="crm-card">
                <div className="crm-row">
                  <Link className="crm-link" to={wiLink(w.id)} style={{ flex: 1 }}>
                    <b>{w.ref}</b> {w.title}
                  </Link>
                  <WfPill def={WI_DEF} state={w.state} />
                </div>
                <p className="crm-small">
                  {w.comment_period ? `${fmtDate(w.comment_period.opens)} → ${fmtDate(w.comment_period.closes)}` : ""} · {cs.length} comments ({cs.filter((c) => c.type === "technical").length} technical) · {cs.filter((c) => !c.disposition).length} without disposition
                </p>
              </div>
            );
          })}
          {!items.length ? <Empty title="No drafts in public review" /> : null}
        </div>
      )}
    </Gate>
  );
}

export function BallotsView() {
  const res = useDomain(() => listBallots(), []);
  return (
    <Gate res={res} what="Ballots">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="Ballots" sub="Voting TC members vote from the TC member area on the Service portal; the ballot closes itself and the tally decides." />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Ballot</th>
                <th>Draft</th>
                <th>Votes</th>
                <th>Tally</th>
                <th>Closes</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const t = tallyBallot(b);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link className="crm-link" to={`/standards/ballots/${b.id}`}>
                        {b.id}
                      </Link>
                      <span className="crm-small">
                        {b.wi_ref} {b.wi_title}
                      </span>
                    </td>
                    <td>{b.draft_label}</td>
                    <td>
                      {t.cast}/{t.eligible}
                    </td>
                    <td className="crm-small">
                      {t.approvePct}% approve · {t.disapprovePct}% disapprove
                    </td>
                    <td>{fmtDate(b.closes)}</td>
                    <td>
                      <span className={`crm-pill crm-pill--${b.state === "Passed" ? "green" : b.state === "Failed" ? "red" : "gold"}`}>{b.state}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function CatalogueView() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const res = useDomain(() => listCatalogue({ q, status }), [q, status]);
  return (
    <Gate res={res} what="Catalogue">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="Catalogue" sub="Published standards as sold on the e-store. Licensed ISO/IEC content previews are limited (copyright)." />
          <div className="crm-toolbar">
            <input className="crm-input" style={{ maxWidth: 260 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="crm-seg">
              {["", "current", "draft", "superseded", "withdrawn"].map((s) => (
                <button key={s} type="button" className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
                  {s || "All"}
                </button>
              ))}
            </div>
          </div>
          <table className="crm-table">
            <thead>
              <tr>
                <th>Standard</th>
                <th>Sector</th>
                <th>Status</th>
                <th>Price</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="crm-link crm-mono" to={`/standards/catalogue/${c.id}`}>
                      {c.ref}
                    </Link>
                    <span className="crm-small">{c.title}</span>
                  </td>
                  <td>{c.sector}</td>
                  <td>
                    {c.status}
                    {c.compulsory ? <span className="crm-pill crm-pill--red">Compulsory</span> : null}
                    {c.superseded_by ? <span className="crm-small">→ {c.superseded_by}</span> : null}
                  </td>
                  <td>E {c.price}</td>
                  <td>{fmtDate(c.published_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gate>
  );
}

export function CatalogueEditorPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => getCatalogueEntry(id), [id]);
  return (
    <Gate res={res} what="Standard">
      {(c) => <CatalogueEditor key={c.id} c={c} actor={actor} show={show} toast={toast} />}
    </Gate>
  );
}

function CatalogueEditor({ c, actor, show, toast }: { c: CatalogueEntry; actor: ReturnType<typeof useStaffActor>; show: (m: string) => void; toast: React.ReactNode }) {
  const [v, setV] = useState(c);
  const set = <K extends keyof CatalogueEntry>(k: K, val: CatalogueEntry[K]) => setV({ ...v, [k]: val });
  return (
    <>
      {toast}
      <RecordPage
        back={{ to: "/standards/catalogue", label: "Catalogue" }}
        reference={c.ref}
        type="Catalogue entry"
        title={c.title}
        state={c.status}
        tone={c.status === "current" ? "green" : "slate"}
        actions={
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void run(() => saveCatalogueEntry(v, actor), show, "Saved — the Service catalogue shows the change.")}>
            Save
          </button>
        }
        tabs={[
          {
            id: "meta",
            label: "Metadata",
            render: () => (
              <div className="crm-form crm-grid crm-grid--2">
                <label className="crm-field">
                  Title
                  <input className="crm-input" value={v.title} onChange={(e) => set("title", e.target.value)} />
                </label>
                <label className="crm-field">
                  ICS
                  <input className="crm-input" value={v.ics} onChange={(e) => set("ics", e.target.value)} />
                </label>
                <label className="crm-field">
                  Keywords (comma separated)
                  <input className="crm-input" value={v.keywords.join(", ")} onChange={(e) => set("keywords", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                </label>
                <label className="crm-field">
                  Price (E)
                  <input className="crm-input" type="number" value={v.price} onChange={(e) => set("price", Number(e.target.value))} />
                </label>
                <label className="crm-field">
                  Preview pages
                  <input className="crm-input" type="number" value={v.preview_pages} onChange={(e) => set("preview_pages", Number(e.target.value))} />
                  {v.licensed ? <span className="hint">Licensed ISO/IEC content — keep previews to the scope pages.</span> : null}
                </label>
                <label className="crm-field">
                  Status
                  <Select value={v.status} onChange={(val) => set("status", val as CatalogueEntry["status"])} block>
                    {["current", "draft", "superseded", "withdrawn"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
                <label className="crm-field">
                  Supersedes
                  <input className="crm-input" value={v.supersedes ?? ""} onChange={(e) => set("supersedes", e.target.value || undefined)} />
                </label>
                <label className="crm-field">
                  Superseded by
                  <input className="crm-input" value={v.superseded_by ?? ""} onChange={(e) => set("superseded_by", e.target.value || undefined)} />
                </label>
                <label className="crm-field">
                  Compulsory under (regulation)
                  <input className="crm-input" value={v.compulsory?.regulation ?? ""} onChange={(e) => set("compulsory", e.target.value ? { regulation: e.target.value, since: v.compulsory?.since ?? new Date().toISOString() } : undefined)} />
                </label>
                <label className="crm-field">
                  Adoption
                  <input className="crm-input" readOnly value={v.adoption ? `${v.adoption.degree} ${v.adoption.ref}` : "National standard"} />
                </label>
                <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
                  Abstract
                  <textarea className="crm-textarea" value={v.abstract} onChange={(e) => set("abstract", e.target.value)} />
                </label>
              </div>
            ),
          },
          { id: "review", label: "Periodic review", render: () => (c.review ? <p>{c.review.decision} by {c.review.by} on {fmtDate(c.review.at)} — {c.review.reason}</p> : <p className="crm-muted">Not reviewed yet. Published {fmtDate(c.published_at)}.</p>) },
        ]}
      />
    </>
  );
}

export function CommitteesView() {
  const res = useDomain(() => listTcs(), []);
  return (
    <Gate res={res} what="Committees">
      {(tcs) => (
        <div className="crm-stack">
          <PageHead title="Technical committees" sub="Members by category (balance of interests), terms, membership applications from the public, meetings." />
          <div className="crm-grid crm-grid--2">
            {tcs.map((tc) => (
              <Link key={tc.id} to={`/standards/committees/${tc.id}`} className="crm-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="crm-card__h">
                  <h3>
                    {tc.number} {tc.name}
                  </h3>
                  {tc.applications.some((a) => a.state === "pending") ? <span className="crm-pill crm-pill--amber">{tc.applications.filter((a) => a.state === "pending").length} applications</span> : null}
                </div>
                <p className="crm-small">{tc.scope}</p>
                <p className="crm-small">
                  Chair {tc.chair} · Secretary {tc.secretary} · {tc.members.filter((m) => m.voting).length} voting members
                </p>
                <p className="crm-small">{(["industry", "government", "academia", "consumer"] as MemberCategory[]).map((c) => `${c}: ${tc.members.filter((m) => m.category === c).length}`).join(" · ")}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Gate>
  );
}

export function CommitteeRecordPage() {
  const { tc: id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [dlg, setDlg] = useState<null | "member" | "meeting" | { app: string; approve: boolean }>(null);
  const res = useDomain(() => ({ tc: getTc(id), items: listWorkItems({ tc: id }) }), [id]);
  return (
    <Gate res={res} what="Committee">
      {({ tc, items }) =>
        !tc ? (
          <Empty title="Committee not found" />
        ) : (
          <>
            {toast}
            <RecordPage
              back={{ to: "/standards/committees", label: "Committees" }}
              reference={tc.number}
              type="Technical committee"
              title={tc.name}
              actions={
                <>
                  <button type="button" className="crm-btn" onClick={() => setDlg("member")}>
                    Add member
                  </button>
                  <button type="button" className="crm-btn" onClick={() => setDlg("meeting")}>
                    Record meeting
                  </button>
                </>
              }
              summary={<Facts rows={[{ label: "Scope", value: tc.scope }, { label: "Chair", value: tc.chair }, { label: "Secretary", value: tc.secretary }]} />}
              tabs={[
                {
                  id: "members",
                  label: "Members",
                  badge: tc.members.length,
                  render: () => (
                    <table className="crm-table">
                      <tbody>
                        {tc.members.map((m) => (
                          <tr key={m.email}>
                            <td>
                              <b>{m.name}</b>
                              <span className="crm-small">{m.org}</span>
                            </td>
                            <td>{m.category}</td>
                            <td>{m.voting ? "Voting" : "Observer"}</td>
                            <td>Term to {fmtDate(m.term_end)}</td>
                            <td>
                              <button type="button" className="crm-link" onClick={() => void run(() => saveTcMember(tc.id, m, actor, true), show, `${m.name} removed.`)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ),
                },
                {
                  id: "applications",
                  label: "Applications",
                  badge: tc.applications.filter((a) => a.state === "pending").length,
                  render: () =>
                    tc.applications.length ? (
                      <table className="crm-table">
                        <tbody>
                          {tc.applications.map((a) => (
                            <tr key={a.id}>
                              <td>
                                <b>{a.name}</b>
                                <span className="crm-small">
                                  {a.org} · {a.category} · {fmtDate(a.at)}
                                </span>
                              </td>
                              <td className="crm-small">{a.motivation}</td>
                              <td>{a.state}</td>
                              <td className="num">
                                {a.state === "pending" ? (
                                  <>
                                    <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setDlg({ app: a.id, approve: true })}>
                                      Approve
                                    </button>{" "}
                                    <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" onClick={() => setDlg({ app: a.id, approve: false })}>
                                      Decline
                                    </button>
                                  </>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="crm-muted">No applications.</p>
                    ),
                },
                { id: "work", label: "Work items", badge: items.length, render: () => <ul>{items.map((w) => <li key={w.id}><Link className="crm-link" to={wiLink(w.id)}>{w.ref}</Link> {w.title} — {w.state}</li>)}</ul> },
                { id: "meetings", label: "Meetings", badge: tc.meetings.length, render: () => <ul>{tc.meetings.map((m) => <li key={m.id}><b>{m.title}</b> {fmtDate(m.date)} · {m.attendance.length} present{m.minutes ? ` — ${m.minutes}` : ""}</li>)}</ul> },
              ]}
            />
            {dlg === "member" ? (
              <ReasonDialog
                title="Add member"
                fields={[
                  { key: "name", label: "Name", required: true },
                  { key: "org", label: "Organisation", required: true },
                  { key: "email", label: "Email", required: true },
                  { key: "category", label: "Category", type: "select", required: true, options: ["industry", "government", "academia", "consumer", "other"].map((x) => ({ value: x, label: x })) },
                  { key: "voting", label: "Voting", type: "select", required: true, options: [{ value: "yes", label: "Voting member" }, { value: "no", label: "Observer" }] },
                ]}
                onClose={() => setDlg(null)}
                onSubmit={async (v) => {
                  const p = v.payload ?? {};
                  saveTcMember(tc.id, { name: p.name, org: p.org, email: p.email, category: p.category as MemberCategory, voting: p.voting === "yes", term_end: new Date(Date.now() + 3 * 365 * 86_400_000).toISOString() }, actor);
                  setDlg(null);
                  show("Member added.");
                }}
              />
            ) : dlg === "meeting" ? (
              <ReasonDialog
                title="Record TC meeting"
                reasonLabel="Minutes / decisions"
                requires="note"
                fields={[{ key: "title", label: "Title", required: true }, { key: "date", label: "Date", type: "date", required: true }, { key: "attendance", label: "Present (comma separated)" }]}
                onClose={() => setDlg(null)}
                onSubmit={async (v) => {
                  addTcMeeting(tc.id, { title: v.payload?.title ?? "", date: v.payload?.date ?? "", attendance: (v.payload?.attendance ?? "").split(",").map((x) => x.trim()).filter(Boolean), minutes: v.note });
                  setDlg(null);
                  show("Meeting recorded.");
                }}
              />
            ) : dlg ? (
              <ReasonDialog
                title={dlg.approve ? "Approve membership" : "Decline application"}
                requires={dlg.approve ? undefined : "reason"}
                onClose={() => setDlg(null)}
                onSubmit={async (v) => {
                  decideTcApplication(tc.id, dlg.app, dlg.approve, v.reason ?? "", actor);
                  setDlg(null);
                  show(dlg.approve ? "Member added." : "Declined.");
                }}
              />
            ) : null}
          </>
        )
      }
    </Gate>
  );
}

export function ReviewsView() {
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [dlg, setDlg] = useState<{ id: string; ref: string } | null>(null);
  const res = useDomain(() => reviewQueue(), []);
  return (
    <Gate res={res} what="Periodic review">
      {(rows) => (
        <div className="crm-stack">
          {toast}
          <PageHead title="Periodic review (R-S4)" sub={`Standards due for their ${getStdSettings().review_years}-yearly review: confirm, revise (creates a work item) or withdraw.`} />
          <table className="crm-table">
            <thead>
              <tr>
                <th>Standard</th>
                <th>Published</th>
                <th>Review due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, due, years }) => (
                <tr key={entry.id}>
                  <td>
                    <Link className="crm-link crm-mono" to={`/standards/catalogue/${entry.id}`}>
                      {entry.ref}
                    </Link>
                    <span className="crm-small">{entry.title}</span>
                  </td>
                  <td>
                    {fmtDate(entry.published_at)} ({years} y)
                  </td>
                  <td>
                    {fmtDate(due)}
                    {new Date(due) < new Date() ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                  </td>
                  <td className="num">
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => setDlg({ id: entry.id, ref: entry.ref })}>
                      Record decision
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <Empty title="No reviews due" /> : null}
          {dlg ? (
            <ReasonDialog
              title={`Periodic review — ${dlg.ref}`}
              requires="reason"
              reasonLabel="TC decision and reason"
              fields={[{ key: "decision", label: "Decision", type: "select", required: true, options: [{ value: "confirm", label: "Confirm for another cycle" }, { value: "revise", label: "Revise (new work item)" }, { value: "withdraw", label: "Withdraw" }] }]}
              onClose={() => setDlg(null)}
              onSubmit={async (v) => {
                decideReview(dlg.id, v.payload?.decision as "confirm", v.reason ?? "", actor);
                setDlg(null);
                show("Review recorded.");
              }}
            />
          ) : null}
        </div>
      )}
    </Gate>
  );
}

export function StdSettingsView() {
  const res = useDomain(() => getStdSettings(), []);
  return (
    <Gate res={res} what="Settings">
      {(s) => (
        <ModuleSettings<Record<string, number>>
          title="Standards settings"
          description="Comment and ballot periods, ballot rule, review cycle and SLAs. Provisional values need ESWASA confirmation."
          values={{ ...s }}
          fields={[
            { key: "comment_days", label: "Default public comment period (days)", type: "number", toConfirm: true },
            { key: "ballot_days", label: "Ballot period (days)", type: "number", toConfirm: true },
            { key: "approve_pct", label: "Approval threshold (% of approve + disapprove)", type: "number", toConfirm: true },
            { key: "max_disapprove_pct", label: "Maximum disapproval (% of votes cast)", type: "number", toConfirm: true },
            { key: "quorum_pct", label: "Quorum (% of eligible voters)", type: "number", toConfirm: true },
            { key: "review_years", label: "Periodic review cycle (years)", type: "number" },
            { key: "sla_resolution_days", label: "SLA: comment resolution (days)", type: "number" },
            { key: "sla_publication_days", label: "SLA: publication after approval (days)", type: "number" },
          ]}
          onSave={async (v) => void (await saveStdSettings(v as Partial<StandardsSettings>))}
          onReset={resetStandardsDemo}
        />
      )}
    </Gate>
  );
}
