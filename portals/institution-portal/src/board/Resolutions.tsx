/**
 * Resolutions (G5, G8): register + action tracker, resolution record page with votes and R-G2 actions,
 * and circulation of written resolutions.
 */
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { CrmBanner, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  ACTION_DEF,
  actOnAction,
  actOnResolution,
  actionActionsFor,
  addAction,
  circulateWritten,
  getResolution,
  listActions,
  listBodies,
  listResolutions,
  RESOLUTION_DEF,
  resolutionActions,
  setCarryToPack,
  tally,
  updateActionProgress,
  type ResAction,
} from "@eswasaone/shared-ui/governance";
import { DocumentsPanel, Facts, HistoryTimeline, RailCard, RecordPage } from "@eswasaone/shared-ui/record";
import { DEMO_STAFF } from "@eswasaone/shared-ui/tasks";
import { ActionBar, ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { Bar, fmtDay, fmtDayTime, Gate, useGov, useStaffActor, VOTE_LABEL, WfPill } from "./ui";

export function ResolutionsView() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "all";
  const res = useGov(async () => ({ resolutions: await listResolutions(), actions: await listActions() }));
  return (
    <Gate res={res} what="Resolutions">
      {({ resolutions, actions }) => (
        <div className="crm-stack">
          <div className="crm-row">
            <div className="crm-seg">
              {[
                ["all", `Register (${resolutions.length})`],
                ["written", `Written (${resolutions.filter((r) => r.kind === "written").length})`],
                ["actions", `Action tracker (${actions.filter((a) => a.state === "Open").length} open)`],
              ].map(([id, label]) => (
                <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setParams({ tab: id })}>
                  {label}
                </button>
              ))}
            </div>
            <span className="crm-spacer" />
            <Link to="/board/resolutions/written/new" className="crm-btn crm-btn--gold">
              <Icon name="i-send" /> Circulate written resolution
            </Link>
          </div>
          {tab === "actions" ? (
            <ActionTracker actions={actions} />
          ) : (
            <div className="crm-card crm-card--flush">
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Resolution</th>
                      <th>Body / meeting</th>
                      <th>Votes</th>
                      <th>State</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolutions
                      .filter((r) => tab !== "written" || r.kind === "written")
                      .map((r) => {
                        const t = tally(r);
                        const acts = actions.filter((a) => a.resolution_id === r.id);
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link to={`/board/resolutions/${r.id}`}>
                                <b>{r.title}</b>
                              </Link>
                              <span className="crm-small crm-mono">
                                {r.id} · {r.kind === "written" ? "written" : "in meeting"}
                              </span>
                            </td>
                            <td>
                              {r.body_id}
                              {r.meeting_id ? <span className="crm-small">{r.meeting_id}</span> : r.window ? <span className="crm-small">closes {fmtDayTime(r.window.closes)}</span> : null}
                            </td>
                            <td>{t.cast || t.recused ? `${t.for}–${t.against}–${t.abstain}${t.recused ? ` (${t.recused} recused)` : ""}` : "—"}</td>
                            <td>
                              <WfPill def={RESOLUTION_DEF} state={r.state} />
                            </td>
                            <td>{acts.length ? `${acts.filter((a) => a.state === "Completed").length}/${acts.length} done` : "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Gate>
  );
}

function ActionTracker({ actions }: { actions: ResAction[] }) {
  const actor = useStaffActor();
  const [upd, setUpd] = useState<ResAction | null>(null);
  const [filter, setFilter] = useState<"open" | "overdue" | "mine" | "all">("open");
  const rows = actions.filter((a) => (filter === "all" ? true : filter === "open" ? a.state === "Open" : filter === "overdue" ? a.state === "Open" && new Date(a.due) < new Date() : a.owner === actor.name));
  return (
    <div className="crm-card crm-card--flush">
      <div className="crm-card__h">
        <div className="crm-seg">
          {(["open", "overdue", "mine", "all"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "mine" ? "Mine" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Progress</th>
              <th>In pack</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const late = a.state === "Open" && new Date(a.due) < new Date();
              return (
                <tr key={a.id}>
                  <td>
                    <b>{a.description}</b>
                    <span className="crm-small">
                      <Link to={`/board/resolutions/${a.resolution_id}`}>{a.resolution_id}</Link> · <WfPill def={ACTION_DEF} state={a.state} />
                    </span>
                  </td>
                  <td>{a.owner}</td>
                  <td>
                    {fmtDay(a.due)} {late ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <Bar pct={a.progress} tone={a.progress >= 100 ? "green" : late ? "red" : "navy"} />
                    <span className="crm-small">{a.progress}%</span>
                  </td>
                  <td>
                    <input type="checkbox" checked={a.carry_to_pack} onChange={(e) => void setCarryToPack(a.id, e.target.checked)} aria-label="Carry to next pack" />
                  </td>
                  <td className="num">
                    {a.state === "Open" ? (
                      <button type="button" className="crm-link" onClick={() => setUpd(a)}>
                        Update
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {upd ? <ActionUpdate a={upd} onClose={() => setUpd(null)} /> : null}
    </div>
  );
}

function ActionUpdate({ a, onClose }: { a: ResAction; onClose: () => void }) {
  const actor = useStaffActor();
  const [p, setP] = useState(a.progress);
  const [file, setFile] = useState("");
  const complete = actionActionsFor(a.id, actor).find((x) => x.action === "complete");
  return (
    <ReasonDialog
      title={`Update: ${a.description}`}
      consequence="Progress updates show in the tracker and the next pack. Completing needs an evidence note."
      reasonLabel="Update note"
      confirmLabel={p >= 100 && complete ? "Complete with evidence" : "Save update"}
      requires={p >= 100 ? "note" : undefined}
      onClose={onClose}
      onSubmit={async (v) => {
        await updateActionProgress(a.id, p, v.note ?? "", actor, file || undefined);
        if (p >= 100 && complete) await actOnAction(a.id, "complete", actor, { expected_state: a.state, note: v.note });
        onClose();
      }}
    >
      <label className="crm-field">
        Progress: {p}%
        <input type="range" min={0} max={100} step={5} value={p} onChange={(e) => setP(Number(e.target.value))} />
      </label>
      <label className="crm-field">
        Evidence (file name, optional)
        <input className="crm-input" type="file" onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")} />
      </label>
    </ReasonDialog>
  );
}

export function ResolutionRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const res = useGov(() => getResolution(id), [id]);
  const [toast, show] = useCrmToast();
  const [adding, setAdding] = useState(false);
  return (
    <Gate res={res} what="Resolution">
      {({ resolution: r, actions, meeting, body }) => {
        const t = tally(r);
        const acts = resolutionActions(r.id, actor);
        const voters = r.window?.eligible ?? body.members;
        return (
          <>
            {toast}
            <RecordPage
              back={{ to: "/board/resolutions", label: "Resolutions" }}
              reference={r.id}
              type={r.kind === "written" ? "Written resolution" : "Resolution"}
              title={r.title}
              state={r.state}
              tone={RESOLUTION_DEF.states.find((s) => s.id === r.state)?.tone}
              actions={
                <>
                  <Link className="crm-btn" to={`/print/resolution/${r.id}`} target="_blank">
                    <Icon name="i-download" /> Print
                  </Link>
                  <ActionBar
                    actions={acts}
                    state={r.state}
                    onAct={async (a, input) => {
                      await actOnResolution(r.id, a.action, actor, input);
                      show(`${a.label}: done.`);
                    }}
                  />
                </>
              }
              banner={
                r.state === "Circulated" && r.window ? (
                  <CrmBanner tone="info">
                    Voting open until {fmtDayTime(r.window.closes)}. {t.cast} of {r.window.eligible.length} voted. Needed: {t.needed}. It closes itself — Passed if the threshold is met, otherwise Lapsed.
                  </CrmBanner>
                ) : null
              }
              summary={<p style={{ margin: 0, lineHeight: 1.6, fontSize: 14.5 }}>{r.text}</p>}
              tabs={[
                {
                  id: "votes",
                  label: "Votes",
                  render: () => (
                    <div className="crm-stack">
                      <div className="crm-row">
                        <span className="crm-pill crm-pill--green">{t.for} for</span>
                        <span className="crm-pill crm-pill--red">{t.against} against</span>
                        <span className="crm-pill crm-pill--slate">{t.abstain} abstain</span>
                        {t.recused ? <span className="crm-pill crm-pill--purple">{t.recused} recused</span> : null}
                      </div>
                      <table className="crm-table">
                        <tbody>
                          {voters.map((n) => (
                            <tr key={n}>
                              <td>{n}</td>
                              <td>{r.votes[n] ? VOTE_LABEL[r.votes[n]] : <span className="crm-muted">{r.state === "Circulated" ? "Not voted yet" : "—"}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ),
                },
                {
                  id: "actions",
                  label: "Actions",
                  badge: actions.filter((a) => a.state === "Open").length,
                  render: () => (
                    <div className="crm-stack">
                      {["Passed", "Implemented"].includes(r.state) ? (
                        <button type="button" className="crm-btn crm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>
                          <Icon name="i-plus" /> Add action (R-G2)
                        </button>
                      ) : (
                        <p className="crm-small">Actions are created once the resolution passes (R-G2).</p>
                      )}
                      {actions.map((a) => (
                        <div key={a.id} className="crm-card">
                          <div className="crm-row">
                            <b style={{ flex: 1 }}>{a.description}</b>
                            <WfPill def={ACTION_DEF} state={a.state} />
                          </div>
                          <span className="crm-small">
                            {a.owner} · due {fmtDay(a.due)} · {a.progress}%
                          </span>
                          <Bar pct={a.progress} tone={a.state === "Completed" ? "green" : "navy"} />
                          {a.updates.length ? <p className="crm-small">Latest: {a.updates[a.updates.length - 1].text}</p> : null}
                          {a.evidence.length ? <p className="crm-small">Evidence: {a.evidence.join(", ")}</p> : null}
                          <ActionBar
                            size="sm"
                            actions={actionActionsFor(a.id, actor)}
                            state={a.state}
                            onAct={async (x, input) => {
                              await actOnAction(a.id, x.action, actor, input);
                              show(`${x.label}: done.`);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ),
                },
                { id: "docs", label: "Papers", render: () => <DocumentsPanel doctype="Board Resolution" name={r.id} by={actor.name} categories={["Papers", "Evidence", "Other"]} /> },
                { id: "history", label: "History", render: () => <HistoryTimeline events={r.history} /> },
              ]}
              rail={
                <RailCard title="Facts">
                  <Facts
                    rows={[
                      { label: "Body", value: body.name },
                      { label: "Meeting", value: meeting ? <Link to={`/board/meetings/${meeting.id}`}>{meeting.title}</Link> : r.kind === "written" ? "Written (no meeting)" : "—" },
                      { label: "Proposed by", value: r.proposed_by },
                      { label: "Proposed", value: fmtDay(r.proposed_at) },
                      { label: "Decided", value: fmtDay(r.decided_at) },
                      { label: "Implemented", value: fmtDay(r.implemented_at) },
                      ...(r.window ? [{ label: "Threshold", value: t.needed }] : []),
                    ]}
                  />
                </RailCard>
              }
            />
            {adding ? <AddActionDialog resolutionId={r.id} onClose={() => setAdding(false)} onDone={() => (setAdding(false), show("Action added — owner has a task."))} /> : null}
          </>
        );
      }}
    </Gate>
  );
}

function AddActionDialog({ resolutionId, onClose, onDone }: { resolutionId: string; onClose: () => void; onDone: () => void }) {
  const actor = useStaffActor();
  const [f, setF] = useState({ description: "", owner: DEMO_STAFF[1].name, due: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) });
  return (
    <ReasonDialog
      title="Add action"
      rule="R-G2"
      consequence="Creates an action with an owner and due date; the owner gets an Approvals task."
      confirmLabel="Add action"
      canSubmit={Boolean(f.description.trim())}
      onClose={onClose}
      onSubmit={async () => {
        await addAction(resolutionId, { ...f, due: new Date(f.due).toISOString() }, actor);
        onDone();
      }}
    >
      <label className="crm-field">
        Action
        <input className="crm-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="crm-form crm-form--2">
        <label className="crm-field">
          Owner
          <select className="crm-select" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
            {DEMO_STAFF.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          Due
          <input className="crm-input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </label>
      </div>
    </ReasonDialog>
  );
}

export function WrittenResolutionNewPage() {
  const actor = useStaffActor();
  const nav = useNavigate();
  const res = useGov(() => listBodies());
  const [f, setF] = useState({ title: "", text: "RESOLVED that ", body_id: "BOARD", closes: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), threshold: "simple" as "simple" | "two_thirds" | "unanimous", eligible: [] as string[], min_votes: 4, papers: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Gate res={res} what="Bodies">
      {(bodies) => {
        const body = bodies.find((b) => b.id === f.body_id)!;
        const eligible = f.eligible.length ? f.eligible : body.members;
        return (
          <div className="crm-grid crm-grid--main">
            <div className="crm-card">
              <Link to="/board/resolutions?tab=written" className="crm-ws__back">
                <Icon name="i-cleft" /> Resolutions
              </Link>
              <h2 style={{ margin: "6px 0 14px" }}>Circulate a written resolution</h2>
              <div className="crm-form">
                <label className="crm-field">
                  Body
                  <select className="crm-select" value={f.body_id} onChange={(e) => setF({ ...f, body_id: e.target.value, eligible: [] })}>
                    {bodies.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="crm-field">
                  Title
                  <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                </label>
                <label className="crm-field">
                  Resolution text
                  <textarea className="crm-textarea" style={{ minHeight: 140 }} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
                </label>
                <label className="crm-field">
                  Supporting papers (comma-separated)
                  <input className="crm-input" value={f.papers} onChange={(e) => setF({ ...f, papers: e.target.value })} />
                </label>
                <div className="crm-form crm-form--2">
                  <label className="crm-field">
                    Voting closes
                    <input className="crm-input" type="date" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} />
                  </label>
                  <label className="crm-field">
                    Pass threshold
                    <select className="crm-select" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value as typeof f.threshold })}>
                      <option value="simple">Simple majority</option>
                      <option value="two_thirds">Two-thirds</option>
                      <option value="unanimous">Unanimous</option>
                    </select>
                  </label>
                  <label className="crm-field">
                    Minimum votes cast
                    <input className="crm-input" type="number" min={1} max={eligible.length} value={f.min_votes} onChange={(e) => setF({ ...f, min_votes: Number(e.target.value) })} />
                  </label>
                </div>
                {err ? <p className="eo-error">{err}</p> : null}
                <button
                  type="button"
                  className="crm-btn crm-btn--pri"
                  onClick={() => {
                    setErr(null);
                    void circulateWritten({ title: f.title, text: f.text, body_id: f.body_id, closes: `${f.closes}T17:00:00`, threshold: f.threshold, eligible, min_votes: f.min_votes, papers: f.papers.split(",").map((x) => x.trim()).filter(Boolean) }, actor)
                      .then((r) => nav(`/board/resolutions/${r.id}`))
                      .catch((e: Error) => setErr(e.message));
                  }}
                >
                  <Icon name="i-send" /> Circulate to {eligible.length} members
                </button>
              </div>
            </div>
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Eligible voters</h3>
              </div>
              {body.members.map((n) => (
                <label key={n} className="crm-check" style={{ marginBottom: 6 }}>
                  <input type="checkbox" checked={eligible.includes(n)} onChange={(e) => setF({ ...f, eligible: e.target.checked ? [...eligible.filter((x) => x !== n), n] : eligible.filter((x) => x !== n) })} /> {n}
                </label>
              ))}
              <p className="crm-small">Members vote in their member area. The result is shown to them after the window closes.</p>
            </div>
          </div>
        );
      }}
    </Gate>
  );
}
