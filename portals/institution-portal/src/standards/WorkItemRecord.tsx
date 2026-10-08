/**
 * Work item record (gap 06 S4, S7–S10): Drafts (versions) · Comments (resolution workspace) · Ballot ·
 * Publication checklist · History, with the map transitions in the ActionBar. Also the ballot record.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { Facts, HistoryTimeline, RailCard, RecordPage, fmtDate } from "@eswasaone/shared-ui/record";
import {
  actOnWorkItem,
  closeBallotNow,
  clusterComments,
  DISPOSITION_LABEL,
  getBallot,
  getWorkItem,
  importWtoComments,
  notifyWto,
  publicationProblem,
  replyToCommenters,
  resolutionReport,
  savePublication,
  setDisposition,
  tallyBallot,
  uploadDraft,
  VOTE_LABEL,
  WI_DEF,
  wiActions,
  type CommentDisposition,
  type WorkItemBundle,
} from "@eswasaone/shared-ui/standards";
import { ReasonDialog, stateDef, type Actor } from "@eswasaone/shared-ui/workflow";
import { Acts, Empty, Gate, run, useDomain, useStaffActor, useToast } from "../domain/ui";

export function WorkItemRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const res = useDomain(() => getWorkItem(id), [id]);
  return <Gate res={res} what="Work item">{(b) => <Wi b={b} actor={actor} show={show} toast={toast} />}</Gate>;
}

function Wi({ b, actor, show, toast }: { b: WorkItemBundle; actor: Actor; show: (m: string) => void; toast: React.ReactNode }) {
  const w = b.wi;
  const [upload, setUpload] = useState(false);
  const [period, setPeriod] = useState<null | "open_comment" | "open_ballot">(null);
  const acts = wiActions(w.id, actor);
  const pending = b.comments.filter((c) => !c.disposition).length;
  return (
    <>
      {toast}
      <RecordPage
        back={{ to: "/standards/workitems", label: "Work programme" }}
        reference={w.ref}
        type={`${w.type === "adoption" ? `Adoption (${w.adoption?.degree}) of ${w.adoption?.ref}` : w.type} · ${b.tc?.number}`}
        title={w.title}
        state={stateDef(WI_DEF, w.state)?.label}
        tone={stateDef(WI_DEF, w.state)?.tone}
        chips={w.comment_period && w.state === "Public Review" ? <span className="crm-sla crm-sla--due">Comments close {fmtDate(w.comment_period.closes)}</span> : null}
        actions={
          <>
            {acts
              .filter((a) => a.action === "open_comment" || a.action === "open_ballot")
              .map((a) => (
                <button key={a.action} type="button" className="crm-btn crm-btn--pri" disabled={Boolean(a.disabledReason)} title={a.disabledReason} onClick={() => setPeriod(a.action as "open_comment" | "open_ballot")}>
                  {a.label}
                </button>
              ))}
            <Acts actions={acts} hide={["open_comment", "open_ballot"]} state={w.state} toast={show} act={(a, input) => actOnWorkItem(w.id, a.action, actor, input)} />
          </>
        }
        summary={<Facts rows={[{ label: "Scope", value: w.scope }, { label: "Committee", value: b.tc ? <Link className="crm-link" to={`/standards/committees/${b.tc.id}`}>{b.tc.number} {b.tc.name}</Link> : w.tc_id }, { label: "Project leader", value: w.project_leader }, { label: "Revises", value: b.revises ? `${b.revises.ref} (${b.revises.status})` : undefined }, { label: "From proposal", value: b.proposal ? <Link className="crm-link" to={`/standards/proposals/${b.proposal.id}`}>{b.proposal.id}</Link> : undefined }]} />}
        tabs={[
          {
            id: "drafts",
            label: "Drafts",
            badge: w.drafts.length,
            render: () => (
              <div className="crm-stack">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Stage</th>
                      <th>Change summary</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...w.drafts].reverse().map((d) => (
                      <tr key={d.id}>
                        <td>
                          <b>{d.label}</b> {d.locked ? <Icon name="i-lock" /> : null}
                          <span className="crm-small">{d.file}</span>
                        </td>
                        <td>{d.stage}</td>
                        <td>{d.summary}</td>
                        <td className="crm-small">
                          {d.uploaded_by} · {fmtDate(d.at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {w.drafts.length > 1 ? (
                  <p className="crm-small">
                    Compare: {w.drafts[w.drafts.length - 2].label} → {w.drafts[w.drafts.length - 1].label}: “{w.drafts[w.drafts.length - 1].summary}”
                  </p>
                ) : null}
                {!["Public Review", "Ballot", "Published", "Cancelled"].includes(w.state) ? (
                  <button type="button" className="crm-btn crm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setUpload(true)}>
                    <Icon name="i-plus" /> Upload new version
                  </button>
                ) : (
                  <p className="crm-small">Drafts are locked during public review and ballot.</p>
                )}
              </div>
            ),
          },
          { id: "comments", label: "Comments", badge: pending || b.comments.length, render: () => <CommentsWorkspace b={b} actor={actor} show={show} /> },
          { id: "tbt", label: "WTO TBT", badge: w.tbt ? w.tbt.imported || undefined : undefined, render: () => <TbtTab b={b} actor={actor} show={show} /> },
          {
            id: "ballot",
            label: "Ballot",
            render: () =>
              b.ballot ? (
                <BallotSummary id={b.ballot.id} />
              ) : (
                <p className="crm-muted">No ballot yet. It opens after comment resolution.</p>
              ),
          },
          { id: "publication", label: "Publication", render: () => <PublicationTab b={b} actor={actor} show={show} /> },
          { id: "history", label: "History", render: () => <HistoryTimeline events={w.history} /> },
        ]}
        rail={
          <>
            <RailCard title="Target dates">
              <Facts rows={Object.entries(w.targets).map(([k, v]) => ({ label: k, value: <span style={{ color: new Date(v!) < new Date() && w.state === k ? "var(--red)" : undefined }}>{fmtDate(v)}</span> }))} />
            </RailCard>
            {b.catalogue ? (
              <RailCard title="Published">
                <p className="crm-small">
                  {b.catalogue.ref} · E {b.catalogue.price} · {b.catalogue.compulsory ? `compulsory (${b.catalogue.compulsory.regulation})` : "voluntary"}
                </p>
              </RailCard>
            ) : null}
          </>
        }
      />
      {upload ? (
        <ReasonDialog
          title="Upload draft version"
          reasonLabel="Change summary"
          requires="note"
          fields={[{ key: "label", label: "Version label (e.g. WD2, CD2)", required: true }, { key: "file", label: "File name" }, { key: "pages", label: "Pages", type: "number" }]}
          onClose={() => setUpload(false)}
          onSubmit={async (v) => {
            uploadDraft(w.id, { label: v.payload?.label ?? "", file: v.payload?.file ?? "", summary: v.note ?? "", pages: Number(v.payload?.pages) || undefined }, actor);
            setUpload(false);
            show("Version uploaded.");
          }}
        />
      ) : null}
      {period ? (
        <ReasonDialog
          title={period === "open_comment" ? "Open public comment" : "Open ballot"}
          consequence={acts.find((a) => a.action === period)?.consequence}
          rule={period === "open_comment" ? "R-S2" : undefined}
          fields={[{ key: "days", label: period === "open_comment" ? "Comment period (days, typically 60 — to confirm)" : "Ballot period (days)", type: "number", required: true }]}
          onClose={() => setPeriod(null)}
          onSubmit={async (v) => {
            await actOnWorkItem(w.id, period, actor, { expected_state: w.state, payload: v.payload, note: v.note });
            setPeriod(null);
            show(period === "open_comment" ? "Open for comment on the Service portal." : "Ballot open — voting members notified.");
          }}
        />
      ) : null}
    </>
  );
}

function CommentsWorkspace({ b, actor, show }: { b: WorkItemBundle; actor: Actor; show: (m: string) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [disp, setDisp] = useState<CommentDisposition>("accepted");
  const [resp, setResp] = useState("");
  const [report, setReport] = useState(false);
  const editable = b.wi.state === "Comment Resolution";
  const clusters = useMemo(() => (editable ? clusterComments(b.wi.id) : []), [b, editable]);
  if (!b.comments.length) return <Empty title="No comments yet">Comments arrive from the Service portal while the draft is in public review.</Empty>;
  return (
    <div className="crm-stack">
      {editable ? (
        <div className="crm-row" style={{ alignItems: "flex-end" }}>
          <label className="crm-field">
            Disposition for {sel.length} selected
            <select className="crm-select" value={disp} onChange={(e) => setDisp(e.target.value as CommentDisposition)}>
              {Object.entries(DISPOSITION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-field" style={{ flex: 1 }}>
            TC response
            <input className="crm-input" value={resp} onChange={(e) => setResp(e.target.value)} />
          </label>
          <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" disabled={!sel.length} onClick={() => void run(() => setDisposition(sel, disp, resp, actor), show, `${sel.length} comment(s): ${DISPOSITION_LABEL[disp]}`).then((ok) => ok && (setSel([]), setResp("")))}>
            Apply
          </button>
        </div>
      ) : null}
      {clusters.length ? (
        <div className="crm-card">
          <b>Assistant: suggested groupings</b> <span className="crm-small">(proposes only — the TC decides)</span>
          {clusters.map((c) => (
            <p key={c.clause} className="crm-small" style={{ margin: "4px 0" }}>
              Clause {c.clause}: {c.ids.length} comment(s) → {DISPOSITION_LABEL[c.suggestion]} — {c.why}{" "}
              <button type="button" className="crm-link" onClick={() => (setSel(c.ids), setDisp(c.suggestion))}>
                Select
              </button>
            </p>
          ))}
        </div>
      ) : null}
      <table className="crm-table">
        <thead>
          <tr>
            {editable ? <th /> : null}
            <th>Clause</th>
            <th>Comment</th>
            <th>From</th>
            <th>Disposition</th>
          </tr>
        </thead>
        <tbody>
          {b.comments.map((c) => (
            <tr key={c.id}>
              {editable ? (
                <td>
                  <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} aria-label={`Select ${c.id}`} />
                </td>
              ) : null}
              <td>
                <b>{c.clause}</b>
                <span className="crm-small">{c.type}</span>
              </td>
              <td>
                {c.comment}
                {c.proposed_change ? <span className="crm-small">Proposed: {c.proposed_change}</span> : null}
              </td>
              <td className="crm-small">{c.by.org || c.by.name}</td>
              <td>
                {c.disposition ? <span className={`crm-pill crm-pill--${c.disposition === "rejected" ? "red" : c.disposition === "noted" ? "slate" : "green"}`}>{DISPOSITION_LABEL[c.disposition]}</span> : <span className="crm-pill crm-pill--amber">Pending</span>}
                {c.response ? <span className="crm-small">{c.response}</span> : null}
                {c.replied_at ? <span className="crm-small">Replied {fmtDate(c.replied_at)}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="crm-row">
        <button type="button" className="crm-btn crm-btn--sm" onClick={() => setReport(true)}>
          <Icon name="i-file" /> Resolution report
        </button>
        <button type="button" className="crm-btn crm-btn--sm" disabled={!b.comments.some((c) => c.disposition && !c.replied_at)} onClick={() => void run(() => replyToCommenters(b.wi.id, actor), show, "Replies sent to commenters.")}>
          <Icon name="i-send" /> Reply to commenters
        </button>
      </div>
      {report ? (
        <ReasonDialog title="Comment resolution report" confirmLabel="Close" reasonLabel="Notes (not saved)" onClose={() => setReport(false)} onSubmit={async () => setReport(false)}>
          <pre className="eo-msgprev__body" style={{ maxHeight: 360, overflow: "auto" }}>
            {resolutionReport(b.wi.id)}
          </pre>
        </ReasonDialog>
      ) : null}
    </div>
  );
}

function PublicationTab({ b, actor, show }: { b: WorkItemBundle; actor: Actor; show: (m: string) => void }) {
  const p = b.wi.publication ?? {};
  const [v, setV] = useState({ final_text: Boolean(p.final_text), cover: Boolean(p.cover), ics: p.ics ?? "", price: String(p.price ?? ""), gazette_ref: p.gazette_ref ?? "", gazette_date: p.gazette_date ?? "", compulsory: Boolean(p.compulsory), regulation: p.regulation ?? "" });
  const editable = ["Approved", "Ballot", "Comment Resolution"].includes(b.wi.state);
  const problem = publicationProblem({ ...v, price: Number(v.price) });
  if (!editable && b.wi.state !== "Published") return <p className="crm-muted">The publication checklist opens once the ballot passes.</p>;
  return (
    <div className="crm-stack">
      <label className="crm-check">
        <input type="checkbox" disabled={!editable} checked={v.final_text} onChange={(e) => setV({ ...v, final_text: e.target.checked })} /> Final text checked against the approved draft
      </label>
      <label className="crm-check">
        <input type="checkbox" disabled={!editable} checked={v.cover} onChange={(e) => setV({ ...v, cover: e.target.checked })} /> Cover page, foreword and copyright notice
      </label>
      <div className="crm-grid crm-grid--2">
        <label className="crm-field">
          ICS code(s)
          <input className="crm-input" disabled={!editable} value={v.ics} onChange={(e) => setV({ ...v, ics: e.target.value })} />
        </label>
        <label className="crm-field">
          E-store price (E)
          <input className="crm-input" type="number" disabled={!editable} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        </label>
        <label className="crm-field">
          Gazette notice reference
          <input className="crm-input" disabled={!editable} value={v.gazette_ref} onChange={(e) => setV({ ...v, gazette_ref: e.target.value })} />
        </label>
        <label className="crm-field">
          Gazette date
          <input className="crm-input" type="date" disabled={!editable} value={v.gazette_date} onChange={(e) => setV({ ...v, gazette_date: e.target.value })} />
        </label>
      </div>
      <label className="crm-check">
        <input type="checkbox" disabled={!editable} checked={v.compulsory} onChange={(e) => setV({ ...v, compulsory: e.target.checked })} /> Compulsory standard (creates CRM signals for the sector on publication)
      </label>
      {v.compulsory ? (
        <label className="crm-field">
          Regulation
          <input className="crm-input" disabled={!editable} value={v.regulation} onChange={(e) => setV({ ...v, regulation: e.target.value })} />
        </label>
      ) : null}
      {editable ? (
        <div className="crm-row">
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void run(() => savePublication(b.wi.id, { ...v, price: Number(v.price) }, actor), show, "Checklist saved.")}>
            Save checklist
          </button>
          <span className={problem ? "eo-error" : "crm-small"}>{problem ?? "Ready — publish from the action bar (Head of Standards)."}</span>
        </div>
      ) : null}
    </div>
  );
}

function BallotSummary({ id }: { id: string }) {
  const res = useDomain(() => getBallot(id), [id]);
  return (
    <Gate res={res} what="Ballot">
      {({ ballot, tally }) => (
        <div className="crm-stack">
          <p>
            <Link className="crm-link" to={`/standards/ballots/${ballot.id}`}>
              {ballot.id}
            </Link>{" "}
            · {ballot.state} · closes {fmtDate(ballot.closes)} · {tally.cast}/{tally.eligible} voted · {tally.approvePct}% approve, {tally.disapprovePct}% disapprove
          </p>
        </div>
      )}
    </Gate>
  );
}

export function BallotRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const [toast, show] = useToast();
  const [close, setClose] = useState(false);
  const res = useDomain(() => getBallot(id), [id]);
  return (
    <Gate res={res} what="Ballot">
      {({ ballot, wi, tc }) => {
        const t = tallyBallot(ballot);
        return (
          <>
            {toast}
            <RecordPage
              back={{ to: "/standards/ballots", label: "Ballots" }}
              reference={ballot.id}
              type={`Ballot on ${ballot.draft_label}`}
              title={`${wi.ref} ${wi.title}`}
              state={ballot.state}
              tone={ballot.state === "Passed" ? "green" : ballot.state === "Failed" ? "red" : "gold"}
              actions={ballot.state === "Open" ? <button type="button" className="crm-btn" onClick={() => setClose(true)}>Close early</button> : null}
              summary={
                <Facts
                  rows={[
                    { label: "Window", value: `${fmtDate(ballot.opens)} → ${fmtDate(ballot.closes)}` },
                    { label: "Rule", value: `≥ ${ballot.rule.approve_pct}% of approve+disapprove, ≤ ${ballot.rule.max_disapprove_pct}% disapprove, quorum ${ballot.rule.quorum_pct}% (to confirm)` },
                    { label: "Tally", value: `${t.approve} approve · ${t.disapprove} disapprove · ${t.abstain} abstain — ${t.approvePct}% / ${t.disapprovePct}%; quorum ${t.quorum ? "met" : "not met"}; ${t.passes ? "would pass" : "would fail"}` },
                    { label: "Work item", value: <Link className="crm-link" to={`/standards/workitems/${wi.id}`}>{wi.ref}</Link> },
                  ]}
                />
              }
              tabs={[
                {
                  id: "votes",
                  label: "Votes",
                  render: () => (
                    <table className="crm-table">
                      <tbody>
                        {ballot.eligible.map((n) => {
                          const m = tc?.members.find((x) => x.name === n);
                          const v = ballot.votes[n];
                          return (
                            <tr key={n}>
                              <td>
                                <b>{n}</b>
                                <span className="crm-small">
                                  {m?.org} · {m?.category}
                                </span>
                              </td>
                              <td>{v ? VOTE_LABEL[v.vote] : <span className="crm-muted">Not voted</span>}</td>
                              <td className="crm-small">{v?.comment ?? ""}</td>
                              <td className="crm-small">{v ? fmtDate(v.at) : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ),
                },
              ]}
            />
            {close ? (
              <ReasonDialog
                title="Close ballot early"
                consequence="Tallies the votes cast so far against the rule."
                requires="reason"
                onClose={() => setClose(false)}
                onSubmit={async (v) => {
                  closeBallotNow(ballot.id, actor, v.reason ?? "");
                  setClose(false);
                  show("Ballot closed.");
                }}
              />
            ) : null}
          </>
        );
      }}
    </Gate>
  );
}

/** WTO TBT link (06 P3): notify a draft technical regulation and bring members' comments back in. */
function TbtTab({ b, actor, show }: { b: WorkItemBundle; actor: Actor; show: (m: string) => void }) {
  const w = b.wi;
  const [v, setV] = useState({ objective: "", products: w.scope, days: "60" });
  const [c, setC] = useState({ member: "", clause: "", comment: "", proposed_change: "" });
  if (!w.tbt) {
    const can = ["Committee Draft", "Public Review", "Comment Resolution"].includes(w.state);
    return (
      <div className="crm-stack">
        <p className="crm-muted" style={{ margin: 0 }}>
          If this standard will be made compulsory (a technical regulation) and may affect trade, Eswatini must notify the WTO TBT Committee while the draft can still change, and allow at least 60 days for comments.
        </p>
        {!can ? <p className="crm-small">Available from committee draft until comment resolution.</p> : null}
        <label className="crm-field">
          Objective and rationale
          <textarea className="crm-textarea" rows={2} disabled={!can} value={v.objective} onChange={(e) => setV({ ...v, objective: e.target.value })} placeholder="e.g. Protection of human health; consumer information" />
        </label>
        <div className="crm-grid crm-grid--2">
          <label className="crm-field">
            Products covered (HS codes if known)
            <input className="crm-input" disabled={!can} value={v.products} onChange={(e) => setV({ ...v, products: e.target.value })} />
          </label>
          <label className="crm-field">
            Comment period (days, minimum 60)
            <input className="crm-input" type="number" min={60} disabled={!can} value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} />
          </label>
        </div>
        <button type="button" className="crm-btn crm-btn--pri" style={{ alignSelf: "flex-start" }} disabled={!can} onClick={() => void run(() => notifyWto(w.id, { objective: v.objective, products: v.products, days: Number(v.days) }, actor), show, "Notification created — the TBT Officer has a task to transmit it.")}>
          Notify WTO (TBT)
        </button>
      </div>
    );
  }
  return (
    <div className="crm-stack">
      <Facts
        rows={[
          { label: "Symbol", value: w.tbt.symbol },
          { label: "Notified", value: `${fmtDate(w.tbt.notified_at)} by ${w.tbt.by}` },
          { label: "Objective", value: w.tbt.objective },
          { label: "Products", value: w.tbt.products },
          { label: "Comments until", value: fmtDate(w.tbt.comment_until) },
          { label: "Member comments imported", value: String(w.tbt.imported) },
        ]}
      />
      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Record a comment received from a WTO member</h3>
        </div>
        <div className="crm-grid crm-grid--2">
          <label className="crm-field">
            WTO member
            <input className="crm-input" value={c.member} onChange={(e) => setC({ ...c, member: e.target.value })} placeholder="e.g. South Africa" />
          </label>
          <label className="crm-field">
            Clause
            <input className="crm-input" value={c.clause} onChange={(e) => setC({ ...c, clause: e.target.value })} placeholder="e.g. 5.2 or General" />
          </label>
        </div>
        <label className="crm-field">
          Comment
          <textarea className="crm-textarea" rows={2} value={c.comment} onChange={(e) => setC({ ...c, comment: e.target.value })} />
        </label>
        <label className="crm-field">
          Proposed change (optional)
          <input className="crm-input" value={c.proposed_change} onChange={(e) => setC({ ...c, proposed_change: e.target.value })} />
        </label>
        <button
          type="button"
          className="crm-btn crm-btn--sm crm-btn--pri"
          style={{ marginTop: 8 }}
          onClick={() =>
            void run(() => importWtoComments(w.id, [c], actor), show, "Comment added to the Comments tab (source: WTO).").then((ok) => ok && setC({ member: "", clause: "", comment: "", proposed_change: "" }))
          }
        >
          Add to comments
        </button>
      </div>
    </div>
  );
}
