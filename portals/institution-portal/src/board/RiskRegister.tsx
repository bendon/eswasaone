/**
 * Risk register (G10): inherent vs residual, appetite per category with R-G3 escalation, controls,
 * mitigations, review cadence, linked incidents, "add to pack".
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { CrmBanner, CrmDrawer, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  actOnRisk,
  addControl,
  addMitigation,
  getRisk,
  getSettings,
  linkIncident,
  listRisks,
  RISK_DEF,
  riskActions,
  riskScoreOf,
  saveRisk,
  setRiskInPack,
  toggleMitigation,
  type Risk,
  type RiskCategory,
} from "@eswasaone/shared-ui/governance";
import { DocumentsPanel, Facts, HistoryTimeline, RailCard, RecordPage } from "@eswasaone/shared-ui/record";
import { DEMO_STAFF } from "@eswasaone/shared-ui/tasks";
import { ActionBar } from "@eswasaone/shared-ui/workflow";
import { fmtDay, Gate, riskTone, useGov, useStaffActor, WfPill } from "./ui";

const CATS: RiskCategory[] = ["Strategic", "Financial", "Operational", "Compliance", "Reputational", "ICT"];

export function RiskRegisterView() {
  const res = useGov(async () => ({ risks: await listRisks(), settings: await getSettings() }));
  const [cell, setCell] = useState<{ l: number; i: number } | null>(null);
  const [open, setOpen] = useState<Risk | "new" | null>(null);
  const [basis, setBasis] = useState<"residual" | "inherent">("residual");
  return (
    <Gate res={res} what="Risk register">
      {({ risks, settings }) => {
        const live = risks.filter((r) => r.state !== "Closed");
        const rows = cell ? live.filter((r) => r[basis].l === cell.l && r[basis].i === cell.i) : risks;
        return (
          <div className="crm-stack">
            <div className="crm-row">
              <div className="crm-seg">
                <button type="button" className={basis === "residual" ? "on" : ""} onClick={() => setBasis("residual")}>
                  Residual
                </button>
                <button type="button" className={basis === "inherent" ? "on" : ""} onClick={() => setBasis("inherent")}>
                  Inherent
                </button>
              </div>
              {cell ? (
                <button type="button" className="crm-link" onClick={() => setCell(null)}>
                  Clear heat-map filter
                </button>
              ) : null}
              <span className="crm-spacer" />
              <button type="button" className="crm-btn crm-btn--gold" onClick={() => setOpen("new")}>
                <Icon name="i-plus" /> Log risk
              </button>
            </div>
            <div className="crm-grid crm-grid--main">
              <div className="crm-card crm-card--flush">
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Risk</th>
                        <th>Owner</th>
                        <th className="num">Inherent</th>
                        <th className="num">Residual</th>
                        <th>Appetite</th>
                        <th>Review</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const res = riskScoreOf(r.residual);
                        const app = settings.appetite[r.category];
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link to={`/board/risks/${r.id}`}>
                                <b>{r.title}</b>
                              </Link>
                              <span className="crm-small">
                                {r.id} · {r.category}
                                {r.in_pack ? " · in next pack" : ""} · {r.trend}
                              </span>
                            </td>
                            <td>{r.owner}</td>
                            <td className="num">{riskScoreOf(r.inherent)}</td>
                            <td className="num">
                              <span className={`crm-pill crm-pill--${riskTone(res, app)}`}>{res}</span>
                            </td>
                            <td>{res > app ? <span className="crm-pill crm-pill--red">Above ({app})</span> : <span className="crm-small">Within ({app})</span>}</td>
                            <td>
                              {fmtDay(r.next_review)}
                              {new Date(r.next_review) < new Date() && r.state !== "Closed" ? <span className="crm-pill crm-pill--amber">Due</span> : null}
                            </td>
                            <td>
                              <WfPill def={RISK_DEF} state={r.state} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Heat map ({basis})</h3>
                  <p>Likelihood ↑ × impact →</p>
                </div>
                <div className="crm-heat" style={{ gridTemplateColumns: "24px repeat(5, 1fr)" }}>
                  {[5, 4, 3, 2, 1].map((l) => (
                    <HeatRow key={l} l={l} risks={live} basis={basis} cell={cell} onPick={setCell} />
                  ))}
                  <span />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className="crm-heat__h crm-heat__h--col" style={{ justifyContent: "center" }}>
                      {i}
                    </span>
                  ))}
                </div>
                <div className="crm-stack" style={{ marginTop: 14, gap: 6 }}>
                  <b style={{ fontSize: 13 }}>Appetite by category</b>
                  {CATS.map((c) => (
                    <span key={c} className="crm-small">
                      {c}: max residual {settings.appetite[c]} · {live.filter((r) => r.category === c && riskScoreOf(r.residual) > settings.appetite[c]).length} above
                    </span>
                  ))}
                  <Link className="crm-link" to="/board/settings">
                    Edit appetite
                  </Link>
                </div>
              </div>
            </div>
            {open ? <RiskForm risk={open === "new" ? null : open} onClose={() => setOpen(null)} /> : null}
          </div>
        );
      }}
    </Gate>
  );
}

function HeatRow({ l, risks, basis, cell, onPick }: { l: number; risks: Risk[]; basis: "residual" | "inherent"; cell: { l: number; i: number } | null; onPick: (c: { l: number; i: number }) => void }) {
  return (
    <>
      <span className="crm-heat__h">{l}</span>
      {[1, 2, 3, 4, 5].map((i) => {
        const n = risks.filter((r) => r[basis].l === l && r[basis].i === i).length;
        const score = l * i;
        const bg = score >= 15 ? "var(--red-l)" : score >= 10 ? "var(--amber-l)" : score >= 5 ? "var(--navy-l)" : "var(--green-l)";
        const on = cell?.l === l && cell?.i === i;
        return (
          <button key={i} type="button" className="crm-heat__c" style={{ background: bg, border: on ? "2px solid var(--navy)" : 0, cursor: n ? "pointer" : "default", font: "inherit", fontWeight: 800 }} onClick={() => n && onPick({ l, i })} aria-label={`Likelihood ${l}, impact ${i}: ${n} risks`}>
            {n || ""}
          </button>
        );
      })}
    </>
  );
}

function Scale({ label, v, onChange }: { label: string; v: number; onChange: (n: number) => void }) {
  return (
    <label className="crm-field">
      {label}: {v}
      <input type="range" min={1} max={5} value={v} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function RiskForm({ risk, onClose }: { risk: Risk | null; onClose: () => void }) {
  const actor = useStaffActor();
  const [toast, show] = useCrmToast();
  const [f, setF] = useState({
    title: risk?.title ?? "",
    description: risk?.description ?? "",
    category: (risk?.category ?? "Operational") as RiskCategory,
    owner: risk?.owner ?? "Lungile Mkhabela",
    inherent: risk?.inherent ?? { l: 3, i: 3 },
    residual: risk?.residual ?? { l: 2, i: 3 },
    review_every_days: risk?.review_every_days ?? 90,
  });
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {toast}
      <CrmDrawer
        open
        title={risk ? `Edit ${risk.id}` : "Log risk"}
        subtitle="If residual exceeds the category appetite, R-G3 raises an alert and flags it for the next pack."
        onClose={onClose}
        footer={
          <>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--pri"
              onClick={() =>
                void saveRisk({ ...(risk ?? {}), ...f, id: risk?.id }, actor)
                  .then(() => (show("Saved."), onClose()))
                  .catch((e: Error) => setErr(e.message))
              }
            >
              Save
            </button>
          </>
        }
      >
        <div className="crm-form">
          <label className="crm-field">
            Title
            <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="crm-field">
            Description
            <textarea className="crm-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <div className="crm-form crm-form--2">
            <label className="crm-field">
              Category
              <select className="crm-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as RiskCategory })}>
                {CATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="crm-field">
              Owner
              <select className="crm-select" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
                {DEMO_STAFF.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <b style={{ fontSize: 13 }}>Inherent (before controls) — {f.inherent.l * f.inherent.i}</b>
          <div className="crm-form crm-form--2">
            <Scale label="Likelihood" v={f.inherent.l} onChange={(l) => setF({ ...f, inherent: { ...f.inherent, l } })} />
            <Scale label="Impact" v={f.inherent.i} onChange={(i) => setF({ ...f, inherent: { ...f.inherent, i } })} />
          </div>
          <b style={{ fontSize: 13 }}>Residual (after controls) — {f.residual.l * f.residual.i}</b>
          <div className="crm-form crm-form--2">
            <Scale label="Likelihood" v={f.residual.l} onChange={(l) => setF({ ...f, residual: { ...f.residual, l } })} />
            <Scale label="Impact" v={f.residual.i} onChange={(i) => setF({ ...f, residual: { ...f.residual, i } })} />
          </div>
          <label className="crm-field">
            Review every (days)
            <input className="crm-input" type="number" min={7} value={f.review_every_days} onChange={(e) => setF({ ...f, review_every_days: Number(e.target.value) })} />
          </label>
          {err ? <p className="eo-error">{err}</p> : null}
        </div>
      </CrmDrawer>
    </>
  );
}

export function RiskRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const res = useGov(() => getRisk(id), [id]);
  const [toast, show] = useCrmToast();
  const [edit, setEdit] = useState(false);
  const [m, setM] = useState({ action: "", owner: DEMO_STAFF[0].name, due: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) });
  const [ctl, setCtl] = useState("");
  const [lnk, setLnk] = useState({ kind: "case" as Risk["links"][number]["kind"], ref: "", label: "" });
  return (
    <Gate res={res} what="Risk">
      {({ risk: r, appetite }) => {
        const inh = riskScoreOf(r.inherent);
        const resd = riskScoreOf(r.residual);
        const above = resd > appetite && r.state !== "Closed";
        return (
          <>
            {toast}
            <RecordPage
              back={{ to: "/board/risks", label: "Risk register" }}
              reference={r.id}
              type={`${r.category} risk`}
              title={r.title}
              state={r.state}
              tone={RISK_DEF.states.find((s) => s.id === r.state)?.tone}
              chips={above ? <span className="crm-pill crm-pill--red">Above appetite</span> : null}
              actions={
                <>
                  <button type="button" className="crm-btn" onClick={() => setEdit(true)}>
                    Edit ratings
                  </button>
                  <button type="button" className="crm-btn" onClick={() => void setRiskInPack(r.id, !r.in_pack, actor).then(() => show(r.in_pack ? "Removed from the next pack." : "Added to the next pack."))}>
                    {r.in_pack ? "Remove from pack" : "Add to pack"}
                  </button>
                  <ActionBar
                    actions={riskActions(r.id, actor)}
                    state={r.state}
                    onAct={async (a, input) => {
                      await actOnRisk(r.id, a.action, actor, input);
                      show(`${a.label}: done.`);
                    }}
                  />
                </>
              }
              banner={above ? <CrmBanner tone="err">Residual {resd} is above the {r.category} appetite of {appetite}. R-G3 has raised an alert to the Risk Officer and flagged this risk for the next Board pack.</CrmBanner> : null}
              summary={
                <div className="crm-stack">
                  {r.description ? <p style={{ margin: 0 }}>{r.description}</p> : null}
                  <div>
                    <div className="crm-row crm-small" style={{ justifyContent: "space-between" }}>
                      <span>0</span>
                      <span>Appetite {appetite}</span>
                      <span>25</span>
                    </div>
                    <div className="eo-appetite" aria-label={`Inherent ${inh}, residual ${resd}, appetite ${appetite}`}>
                      <span className="eo-appetite__mark" style={{ left: `${(appetite / 25) * 100}%` }} />
                      <span className="eo-appetite__dot inh" style={{ left: `${(inh / 25) * 100}%` }} title={`Inherent ${inh}`} />
                      <span className="eo-appetite__dot res" style={{ left: `${(resd / 25) * 100}%` }} title={`Residual ${resd}`} />
                    </div>
                    <div className="crm-row crm-small" style={{ marginTop: 8 }}>
                      <span>● grey = inherent {inh} (L{r.inherent.l}×I{r.inherent.i})</span>
                      <span>● navy = residual {resd} (L{r.residual.l}×I{r.residual.i})</span>
                      <span>Trend: {r.trend}</span>
                    </div>
                  </div>
                </div>
              }
              tabs={[
                {
                  id: "controls",
                  label: "Controls & mitigation",
                  badge: r.mitigations.filter((x) => !x.done_at).length,
                  render: () => (
                    <div className="crm-stack">
                      <div>
                        <b>Existing controls</b>
                        <ul>{r.controls.map((c) => <li key={c}>{c}</li>)}</ul>
                        <div className="crm-row">
                          <input className="crm-input" style={{ flex: 1 }} value={ctl} onChange={(e) => setCtl(e.target.value)} placeholder="Add a control" />
                          <button type="button" className="crm-btn crm-btn--sm" disabled={!ctl.trim()} onClick={() => void addControl(r.id, ctl, actor).then(() => setCtl(""))}>
                            Add
                          </button>
                        </div>
                      </div>
                      <div>
                        <b>Mitigation actions</b>
                        {r.mitigations.map((x) => (
                          <label key={x.id} className="crm-check" style={{ margin: "8px 0" }}>
                            <input type="checkbox" checked={Boolean(x.done_at)} onChange={() => void toggleMitigation(r.id, x.id, actor)} />
                            <span>
                              {x.action}
                              <span className="crm-small" style={{ display: "block" }}>
                                {x.owner} · due {fmtDay(x.due)}
                                {x.done_at ? ` · done ${fmtDay(x.done_at)}` : new Date(x.due) < new Date() ? " · overdue" : ""}
                              </span>
                            </span>
                          </label>
                        ))}
                        <div className="crm-row">
                          <input className="crm-input" style={{ flex: 2 }} value={m.action} onChange={(e) => setM({ ...m, action: e.target.value })} placeholder="Mitigation action" />
                          <select className="crm-select" style={{ flex: 1 }} value={m.owner} onChange={(e) => setM({ ...m, owner: e.target.value })}>
                            {DEMO_STAFF.map((s) => (
                              <option key={s.name}>{s.name}</option>
                            ))}
                          </select>
                          <input className="crm-input" style={{ width: 150 }} type="date" value={m.due} onChange={(e) => setM({ ...m, due: e.target.value })} />
                          <button type="button" className="crm-btn crm-btn--sm" disabled={!m.action.trim()} onClick={() => void addMitigation(r.id, m, actor).then(() => setM({ ...m, action: "" }))}>
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  id: "reviews",
                  label: "Reviews",
                  badge: r.reviews.length,
                  render: () =>
                    r.reviews.length ? (
                      <ul className="eo-notes">
                        {[...r.reviews].reverse().map((v) => (
                          <li key={v.at} className="eo-note">
                            <div>
                              <b>
                                {fmtDay(v.at)} · {v.by} · residual {riskScoreOf(v.residual)}
                              </b>
                              <p>{v.note}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="crm-muted">No reviews yet. Start a review from the action bar.</p>
                    ),
                },
                {
                  id: "links",
                  label: "Linked incidents",
                  badge: r.links.length,
                  render: () => (
                    <div className="crm-stack">
                      {r.links.map((l) => (
                        <p key={l.ref} style={{ margin: 0 }}>
                          <span className="crm-pill crm-pill--outline">{l.kind}</span>{" "}
                          {l.kind === "case" ? <Link to={`/crm/cases/${l.ref}`}>{l.ref}</Link> : <b>{l.ref}</b>} — {l.label}
                        </p>
                      ))}
                      <div className="crm-row">
                        <select className="crm-select" style={{ width: "auto" }} value={lnk.kind} onChange={(e) => setLnk({ ...lnk, kind: e.target.value as typeof lnk.kind })}>
                          {["case", "tbt", "sample", "audit", "incident"].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                        <input className="crm-input" style={{ width: 140 }} value={lnk.ref} onChange={(e) => setLnk({ ...lnk, ref: e.target.value })} placeholder="Reference" />
                        <input className="crm-input" style={{ flex: 1 }} value={lnk.label} onChange={(e) => setLnk({ ...lnk, label: e.target.value })} placeholder="What happened" />
                        <button type="button" className="crm-btn crm-btn--sm" disabled={!lnk.ref.trim()} onClick={() => void linkIncident(r.id, lnk, actor).then(() => setLnk({ ...lnk, ref: "", label: "" }))}>
                          Link
                        </button>
                      </div>
                    </div>
                  ),
                },
                { id: "docs", label: "Evidence", render: () => <DocumentsPanel doctype="Governance Risk" name={r.id} by={actor.name} categories={["Evidence", "Papers", "Other"]} /> },
                { id: "history", label: "History", render: () => <HistoryTimeline events={r.history} /> },
              ]}
              rail={
                <RailCard title="Facts">
                  <Facts
                    rows={[
                      { label: "Owner", value: r.owner },
                      { label: "Category", value: r.category },
                      { label: "Appetite", value: String(appetite) },
                      { label: "Review every", value: `${r.review_every_days} days` },
                      { label: "Next review", value: fmtDay(r.next_review) },
                      { label: "In next pack", value: r.in_pack ? "Yes" : "No" },
                    ]}
                  />
                </RailCard>
              }
            />
            {edit ? <RiskForm risk={r} onClose={() => setEdit(false)} /> : null}
          </>
        );
      }}
    </Gate>
  );
}
