/**
 * Declarations register (G11), members with attendance analytics and board evaluation, governance
 * calendar with .ics export, and governance settings (G12: bodies, appetite, notice, statutory,
 * section templates, reset demo).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { CrmBanner, CrmDrawer, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  attendanceStats,
  calendarIcs,
  declarationsDue,
  evaluationResults,
  getSettings,
  governanceCalendar,
  listBodies,
  listDeclarations,
  listMembers,
  recordDeclaration,
  resetGovernanceDemo,
  saveBody,
  saveSettings,
  type Declaration,
  type GovBody,
  type GovSettings,
  type RiskCategory,
} from "@eswasaone/shared-ui/governance";
import { resetCrmDemo } from "@eswasaone/shared-ui/crm";
import { resetTasksDemo } from "@eswasaone/shared-ui/tasks";
import { ModuleSettings } from "@eswasaone/shared-ui/record";
import { Bar, fmtDay, Gate, useGov, useStaffActor } from "./ui";

export function DeclarationsView() {
  const actor = useStaffActor();
  const res = useGov(async () => ({ list: await listDeclarations(), due: declarationsDue(), members: await listMembers() }));
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"all" | Declaration["kind"]>("all");
  return (
    <Gate res={res} what="Declarations">
      {({ list, due, members }) => (
        <div className="crm-stack">
          {due.length ? (
            <CrmBanner>
              Annual declarations due from: <b>{due.map((d) => d.member).join(", ")}</b>. The CAC and Board recusals depend on these.
            </CrmBanner>
          ) : (
            <CrmBanner tone="ok">Every Board member has filed their annual declaration for {new Date().getFullYear()}.</CrmBanner>
          )}
          <div className="crm-row">
            <div className="crm-seg">
              {(["all", "annual", "meeting", "gift"] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {k === "all" ? "All" : k === "meeting" ? "Per meeting" : k === "gift" ? "Gifts & hospitality" : "Annual"}
                </button>
              ))}
            </div>
            <span className="crm-spacer" />
            <button type="button" className="crm-btn crm-btn--gold" onClick={() => setOpen(true)}>
              <Icon name="i-plus" /> Record declaration
            </button>
          </div>
          <div className="crm-card crm-card--flush">
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Type</th>
                    <th>Interest</th>
                    <th>For</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {list
                    .filter((d) => kind === "all" || d.kind === kind)
                    .map((d) => (
                      <tr key={d.id}>
                        <td>
                          <b>{d.member}</b>
                        </td>
                        <td>{d.kind === "meeting" ? "Per meeting" : d.kind === "gift" ? "Gift / hospitality" : `Annual ${d.period ?? ""}`}</td>
                        <td>
                          {d.interest}
                          {d.value ? <span className="crm-small">Value {d.value}</span> : null}
                        </td>
                        <td>{d.meeting_id ? <Link to={`/board/meetings/${d.meeting_id}`}>{d.meeting_id}</Link> : "—"}</td>
                        <td>
                          {fmtDay(d.at)}
                          <span className="crm-small">by {d.recorded_by}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          {open ? <DeclarationForm members={members.map((m) => m.name)} by={actor.name} onClose={() => setOpen(false)} /> : null}
        </div>
      )}
    </Gate>
  );
}

export function DeclarationForm({ members, by, onClose, fixedMember }: { members: string[]; by: string; onClose: () => void; fixedMember?: string }) {
  const [f, setF] = useState({ member: fixedMember ?? members[0] ?? "", kind: "annual" as Declaration["kind"], interest: "", value: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <CrmDrawer
      open
      title="Declaration of interest"
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
              void recordDeclaration({ member: f.member, kind: f.kind, period: f.kind === "annual" ? String(new Date().getFullYear()) : undefined, interest: f.interest || (f.kind === "annual" ? "None to declare." : ""), value: f.value || undefined, recorded_by: by })
                .then(onClose)
                .catch((e: Error) => setErr(e.message))
            }
          >
            File declaration
          </button>
        </>
      }
    >
      <div className="crm-form">
        {!fixedMember ? (
          <label className="crm-field">
            Member
            <select className="crm-select" value={f.member} onChange={(e) => setF({ ...f, member: e.target.value })}>
              {members.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="crm-field">
          Type
          <select className="crm-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Declaration["kind"] })}>
            <option value="annual">Annual declaration ({new Date().getFullYear()})</option>
            <option value="gift">Gift or hospitality</option>
          </select>
        </label>
        <label className="crm-field">
          Interests
          <textarea className="crm-textarea" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} placeholder="Directorships, shareholdings, employment, family interests in ESWASA clients or suppliers… or 'None to declare'." />
        </label>
        {f.kind === "gift" ? (
          <label className="crm-field">
            Approximate value
            <input className="crm-input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="E 0.00" />
          </label>
        ) : null}
        {err ? <p className="eo-error">{err}</p> : null}
      </div>
    </CrmDrawer>
  );
}

export function MembersView() {
  const res = useGov(async () => ({ members: await listMembers(), bodies: await listBodies(), att: await attendanceStats(), evals: await evaluationResults() }));
  return (
    <Gate res={res} what="Members">
      {({ members, bodies, att, evals }) => (
        <div className="crm-stack">
          <div className="crm-card crm-card--flush">
            <div className="crm-card__h">
              <h3>Members and terms</h3>
              <Link className="crm-link" to="/board/settings">
                Bodies & committees
              </Link>
            </div>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Bodies</th>
                    <th>Term</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const a = att.find((x) => x.member === m.name);
                    const ending = (new Date(m.term_end).getTime() - Date.now()) / 86_400_000 < 200;
                    return (
                      <tr key={m.name}>
                        <td>
                          <b>{m.name}</b>
                          <span className="crm-small">
                            {m.role} · {m.title}
                            {m.independent ? " · independent" : ""}
                          </span>
                        </td>
                        <td>{m.bodies.map((b) => bodies.find((x) => x.id === b)?.short ?? b).join(", ")}</td>
                        <td>
                          {fmtDay(m.term_start)} – {fmtDay(m.term_end)}
                          {ending ? <span className="crm-pill crm-pill--amber">Ends soon</span> : null}
                        </td>
                        <td style={{ minWidth: 140 }}>
                          {a ? (
                            <>
                              <Bar pct={a.rate} tone={a.rate < 75 ? "amber" : "green"} />
                              <span className="crm-small">
                                {a.present}/{a.invited} meetings ({a.rate}%)
                              </span>
                            </>
                          ) : (
                            <span className="crm-small">No meetings held yet</span>
                          )}
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
              <h3>Board evaluation {new Date().getFullYear()}</h3>
              <p>
                {evals.responses} of {evals.eligible} members responded. Members complete it in their member area.
              </p>
            </div>
            {evals.responses ? (
              <div className="crm-stack" style={{ gap: 8 }}>
                {evals.averages.map((a) => (
                  <div key={a.q}>
                    <div className="crm-row crm-small" style={{ justifyContent: "space-between" }}>
                      <span>{a.q}</span>
                      <b>{a.avg}/5</b>
                    </div>
                    <Bar pct={(a.avg / 5) * 100} tone={a.avg < 3 ? "amber" : "green"} />
                  </div>
                ))}
                {evals.comments.map((c, i) => (
                  <p key={i} className="crm-small">
                    “{c}”
                  </p>
                ))}
              </div>
            ) : (
              <p className="crm-muted">No responses yet.</p>
            )}
          </div>
        </div>
      )}
    </Gate>
  );
}

export function CalendarView() {
  const res = useGov(() => governanceCalendar());
  const [year, setYear] = useState(new Date().getFullYear());
  return (
    <Gate res={res} what="Calendar">
      {(entries) => {
        const months = Array.from({ length: 12 }, (_, i) => i);
        const now = new Date();
        return (
          <div className="crm-stack">
            <div className="crm-row">
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => setYear(year - 1)}>
                ←
              </button>
              <b>{year}</b>
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => setYear(year + 1)}>
                →
              </button>
              <span className="crm-spacer" />
              <span className="crm-small">
                <span className="eo-cal__e" style={{ display: "inline" }}>
                  Meeting
                </span>{" "}
                <span className="eo-cal__e statutory" style={{ display: "inline" }}>
                  Statutory
                </span>
              </span>
              <button
                type="button"
                className="crm-btn crm-btn--sm"
                onClick={() => {
                  const blob = new Blob([calendarIcs(entries)], { type: "text/calendar" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `eswasa-governance-${year}.ics`;
                  a.click();
                }}
              >
                <Icon name="i-download" /> Export .ics
              </button>
            </div>
            <div className="eo-cal">
              {months.map((mo) => {
                const rows = entries.filter((e) => {
                  const d = new Date(e.at);
                  return d.getFullYear() === year && d.getMonth() === mo;
                });
                return (
                  <div key={mo} className={`eo-cal__m${now.getFullYear() === year && now.getMonth() === mo ? " now" : ""}`}>
                    <h4>{new Date(year, mo, 1).toLocaleDateString(undefined, { month: "long" })}</h4>
                    {rows.map((e) =>
                      e.link ? (
                        <Link key={e.id} to={e.link} className={`eo-cal__e ${e.kind}${new Date(e.at) < now ? " past" : ""}`}>
                          {new Date(e.at).getDate()} · {e.title}
                        </Link>
                      ) : (
                        <span key={e.id} className={`eo-cal__e ${e.kind}${new Date(e.at) < now ? " past" : ""}`}>
                          {new Date(e.at).getDate()} · {e.title}
                        </span>
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }}
    </Gate>
  );
}

const CATS: RiskCategory[] = ["Strategic", "Financial", "Operational", "Compliance", "Reputational", "ICT"];

export function GovSettingsView() {
  const actor = useStaffActor();
  const res = useGov(async () => ({ settings: await getSettings(), bodies: await listBodies(), members: await listMembers() }));
  const [toast, show] = useCrmToast();
  const [body, setBody] = useState<GovBody | null>(null);
  const [s, setS] = useState<GovSettings | null>(null);
  return (
    <Gate res={res} what="Governance settings">
      {({ settings, bodies, members }) => {
        const cur = s ?? settings;
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-card crm-card--flush">
              <div className="crm-card__h">
                <h3>Bodies and committees</h3>
                <p>Members, quorum, frequency, terms of reference, secretary, notice and pack periods.</p>
              </div>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Body</th>
                      <th>Chair / secretary</th>
                      <th className="num">Members</th>
                      <th className="num">Quorum</th>
                      <th>Frequency</th>
                      <th>Notice / pack</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bodies.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <b>{b.name}</b>
                          <span className="crm-small">{b.tor ?? "No terms of reference on file"}</span>
                        </td>
                        <td>
                          {b.chair}
                          <span className="crm-small">{b.secretary}</span>
                        </td>
                        <td className="num">{b.members.length}</td>
                        <td className="num">{b.quorum}</td>
                        <td>{b.frequency}</td>
                        <td>
                          {b.notice_days}d / {b.pack_days}d
                        </td>
                        <td className="num">
                          <button type="button" className="crm-link" onClick={() => setBody(structuredClone(b))}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="crm-grid crm-grid--2">
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Risk appetite</h3>
                  <p>Maximum residual score (likelihood × impact) per category. Above it, R-G3 escalates.</p>
                </div>
                <div className="crm-form">
                  {CATS.map((c) => (
                    <label key={c} className="crm-field">
                      {c}: {cur.appetite[c]}
                      <input type="range" min={1} max={25} value={cur.appetite[c]} onChange={(e) => setS({ ...cur, appetite: { ...cur.appetite, [c]: Number(e.target.value) } })} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="crm-stack">
                <ModuleSettings
                  title="Cycle"
                  description="Defaults for new meetings. Values from the confirmation pack are flagged until ESWASA confirms them."
                  fields={[
                    { key: "default_notice_days", label: "Default notice (days)", type: "number", min: 1, toConfirm: true, hint: "Each body can override this in its own settings." },
                    { key: "default_pack_days", label: "Default pack lead (days)", type: "number", min: 1, toConfirm: true },
                    { key: "declaration_due", label: "Annual declarations due", toConfirm: true },
                  ]}
                  values={{ default_notice_days: cur.default_notice_days, default_pack_days: cur.default_pack_days, declaration_due: cur.declaration_due }}
                  onSave={async (v) => {
                    await saveSettings({ default_notice_days: Number(v.default_notice_days), default_pack_days: Number(v.default_pack_days), declaration_due: String(v.declaration_due) });
                    show("Cycle settings saved.");
                  }}
                />
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Statutory deadlines</h3>
                  </div>
                  <div className="crm-form">
                  {cur.statutory.map((st, i) => (
                    <div key={st.id} className="crm-row">
                      <input className="crm-input" style={{ flex: 2 }} value={st.title} onChange={(e) => setS({ ...cur, statutory: cur.statutory.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      <input className="crm-input" style={{ width: 150 }} type="date" value={st.due.slice(0, 10)} onChange={(e) => setS({ ...cur, statutory: cur.statutory.map((x, j) => (j === i ? { ...x, due: new Date(e.target.value).toISOString() } : x)) })} />
                    </div>
                  ))}
                  <button type="button" className="crm-link" style={{ alignSelf: "flex-start" }} onClick={() => setS({ ...cur, statutory: [...cur.statutory, { id: `ST-${Date.now() % 10000}`, title: "New deadline", due: new Date().toISOString(), owner: actor.name }] })}>
                    + Add deadline
                  </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Board pack section template</h3>
                <p>Used for every new Board meeting (R-G1).</p>
              </div>
              <table className="crm-table">
                <tbody>
                  {cur.section_templates.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <input className="crm-input" value={t.title} onChange={(e) => setS({ ...cur, section_templates: cur.section_templates.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      </td>
                      <td>
                        <input className="crm-input" value={t.owner} onChange={(e) => setS({ ...cur, section_templates: cur.section_templates.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) })} />
                      </td>
                      <td>{t.source === "live_module" ? `Live: ${t.module}` : t.source}</td>
                      <td className="num">
                        <button type="button" className="crm-link" onClick={() => setS({ ...cur, section_templates: cur.section_templates.filter((_, j) => j !== i) })}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="crm-link" onClick={() => setS({ ...cur, section_templates: [...cur.section_templates, { title: "New section", owner: actor.name, source: "upload" }] })}>
                + Add section
              </button>
            </div>

            <div className="crm-row">
              <button type="button" className="crm-btn crm-btn--pri" disabled={!s} onClick={() => void saveSettings(cur).then(() => (setS(null), show("Settings saved. Appetite re-checked against every risk.")))}>
                Save settings
              </button>
              <span className="crm-spacer" />
              <button
                type="button"
                className="crm-btn crm-btn--danger"
                onClick={() =>
                  void Promise.all([resetGovernanceDemo(), resetTasksDemo(), resetCrmDemo()]).then(() => {
                    setS(null);
                    show("Demo data reset (governance, tasks and CRM).");
                  })
                }
              >
                Reset demo data
              </button>
            </div>

            {body ? (
              <CrmDrawer
                open
                title={`Edit ${body.name}`}
                onClose={() => setBody(null)}
                footer={
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => void saveBody(body, actor).then(() => (setBody(null), show("Body saved.")), (e: Error) => show(e.message))}>
                    Save
                  </button>
                }
              >
                <div className="crm-form">
                  <label className="crm-field">
                    Name
                    <input className="crm-input" value={body.name} onChange={(e) => setBody({ ...body, name: e.target.value })} />
                  </label>
                  <div className="crm-form crm-form--2">
                    <label className="crm-field">
                      Chair
                      <select className="crm-select" value={body.chair} onChange={(e) => setBody({ ...body, chair: e.target.value })}>
                        {body.members.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label className="crm-field">
                      Secretary
                      <input className="crm-input" value={body.secretary} onChange={(e) => setBody({ ...body, secretary: e.target.value })} />
                    </label>
                    <label className="crm-field">
                      Quorum
                      <input className="crm-input" type="number" min={1} max={body.members.length} value={body.quorum} onChange={(e) => setBody({ ...body, quorum: Number(e.target.value) })} />
                    </label>
                    <label className="crm-field">
                      Frequency
                      <select className="crm-select" value={body.frequency} onChange={(e) => setBody({ ...body, frequency: e.target.value as GovBody["frequency"] })}>
                        {["Monthly", "Quarterly", "Bi-annual", "Annual", "As needed"].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="crm-field">
                      Notice (days)
                      <input className="crm-input" type="number" value={body.notice_days} onChange={(e) => setBody({ ...body, notice_days: Number(e.target.value) })} />
                    </label>
                    <label className="crm-field">
                      Pack lead (days)
                      <input className="crm-input" type="number" value={body.pack_days} onChange={(e) => setBody({ ...body, pack_days: Number(e.target.value) })} />
                    </label>
                    <label className="crm-field">
                      Term (years)
                      <input className="crm-input" type="number" value={body.term_years} onChange={(e) => setBody({ ...body, term_years: Number(e.target.value) })} />
                    </label>
                  </div>
                  <label className="crm-field">
                    Terms of reference
                    <input className="crm-input" value={body.tor ?? ""} onChange={(e) => setBody({ ...body, tor: e.target.value })} />
                  </label>
                  <div className="crm-field">
                    Members
                    {members.map((m) => (
                      <label key={m.name} className="crm-check">
                        <input type="checkbox" checked={body.members.includes(m.name)} onChange={(e) => setBody({ ...body, members: e.target.checked ? [...body.members, m.name] : body.members.filter((x) => x !== m.name) })} /> {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              </CrmDrawer>
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}
