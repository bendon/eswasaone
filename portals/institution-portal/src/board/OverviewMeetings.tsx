/**
 * Board → Overview (G2: store-backed, no stubs) and Meetings (list + schedule, R-G1).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import { CrmDrawer, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  governanceOverview,
  listBodies,
  listMeetings,
  MEETING_DEF,
  riskScoreOf,
  scheduleMeeting,
  searchGovernance,
  tally,
  type SearchHit,
} from "@eswasaone/shared-ui/governance";
import { Bar, daysTo, fmtDay, fmtDayTime, Gate, useGov, useStaffActor, WfPill } from "./ui";

export function BoardOverview() {
  const res = useGov(() => governanceOverview());
  return (
    <Gate res={res} what="Governance overview">
      {(o) => (
        <div className="crm-stack">
          <SearchBox />
          {o.next ? (
            <div className="crm-card">
              <div className="crm-card__h">
                <div>
                  <h3>
                    Next: <Link to={`/board/meetings/${o.next.meeting.id}`}>{o.next.meeting.title}</Link>
                  </h3>
                  <p>
                    {fmtDayTime(o.next.meeting.scheduled_at)} · {o.next.meeting.venue} · in {daysTo(o.next.meeting.scheduled_at)} day(s)
                  </p>
                </div>
                <WfPill def={MEETING_DEF} state={o.next.meeting.state} />
              </div>
              <div className="eo-ready">
                <div className="eo-ready__i">
                  <b>Agenda</b>
                  <span className="crm-small">{o.next.meeting.agenda_final ? "Final" : `Draft · ${o.next.meeting.agenda.length} items`}</span>
                  <Bar pct={o.next.readiness.agenda} tone={o.next.meeting.agenda_final ? "green" : "amber"} />
                </div>
                <div className="eo-ready__i">
                  <b>Pack</b>
                  <span className="crm-small">
                    {o.next.readiness.ready}/{o.next.readiness.total} sections Ready · {o.next.pack?.state}
                  </span>
                  <Bar pct={o.next.readiness.pack} tone={o.next.readiness.pack === 100 ? "green" : "amber"} />
                </div>
                <div className="eo-ready__i">
                  <b>Notice</b>
                  <span className="crm-small">{o.next.readiness.notice ? (o.next.readiness.noticeOk ? `Issued in time (${o.next.body.notice_days}-day rule)` : "Issued late") : "Not issued"}</span>
                  <Bar pct={o.next.readiness.notice ? 100 : 0} tone={o.next.readiness.noticeOk ? "green" : "red"} />
                </div>
              </div>
              <div className="crm-row" style={{ marginTop: 12 }}>
                <Link className="crm-btn crm-btn--sm" to={`/board/meetings/${o.next.meeting.id}/agenda`}>
                  Agenda builder
                </Link>
                <Link className="crm-btn crm-btn--sm" to={`/board/pack/${o.next.meeting.id}`}>
                  Pack builder
                </Link>
                <Link className="crm-btn crm-btn--sm crm-btn--gold" to={`/board/meetings/${o.next.meeting.id}/run`}>
                  <Icon name="i-play" /> Run meeting
                </Link>
              </div>
            </div>
          ) : (
            <div className="crm-empty">
              <b>No Board meeting scheduled</b>
              <p>Schedule the next meeting from the Meetings tab.</p>
            </div>
          )}

          <div className="crm-kpis">
            <Link to="/board/resolutions?tab=actions" className="crm-kpi crm-kpi--amber" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="crm-kpi__l">Open actions</div>
              <div className="crm-kpi__v">{o.openActions.length}</div>
              <div className="crm-kpi__s">{o.overdueActions} overdue</div>
            </Link>
            <Link to="/board/risks" className={`crm-kpi ${o.aboveAppetite.length ? "crm-kpi--red" : "crm-kpi--green"}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="crm-kpi__l">Risks above appetite</div>
              <div className="crm-kpi__v">{o.aboveAppetite.length}</div>
              <div className="crm-kpi__s">R-G3 escalated</div>
            </Link>
            <Link to="/board/resolutions?tab=written" className="crm-kpi" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="crm-kpi__l">Written resolutions open</div>
              <div className="crm-kpi__v">{o.written.length}</div>
            </Link>
            <Link to="/board/declarations" className={`crm-kpi ${o.declarationsDue ? "crm-kpi--amber" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="crm-kpi__l">Declarations due</div>
              <div className="crm-kpi__v">{o.declarationsDue}</div>
              <div className="crm-kpi__s">Attendance {o.attendanceRate}%</div>
            </Link>
          </div>

          <div className="crm-grid crm-grid--2">
            <div className="crm-card">
              <div className="crm-card__h">
                <h3>Action tracker</h3>
                <Link className="crm-link" to="/board/resolutions?tab=actions">
                  All actions
                </Link>
              </div>
              {!o.openActions.length ? (
                <p className="crm-muted">No open actions.</p>
              ) : (
                <ul className="eo-notes">
                  {o.openActions.slice(0, 5).map((a) => (
                    <li key={a.id} className="eo-note">
                      <div style={{ flex: 1 }}>
                        <Link to={`/board/resolutions/${a.resolution_id}`}>
                          <b>{a.description}</b>
                        </Link>
                        <span className="crm-small">
                          {a.owner} · due {fmtDay(a.due)} {new Date(a.due) < new Date() ? <span className="crm-pill crm-pill--red">Overdue</span> : null}
                        </span>
                        <Bar pct={a.progress} tone={a.progress >= 100 ? "green" : "navy"} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="crm-stack">
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Risks above appetite</h3>
                </div>
                {!o.aboveAppetite.length ? (
                  <p className="crm-muted">Every risk is within appetite.</p>
                ) : (
                  o.aboveAppetite.map((r) => (
                    <p key={r.id} style={{ margin: "0 0 8px" }}>
                      <Link to={`/board/risks/${r.id}`}>
                        <b>{r.id}</b> {r.title}
                      </Link>
                      <span className="crm-small" style={{ display: "block" }}>
                        {r.category} · residual {riskScoreOf(r.residual)} · owner {r.owner}
                      </span>
                    </p>
                  ))
                )}
              </div>
              <div className="crm-card">
                <div className="crm-card__h">
                  <h3>Written resolutions in circulation</h3>
                </div>
                {!o.written.length ? (
                  <p className="crm-muted">None.</p>
                ) : (
                  o.written.map((r) => {
                    const t = tally(r);
                    return (
                      <p key={r.id} style={{ margin: "0 0 8px" }}>
                        <Link to={`/board/resolutions/${r.id}`}>
                          <b>{r.title}</b>
                        </Link>
                        <span className="crm-small" style={{ display: "block" }}>
                          {t.cast}/{r.window?.eligible.length} voted · closes {fmtDayTime(r.window?.closes)}
                        </span>
                      </p>
                    );
                  })
                )}
              </div>
              {o.minutesAwaiting.length ? (
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Minutes in progress</h3>
                  </div>
                  {o.minutesAwaiting.map((m) => (
                    <p key={m.id} style={{ margin: "0 0 6px" }}>
                      <Link to={`/board/meetings/${m.id}`}>{m.title}</Link> <WfPill def={MEETING_DEF} state={m.state} />
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Gate>
  );
}

function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  return (
    <div className="crm-card">
      <form
        className="crm-row"
        onSubmit={(e) => {
          e.preventDefault();
          void searchGovernance(q).then(setHits);
        }}
      >
        <Icon name="i-search" />
        <input className="crm-input" style={{ flex: 1 }} placeholder='Search minutes and resolutions — e.g. "fee schedule"' value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search minutes and resolutions" />
        <button type="submit" className="crm-btn crm-btn--sm">
          Search
        </button>
      </form>
      {hits ? (
        hits.length ? (
          <ul className="eo-notes" style={{ marginTop: 12 }}>
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`} className="eo-note">
                <div>
                  <Link to={h.link}>
                    <b>{h.title}</b>
                  </Link>
                  <p>{h.snippet}</p>
                  <span className="crm-small">
                    {h.kind === "minutes" ? "Minutes" : "Resolution"} · {fmtDay(h.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crm-muted" style={{ marginTop: 10 }}>
            No minutes or resolutions match.
          </p>
        )
      ) : null}
    </div>
  );
}

export function MeetingsList() {
  const [body, setBody] = useState("");
  const res = useGov(async () => ({ meetings: await listMeetings({ body: body || undefined }), bodies: await listBodies() }), [body]);
  const [open, setOpen] = useState(false);
  return (
    <Gate res={res} what="Meetings">
      {({ meetings, bodies }) => (
        <div className="crm-stack">
          <div className="crm-row">
            <Select value={body} onChange={(val) => setBody(val)} aria-label="Body">
              <option value="">All bodies</option>
              {bodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <span className="crm-spacer" />
            <Link to="/board/calendar" className="crm-btn crm-btn--sm">
              <Icon name="i-cal" /> Calendar
            </Link>
            <button type="button" className="crm-btn crm-btn--gold" onClick={() => setOpen(true)}>
              <Icon name="i-plus" /> Schedule meeting
            </button>
          </div>
          <div className="crm-card crm-card--flush">
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th>Body</th>
                    <th>Date</th>
                    <th>State</th>
                    <th>Agenda</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/board/meetings/${m.id}`}>
                          <b>{m.title}</b>
                        </Link>
                        <span className="crm-small crm-mono">{m.id}</span>
                      </td>
                      <td>{bodies.find((b) => b.id === m.body_id)?.short ?? m.body_id}</td>
                      <td>{fmtDayTime(m.scheduled_at)}</td>
                      <td>
                        <WfPill def={MEETING_DEF} state={m.state} />
                      </td>
                      <td>
                        {m.agenda.length} items{m.agenda_final ? " · final" : ""}
                      </td>
                      <td className="num">
                        {["Scheduled", "Pack issued"].includes(m.state) ? (
                          <Link className="crm-link" to={`/board/meetings/${m.id}/run`}>
                            Run
                          </Link>
                        ) : ["Held", "Minutes draft", "Minutes submitted"].includes(m.state) ? (
                          <Link className="crm-link" to={`/board/meetings/${m.id}/minutes`}>
                            Minutes
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ScheduleDrawer open={open} onClose={() => setOpen(false)} bodies={bodies} />
        </div>
      )}
    </Gate>
  );
}

export function ScheduleDrawer({ open, onClose, bodies }: { open: boolean; onClose: () => void; bodies: { id: string; name: string; notice_days: number; pack_days: number }[] }) {
  const actor = useStaffActor();
  const nav = useNavigate();
  const [toast, show] = useCrmToast();
  const [f, setF] = useState({ body_id: "BOARD", title: "", date: "", time: "09:00", venue: "ESWASA Boardroom, Matsapha", online_link: "" });
  const [err, setErr] = useState<string | null>(null);
  const body = bodies.find((b) => b.id === f.body_id);
  const tooSoon = f.date && body ? daysTo(`${f.date}T${f.time}`) < body.notice_days : false;
  return (
    <>
      {toast}
      <CrmDrawer
        open={open}
        title="Schedule meeting"
        subtitle="R-G1 opens the pack and asks each section owner for their paper."
        onClose={onClose}
        footer={
          <>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--pri"
              onClick={() => {
                setErr(null);
                void scheduleMeeting({ body_id: f.body_id, title: f.title, scheduled_at: `${f.date}T${f.time}:00`, venue: f.venue, online_link: f.online_link || undefined }, actor)
                  .then((m) => {
                    show(`${m.title} scheduled — pack opened, owners asked for sections.`);
                    onClose();
                    nav(`/board/meetings/${m.id}`);
                  })
                  .catch((e: Error) => setErr(e.message));
              }}
            >
              Schedule
            </button>
          </>
        }
      >
        <div className="crm-form">
          <label className="crm-field">
            Body
            <Select value={f.body_id} onChange={(val) => setF({ ...f, body_id: val })} block>
              {bodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="crm-field">
            Title
            <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Q4 Board meeting" />
          </label>
          <div className="crm-form crm-form--2">
            <label className="crm-field">
              Date
              <input className="crm-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </label>
            <label className="crm-field">
              Time
              <input className="crm-input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            </label>
          </div>
          {tooSoon ? <p className="crm-banner" style={{ margin: 0 }}>Less than {body?.notice_days} days away — notice can't be given in time under the {body?.name} rules.</p> : null}
          <label className="crm-field">
            Venue
            <input className="crm-input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          </label>
          <label className="crm-field">
            Online link (optional)
            <input className="crm-input" value={f.online_link} onChange={(e) => setF({ ...f, online_link: e.target.value })} placeholder="Teams / Zoom link" />
          </label>
          {body ? (
            <p className="crm-small">
              Notice at least {body.notice_days} days before · pack at least {body.pack_days} days before.
            </p>
          ) : null}
          {err ? <p className="eo-error">{err}</p> : null}
        </div>
      </CrmDrawer>
    </>
  );
}
