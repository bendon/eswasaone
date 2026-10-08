/**
 * Meeting record page (G3), agenda builder (G6), run-meeting console (G7), minutes editor (G1).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import { CrmBanner, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  actOnMeeting,
  finaliseAgenda,
  getMeeting,
  issueNotice,
  MEETING_DEF,
  meetingActions,
  noticePreview,
  PACK_DEF,
  quorumMet,
  recordDeclaration,
  recordItemDecision,
  RESOLUTION_DEF,
  saveAgenda,
  saveMinutes,
  setAttendance,
  setCurrentItem,
  startRun,
  type AgendaItem,
  type AgendaKind,
  type MeetingBundle,
  type Vote,
} from "@eswasaone/shared-ui/governance";
import { MessagePreview } from "@eswasaone/shared-ui/notify";
import { DocumentsPanel, Facts, HistoryTimeline, IndependencePanel, RailCard, RecordPage, SuggestButton } from "@eswasaone/shared-ui/record";
import { DEMO_STAFF } from "@eswasaone/shared-ui/tasks";
import { ActionBar, ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { daysTo, fmtDay, fmtDayTime, Gate, useGov, useStaffActor, VOTE_LABEL, WfPill } from "./ui";

/* ---------------- record page ---------------- */

export function MeetingRecordPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const res = useGov(() => getMeeting(id), [id]);
  const [toast, show] = useCrmToast();
  return (
    <Gate res={res} what="Meeting">
      {(b) => {
        const m = b.meeting;
        const actions = meetingActions(m.id, actor);
        const present = Object.values(m.attendance).filter((a) => a.present).length;
        return (
          <>
            {toast}
            <RecordPage
              back={{ to: "/board/meetings", label: "Meetings" }}
              reference={m.id}
              type={b.body.name}
              title={m.title}
              state={m.state}
              tone={MEETING_DEF.states.find((s) => s.id === m.state)?.tone}
              chips={b.pack ? <WfPill def={PACK_DEF} state={b.pack.state} /> : null}
              actions={
                <ActionBar
                  actions={actions}
                  state={m.state}
                  onAct={async (a, input) => {
                    await actOnMeeting(m.id, a.action, actor, input);
                    show(`${a.label}: done.`);
                  }}
                />
              }
              banner={
                m.state === "Minutes submitted" && b.next ? (
                  <CrmBanner tone="info">
                    These minutes go to <Link to={`/board/meetings/${b.next.id}`}>{b.next.title}</Link> for approval — record it there under "Approval of minutes" in the Run meeting console.
                  </CrmBanner>
                ) : null
              }
              summary={
                <div className="crm-grid crm-grid--3">
                  <Facts
                    rows={[
                      { label: "When", value: fmtDayTime(m.scheduled_at) },
                      { label: "Venue", value: m.venue },
                      { label: "Online", value: m.online_link },
                    ]}
                  />
                  <Facts
                    rows={[
                      { label: "Notice", value: m.notice_issued_at ? `Issued ${fmtDay(m.notice_issued_at)}` : "Not issued" },
                      { label: "Agenda", value: `${m.agenda.length} items${m.agenda_final ? " (final)" : " (draft)"}` },
                      { label: "Pack", value: b.pack ? `${b.pack.state}${b.pack.issued_version ? ` · v${b.pack.issued_version} issued` : ""}` : "—" },
                    ]}
                  />
                  <Facts
                    rows={[
                      { label: "Quorum", value: `${b.body.quorum} of ${b.body.members.length}` },
                      { label: "Present", value: m.run?.started_at ? `${present}${quorumMet(m, b.body) ? " ✓ quorate" : " — not quorate"}` : "—" },
                      { label: "Resolutions", value: String(b.resolutions.length) },
                    ]}
                  />
                </div>
              }
              tabs={[
                { id: "agenda", label: "Agenda", badge: m.agenda.length, render: () => <AgendaReadOnly b={b} /> },
                { id: "pack", label: "Papers / pack", render: () => <PackSummary b={b} /> },
                { id: "attendance", label: "Attendance", render: () => <AttendanceTab b={b} /> },
                { id: "decisions", label: "Decisions", badge: m.agenda.filter((a) => a.decision).length, render: () => <DecisionsTab b={b} /> },
                { id: "minutes", label: "Minutes", render: () => <MinutesReadOnly b={b} /> },
                { id: "docs", label: "Documents", render: () => <DocumentsPanel doctype="Board Meeting" name={m.id} by={actor.name} categories={["Notice", "Papers", "Minutes", "Pack", "Other"]} gateCategories={["Minutes", "Pack"]} /> },
                { id: "history", label: "History", render: () => <HistoryTimeline events={m.history} /> },
              ]}
              rail={
                <>
                  <RailCard title="Next steps">
                    <div className="crm-stack" style={{ gap: 8 }}>
                      <Link className="crm-btn crm-btn--sm" to={`/board/meetings/${m.id}/agenda`}>
                        <Icon name="i-list" /> Agenda builder
                      </Link>
                      <Link className="crm-btn crm-btn--sm" to={`/board/pack/${m.id}`}>
                        <Icon name="i-layers" /> Pack builder
                      </Link>
                      <Link className="crm-btn crm-btn--sm crm-btn--gold" to={`/board/meetings/${m.id}/run`}>
                        <Icon name="i-play" /> Run meeting
                      </Link>
                      <Link className="crm-btn crm-btn--sm" to={`/board/meetings/${m.id}/minutes`}>
                        <Icon name="i-file" /> Minutes
                      </Link>
                      <Link className="crm-btn crm-btn--sm crm-btn--ghost" to={`/print/minutes/${m.id}`} target="_blank">
                        <Icon name="i-download" /> Print minutes
                      </Link>
                    </div>
                  </RailCard>
                  <RailCard title="Body">
                    <Facts
                      rows={[
                        { label: "Chair", value: b.body.chair },
                        { label: "Secretary", value: b.body.secretary },
                        { label: "Notice", value: `${b.body.notice_days} days` },
                        { label: "Pack", value: `${b.body.pack_days} days before` },
                      ]}
                    />
                  </RailCard>
                  <IndependencePanel
                    duties={m.declarations.map((d) => ({ step: `Conflict${d.item_id ? ` (item ${m.agenda.findIndex((a) => a.id === d.item_id) + 1})` : ""}`, people: [d.member] }))}
                    checks={[
                      { rule: "Conflicted members recorded as recused", ok: m.agenda.every((it) => !it.decision || m.declarations.filter((d) => d.item_id === it.id).every((d) => !it.decision!.votes[d.member] || it.decision!.votes[d.member] === "recused")) },
                      { rule: `Notice ≥ ${b.body.notice_days} days`, ok: Boolean(m.notice_issued_at && (new Date(m.scheduled_at).getTime() - new Date(m.notice_issued_at).getTime()) / 86_400_000 >= b.body.notice_days) },
                    ]}
                  />
                  <SuggestButton
                    build={() => {
                      const flags: string[] = [];
                      if (!m.agenda_final) flags.push("Agenda is still a draft.");
                      if (!m.notice_issued_at) flags.push(`Notice not issued — due ${b.body.notice_days} days before the meeting.`);
                      const waiting = b.pack?.sections.filter((s) => s.included && s.status !== "ready") ?? [];
                      if (waiting.length) flags.push(`${waiting.length} pack section(s) not Ready: ${waiting.map((s) => `${s.title} (${s.owner})`).join(", ")}.`);
                      return {
                        summary: `${m.title} is ${m.state.toLowerCase()}, ${daysTo(m.scheduled_at) >= 0 ? `in ${daysTo(m.scheduled_at)} day(s)` : `${-daysTo(m.scheduled_at)} day(s) ago`}. ${m.history.length} history entries.`,
                        flags,
                        next: actions.find((a) => !a.disabledReason)?.label ?? (flags.length ? "Clear the flags above, then issue the pack." : undefined),
                        draft: waiting.length ? `Dear colleagues,\n\nA reminder that the following sections for the ${m.title} pack are due: ${waiting.map((s) => s.title).join(", ")}.\n\n${b.body.secretary}` : undefined,
                      };
                    }}
                  />
                </>
              }
            />
          </>
        );
      }}
    </Gate>
  );
}

function AgendaReadOnly({ b }: { b: MeetingBundle }) {
  return (
    <ol className="eo-agenda">
      {b.meeting.agenda.map((it, i) => (
        <li key={it.id}>
          <span className="eo-agenda__n">{i + 1}</span>
          <div>
            <b>{it.title}</b>
            <span className="crm-small">
              {it.kind} · {it.presenter} · {it.minutes} min{it.papers.length ? ` · ${it.papers.join(", ")}` : ""}
            </span>
          </div>
          {it.decision ? <span className="crm-pill crm-pill--green">{it.decision.outcome}</span> : <span className="crm-pill crm-pill--outline">{it.kind === "decision" ? "For decision" : it.kind === "noting" ? "For noting" : "For discussion"}</span>}
        </li>
      ))}
    </ol>
  );
}

function PackSummary({ b }: { b: MeetingBundle }) {
  if (!b.pack) return <p className="crm-muted">No pack.</p>;
  return (
    <div className="crm-stack">
      <div className="crm-row">
        <WfPill def={PACK_DEF} state={b.pack.state} />
        <span className="crm-small">{b.pack.versions.length} version(s){b.pack.issued_version ? ` · v${b.pack.issued_version} issued` : ""}</span>
        <span className="crm-spacer" />
        <Link className="crm-btn crm-btn--sm" to={`/board/pack/${b.meeting.id}`}>
          Open pack builder
        </Link>
      </div>
      <table className="crm-table">
        <tbody>
          {b.pack.sections.map((s) => (
            <tr key={s.id}>
              <td>
                <b>{s.title}</b>
                <span className="crm-small">
                  {s.owner} · {s.source.replace("_", " ")}
                  {s.restricted ? " · restricted" : ""}
                </span>
              </td>
              <td>
                <span className={`crm-pill crm-pill--${s.status === "ready" ? "green" : s.status === "draft" ? "amber" : "slate"}`}>{s.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTab({ b }: { b: MeetingBundle }) {
  const actor = useStaffActor();
  const m = b.meeting;
  return (
    <table className="crm-table">
      <thead>
        <tr>
          <th>Member</th>
          <th>RSVP</th>
          <th>Present</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(m.attendance).map(([name, a]) => (
          <tr key={name}>
            <td>
              <b>{name}</b>
              <span className="crm-small">{b.members.find((x) => x.name === name)?.title}</span>
            </td>
            <td>
              <Select value={a.rsvp} onChange={(val) => void setAttendance(m.id, name, { rsvp: val as "yes" | "no" | "pending", apology: val === "no" }, actor)} aria-label={`RSVP for ${name}`}>
                <option value="pending">Pending</option>
                <option value="yes">Attending</option>
                <option value="no">Apology</option>
              </Select>
            </td>
            <td>{m.run?.started_at ? (a.present ? "✓ Present" : a.apology ? "Apology" : "Absent") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DecisionsTab({ b }: { b: MeetingBundle }) {
  const decided = b.meeting.agenda.filter((a) => a.decision);
  if (!decided.length) return <p className="crm-muted">No decisions recorded yet. Use Run meeting on the day.</p>;
  return (
    <ul className="eo-notes">
      {decided.map((it) => {
        const v = Object.values(it.decision!.votes);
        const res = b.resolutions.find((r) => r.id === it.decision!.resolution_id);
        return (
          <li key={it.id} className="eo-note">
            <div style={{ flex: 1 }}>
              <b>{it.title}</b>
              <p>{it.decision!.text}</p>
              <span className="crm-small">
                {it.decision!.outcome}
                {v.length ? ` · ${v.filter((x) => x === "for").length} for, ${v.filter((x) => x === "against").length} against, ${v.filter((x) => x === "abstain").length} abstain${v.includes("recused") ? `, ${v.filter((x) => x === "recused").length} recused` : ""}` : ""}
              </span>
              {res ? (
                <p style={{ margin: "6px 0 0" }}>
                  <Link to={`/board/resolutions/${res.id}`}>{res.id}</Link> <WfPill def={RESOLUTION_DEF} state={res.state} />
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MinutesReadOnly({ b }: { b: MeetingBundle }) {
  const m = b.meeting;
  if (!m.minutes) return <p className="crm-muted">Minutes start once the meeting is held.</p>;
  return (
    <div className="crm-stack">
      <div className="crm-row">
        <WfPill def={MEETING_DEF} state={m.state} />
        {m.minutes.approved_at_meeting ? <span className="crm-small">Approved at {m.minutes.approved_at_meeting} on {fmtDay(m.minutes.approved_at)}</span> : null}
        <span className="crm-spacer" />
        <Link className="crm-btn crm-btn--sm" to={`/board/meetings/${m.id}/minutes`}>
          {m.state === "Minutes draft" ? "Edit minutes" : "Open minutes"}
        </Link>
      </div>
      <p style={{ margin: 0, lineHeight: 1.6 }}>{m.minutes.general}</p>
      {m.agenda.map((it, i) => (
        <div key={it.id}>
          <b>
            {i + 1}. {it.title}
          </b>
          <p style={{ margin: "4px 0 0", lineHeight: 1.6 }}>{m.minutes!.items[it.id] || <span className="crm-muted">—</span>}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------- agenda builder (G6) ---------------- */

const KIND_LABEL: Record<AgendaKind, string> = { decision: "For decision", noting: "For noting", discussion: "For discussion" };

export function AgendaBuilderPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const res = useGov(() => getMeeting(id), [id]);
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [notice, setNotice] = useState(false);
  const [toast, show] = useCrmToast();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (res.data && items === null) setItems(res.data.meeting.agenda);
  }, [res.data, items]);

  return (
    <Gate res={res} what="Meeting">
      {(b) => {
        const m = b.meeting;
        const list = items ?? m.agenda;
        const locked = !["Scheduled", "Pack issued"].includes(m.state);
        const total = list.reduce((n, it) => n + it.minutes, 0);
        const dirty = JSON.stringify(list) !== JSON.stringify(m.agenda);
        const set = (i: number, patch: Partial<AgendaItem>) => setItems(list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
        const noticeDays = Math.floor((new Date(m.scheduled_at).getTime() - Date.now()) / 86_400_000);
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-ws__head">
              <div>
                <Link to={`/board/meetings/${m.id}`} className="crm-ws__back">
                  <Icon name="i-cleft" /> {m.title}
                </Link>
                <h2>Agenda builder</h2>
                <span className="crm-small">
                  {list.length} items · {total} minutes · {fmtDayTime(m.scheduled_at)}
                </span>
              </div>
              <div className="crm-ws__actions">
                <button type="button" className="crm-btn" disabled={locked || !dirty} onClick={() => void saveAgenda(m.id, list, actor).then(() => show("Agenda saved."), (e: Error) => setErr(e.message))}>
                  Save
                </button>
                <button
                  type="button"
                  className="crm-btn"
                  disabled={locked}
                  onClick={() => void (dirty ? saveAgenda(m.id, list, actor) : Promise.resolve()).then(() => finaliseAgenda(m.id, !m.agenda_final, actor)).then(() => show(m.agenda_final ? "Agenda reopened." : "Agenda finalised."))}
                >
                  {m.agenda_final ? "Reopen agenda" : "Finalise agenda"}
                </button>
                <button type="button" className="crm-btn crm-btn--pri" disabled={!m.agenda_final || dirty} onClick={() => setNotice(true)} title={!m.agenda_final ? "Finalise the agenda first" : undefined}>
                  <Icon name="i-send" /> {m.notice_issued_at ? "Re-issue notice" : "Publish notice"}
                </button>
              </div>
            </div>
            {err ? <p className="eo-error">{err}</p> : null}
            {locked ? <CrmBanner tone="lock">The meeting has been held — the agenda is locked.</CrmBanner> : null}
            {noticeDays < b.body.notice_days && !m.notice_issued_at ? (
              <CrmBanner>
                Only {noticeDays} day(s) to the meeting — the {b.body.name} needs {b.body.notice_days} days' notice. Consider rescheduling or record the waiver in the minutes.
              </CrmBanner>
            ) : null}
            <ol className="eo-agenda">
              {list.map((it, i) => (
                <li
                  key={it.id}
                  draggable={!locked}
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDrop={() => {
                    if (drag === null || drag === i) return;
                    const next = [...list];
                    const [row] = next.splice(drag, 1);
                    next.splice(i, 0, row);
                    setItems(next);
                    setDrag(null);
                    setOver(null);
                  }}
                  onDragEnd={() => (setDrag(null), setOver(null))}
                  className={`${drag === i ? "is-drag" : ""} ${over === i && drag !== i ? "is-over" : ""}`}
                >
                  <span className="eo-agenda__n" title="Drag to reorder">
                    {i + 1}
                  </span>
                  <div className="crm-form" style={{ gap: 8 }}>
                    <input className="crm-input" value={it.title} disabled={locked} onChange={(e) => set(i, { title: e.target.value })} aria-label="Item title" />
                    <div className="crm-row">
                      <Select value={it.kind} disabled={locked || Boolean(it.approve_minutes_of)} onChange={(val) => set(i, { kind: val as AgendaKind })} aria-label="Type">
                        {Object.entries(KIND_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <input className="crm-input" style={{ width: 200 }} value={it.presenter} disabled={locked} onChange={(e) => set(i, { presenter: e.target.value })} aria-label="Presenter" placeholder="Presenter" />
                      <input className="crm-input" style={{ width: 90 }} type="number" min={1} value={it.minutes} disabled={locked} onChange={(e) => set(i, { minutes: Number(e.target.value) || 0 })} aria-label="Minutes" />
                      <span className="crm-small">min</span>
                    </div>
                    <div className="crm-row">
                      <span className="crm-small">Pack sections:</span>
                      {b.pack?.sections.map((s) => (
                        <label key={s.id} className="crm-check crm-small">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={it.section_ids.includes(s.id)}
                            onChange={(e) => set(i, { section_ids: e.target.checked ? [...it.section_ids, s.id] : it.section_ids.filter((x) => x !== s.id) })}
                          />
                          {s.title}
                        </label>
                      ))}
                    </div>
                    <input
                      className="crm-input"
                      disabled={locked}
                      value={it.papers.join(", ")}
                      onChange={(e) => set(i, { papers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                      placeholder="Papers (comma-separated file names)"
                      aria-label="Papers"
                    />
                    {it.approve_minutes_of ? <span className="crm-small">Standing item: approves the minutes of {it.approve_minutes_of}.</span> : null}
                  </div>
                  <div className="crm-stack" style={{ gap: 4 }}>
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={locked || i === 0} onClick={() => setItems(swap(list, i, i - 1))} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={locked || i === list.length - 1} onClick={() => setItems(swap(list, i, i + 1))} aria-label="Move down">
                      ↓
                    </button>
                    <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" disabled={locked} onClick={() => setItems(list.filter((_, j) => j !== i))} aria-label="Remove">
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {!locked ? (
              <button
                type="button"
                className="crm-btn"
                onClick={() => setItems([...list, { id: `${m.id}-${Date.now() % 100000}`, title: "New item", kind: "decision", presenter: b.body.chair, minutes: 15, section_ids: [], papers: [] }])}
              >
                <Icon name="i-plus" /> Add item
              </button>
            ) : null}
            {notice ? (
              <ReasonDialog
                title="Publish notice of meeting"
                consequence={`Sends the notice and agenda to ${b.body.members.length} members of the ${b.body.name}.`}
                confirmLabel="Send notice"
                onClose={() => setNotice(false)}
                onSubmit={async () => {
                  await issueNotice(m.id, actor);
                  setNotice(false);
                  show("Notice issued to members.");
                }}
              >
                {(() => {
                  const p = noticePreview(m.id, b.body.members[0]);
                  return p ? <MessagePreview message={{ to: `${b.body.members.length} members (shown for ${b.body.members[0]})`, ...p }} /> : null;
                })()}
              </ReasonDialog>
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}

function swap<T>(xs: T[], i: number, j: number): T[] {
  const n = [...xs];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

/* ---------------- run meeting (G7) ---------------- */

export function RunMeetingPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const nav = useNavigate();
  const res = useGov(() => getMeeting(id), [id]);
  const [toast, show] = useCrmToast();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <Gate res={res} what="Meeting">
      {(b) => {
        const m = b.meeting;
        const started = Boolean(m.run?.started_at);
        const held = !["Scheduled", "Pack issued"].includes(m.state);
        const present = Object.entries(m.attendance).filter(([, a]) => a.present).map(([n]) => n);
        const pct = Math.round((present.length / Math.max(1, b.body.quorum)) * 100);
        const ok = quorumMet(m, b.body);
        const elapsed = started ? Math.floor((now - new Date(m.run!.started_at!).getTime()) / 1000) : 0;
        const current = m.agenda.find((a) => a.id === m.run?.current_item) ?? m.agenda.find((a) => !a.decision) ?? m.agenda[0];
        const closeAct = meetingActions(m.id, actor).find((a) => a.action === "close_meeting");
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-ws__head">
              <div>
                <Link to={`/board/meetings/${m.id}`} className="crm-ws__back">
                  <Icon name="i-cleft" /> {m.title}
                </Link>
                <h2>Run meeting</h2>
                <span className="crm-small">
                  {b.body.name} · {fmtDayTime(m.scheduled_at)} · {m.venue}
                </span>
              </div>
              <div className="crm-ws__actions">
                {started ? <span className="eo-timer">{`${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`}</span> : null}
                {!started && !held ? (
                  <button type="button" className="crm-btn crm-btn--gold" onClick={() => void startRun(m.id, actor).then(() => show("Meeting opened."), (e: Error) => show(e.message))}>
                    <Icon name="i-play" /> Open the meeting
                  </button>
                ) : null}
                {closeAct && !held ? (
                  <ActionBar
                    actions={[closeAct]}
                    state={m.state}
                    onAct={async (a, input) => {
                      await actOnMeeting(m.id, a.action, actor, input);
                      show("Meeting closed — minutes task opened.");
                      nav(`/board/meetings/${m.id}/minutes`);
                    }}
                  />
                ) : null}
              </div>
            </div>
            {m.state === "Scheduled" ? <CrmBanner>The pack hasn't been issued. You can still run the meeting, but record the reason in the minutes.</CrmBanner> : null}
            {held ? <CrmBanner tone="ok">This meeting has been held. <Link to={`/board/meetings/${m.id}/minutes`}>Go to minutes</Link>.</CrmBanner> : null}

            <div className="crm-grid crm-grid--main">
              <div className="crm-stack">
                {m.agenda.map((it, i) => (
                  <ItemPanel key={it.id} b={b} item={it} index={i} active={current?.id === it.id} disabled={!started || held} onFocus={() => void setCurrentItem(m.id, it.id)} onDone={(msg) => show(msg)} />
                ))}
              </div>
              <div className="crm-ws__rail">
                <RailCard title="Attendance & quorum">
                  <div className="eo-quorum" style={{ marginBottom: 12 }}>
                    <div className={`eo-quorum__ring${ok ? "" : " no"}`} style={{ ["--p" as string]: Math.min(100, pct) }}>
                      <span>
                        {present.length}/{b.body.quorum}
                      </span>
                    </div>
                    <div>
                      <b>{ok ? "Quorate" : "Not quorate"}</b>
                      <span className="crm-small" style={{ display: "block" }}>
                        Quorum {b.body.quorum} of {b.body.members.length}
                      </span>
                    </div>
                  </div>
                  {Object.entries(m.attendance).map(([name, a]) => (
                    <label key={name} className="crm-check" style={{ marginBottom: 6 }}>
                      <input type="checkbox" disabled={!started || held} checked={Boolean(a.present)} onChange={(e) => void setAttendance(m.id, name, { present: e.target.checked }, actor)} />
                      <span>
                        {name}
                        {a.apology ? <span className="crm-small"> · apology</span> : null}
                      </span>
                    </label>
                  ))}
                </RailCard>
                <DeclarationsCard b={b} disabled={!started || held} />
              </div>
            </div>
          </div>
        );
      }}
    </Gate>
  );
}

function DeclarationsCard({ b, disabled }: { b: MeetingBundle; disabled: boolean }) {
  const actor = useStaffActor();
  const m = b.meeting;
  const [f, setF] = useState({ member: "", item_id: "", interest: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <RailCard title="Declarations of interest">
      {m.declarations.length ? (
        <ul className="eo-notes" style={{ marginBottom: 10 }}>
          {m.declarations.map((d) => (
            <li key={d.id} className="eo-note">
              <div>
                <b>{d.member}</b>
                <p>{d.interest}</p>
                <span className="crm-small">{d.item_id ? `Item ${m.agenda.findIndex((a) => a.id === d.item_id) + 1} — must recuse` : "General"}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="crm-small">Ask for declarations at the start. None recorded.</p>
      )}
      <div className="crm-form" style={{ gap: 8 }}>
        <Select disabled={disabled} value={f.member} onChange={(val) => setF({ ...f, member: val })} aria-label="Member" block>
          <option value="">Member…</option>
          {Object.keys(m.attendance).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </Select>
        <Select disabled={disabled} value={f.item_id} onChange={(val) => setF({ ...f, item_id: val })} aria-label="Agenda item" block>
          <option value="">General (no specific item)</option>
          {m.agenda.map((a, i) => (
            <option key={a.id} value={a.id}>
              {i + 1}. {a.title}
            </option>
          ))}
        </Select>
        <input className="crm-input" disabled={disabled} value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} placeholder="Nature of the interest" aria-label="Interest" />
        {err ? <p className="eo-error">{err}</p> : null}
        <button
          type="button"
          className="crm-btn crm-btn--sm"
          disabled={disabled || !f.member}
          onClick={() =>
            void recordDeclaration({ member: f.member, kind: "meeting", meeting_id: m.id, item_id: f.item_id || undefined, interest: f.interest, recorded_by: actor.name })
              .then(() => setF({ member: "", item_id: "", interest: "" }))
              .catch((e: Error) => setErr(e.message))
          }
        >
          Record declaration
        </button>
      </div>
    </RailCard>
  );
}

function ItemPanel({ b, item, index, active, disabled, onFocus, onDone }: { b: MeetingBundle; item: AgendaItem; index: number; active: boolean; disabled: boolean; onFocus: () => void; onDone: (msg: string) => void }) {
  const actor = useStaffActor();
  const m = b.meeting;
  const conflicted = useMemo(() => m.declarations.filter((d) => d.item_id === item.id).map((d) => d.member), [m.declarations, item.id]);
  const voters = Object.entries(m.attendance).filter(([, a]) => a.present).map(([n]) => n);
  const [votes, setVotes] = useState<Record<string, Vote>>(() => item.decision?.votes ?? Object.fromEntries(voters.map((n) => [n, conflicted.includes(n) ? "recused" : "for"])));
  const [text, setText] = useState(item.decision?.text ?? "");
  const [title, setTitle] = useState(item.title);
  const [outcome, setOutcome] = useState<NonNullable<AgendaItem["decision"]>["outcome"]>(item.kind === "decision" ? "approved" : "noted");
  const [actions, setActions] = useState<{ description: string; owner: string; due: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setVotes((v) => {
      const next = { ...v };
      for (const n of voters) if (!next[n]) next[n] = conflicted.includes(n) ? "recused" : "for";
      for (const n of conflicted) if (next[n]) next[n] = "recused";
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voters.join("|"), conflicted.join("|")]);

  const t = { for: 0, against: 0, abstain: 0, recused: 0 };
  for (const n of voters) t[votes[n] ?? "for"] += 1;

  return (
    <div className="crm-card" style={active ? { borderColor: "var(--navy)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--navy) 12%, transparent)" } : undefined} onFocus={onFocus} onClick={onFocus}>
      <div className="crm-card__h">
        <span className="eo-agenda__n">{index + 1}</span>
        <div>
          <h3>{item.title}</h3>
          <p>
            {KIND_LABEL[item.kind]} · {item.presenter} · {item.minutes} min
            {item.approve_minutes_of ? ` · approves minutes of ${item.approve_minutes_of}` : ""}
          </p>
        </div>
        {item.decision ? <span className="crm-pill crm-pill--green">{item.decision.outcome}</span> : null}
      </div>
      {item.decision ? (
        <div>
          <p style={{ margin: 0 }}>{item.decision.text}</p>
          {item.decision.resolution_id ? (
            <p className="crm-small">
              Resolution <Link to={`/board/resolutions/${item.decision.resolution_id}`}>{item.decision.resolution_id}</Link>
            </p>
          ) : null}
        </div>
      ) : active && !disabled ? (
        <div className="crm-form">
          {conflicted.length ? <CrmBanner tone="lock">Recused (declared interest): {conflicted.join(", ")}</CrmBanner> : null}
          {item.kind !== "noting" ? (
            <div className="crm-row">
              <span className="crm-small">Outcome:</span>
              <div className="crm-seg">
                {(item.kind === "decision" ? (["approved", "rejected", "deferred"] as const) : (["noted", "deferred"] as const)).map((o) => (
                  <button key={o} type="button" className={outcome === o ? "on" : ""} onClick={() => setOutcome(o)}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {item.kind === "decision" && !item.approve_minutes_of ? (
            <>
              <label className="crm-field">
                Resolution title
                <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <table className="crm-table">
                <tbody>
                  {voters.map((n) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td className="num">
                        <div className="eo-votes">
                          {(["for", "against", "abstain", "recused"] as const).map((v) => (
                            <button key={v} type="button" className={`${v}${votes[n] === v ? " on" : ""}`} disabled={conflicted.includes(n) && v !== "recused"} onClick={() => setVotes({ ...votes, [n]: v })}>
                              {VOTE_LABEL[v]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crm-small">
                {t.for} for · {t.against} against · {t.abstain} abstain · {t.recused} recused
              </p>
            </>
          ) : null}
          <label className="crm-field">
            {item.kind === "noting" ? "Minute (what was noted)" : "Decision as it should read in the minutes"}
            <textarea className="crm-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={item.kind === "decision" ? "RESOLVED that…" : "The Board noted…"} />
          </label>
          {item.kind === "decision" && !item.approve_minutes_of && outcome === "approved" ? (
            <div className="crm-field">
              Actions (R-G2 — each owner gets a task)
              {actions.map((a, i) => (
                <div key={i} className="crm-row">
                  <input className="crm-input" style={{ flex: 2 }} value={a.description} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="Action" />
                  <Select style={{ flex: 1 }} value={a.owner} onChange={(val) => setActions(actions.map((x, j) => (j === i ? { ...x, owner: val } : x)))} block>
                    {DEMO_STAFF.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </Select>
                  <input className="crm-input" style={{ width: 150 }} type="date" value={a.due} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="crm-link" onClick={() => setActions([...actions, { description: "", owner: DEMO_STAFF[1].name, due: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) }])}>
                + Add action
              </button>
            </div>
          ) : null}
          {err ? <p className="eo-error">{err}</p> : null}
          <button
            type="button"
            className="crm-btn crm-btn--pri"
            onClick={() => {
              setErr(null);
              void recordItemDecision(m.id, item.id, { outcome: item.kind === "noting" ? "noted" : outcome, text, votes: item.kind === "decision" && !item.approve_minutes_of ? votes : {}, actions: actions.filter((a) => a.description.trim()), title }, actor)
                .then(() => onDone(item.approve_minutes_of && outcome === "approved" ? "Previous minutes approved." : item.kind === "decision" ? "Decision recorded and resolution created." : "Recorded."))
                .catch((e: Error) => setErr(e.message));
            }}
          >
            {item.kind === "decision" && !item.approve_minutes_of ? "Record decision & create resolution" : "Record"}
          </button>
        </div>
      ) : (
        <p className="crm-small">{disabled ? "Open the meeting to record this item." : "Click to take this item."}</p>
      )}
    </div>
  );
}

/* ---------------- minutes editor (G1) ---------------- */

export function MinutesEditorPage() {
  const { id = "" } = useParams();
  const actor = useStaffActor();
  const res = useGov(() => getMeeting(id), [id]);
  const [toast, show] = useCrmToast();
  const [draft, setDraft] = useState<{ general: string; items: Record<string, string> } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (res.data?.meeting.minutes && draft === null) setDraft({ general: res.data.meeting.minutes.general, items: { ...res.data.meeting.minutes.items } });
  }, [res.data, draft]);

  // Autosave every few seconds while editing.
  useEffect(() => {
    if (!draft || res.data?.meeting.state !== "Minutes draft") return;
    const stored = res.data.meeting.minutes;
    if (stored && stored.general === draft.general && JSON.stringify(stored.items) === JSON.stringify({ ...stored.items, ...draft.items })) return;
    const t = window.setTimeout(() => {
      void saveMinutes(id, draft, actor).then(() => setSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [draft, id, actor, res.data]);

  return (
    <Gate res={res} what="Meeting">
      {(b) => {
        const m = b.meeting;
        const editable = m.state === "Minutes draft";
        const acts = meetingActions(m.id, actor).filter((a) => ["start_minutes", "submit_minutes", "return_minutes", "approve_minutes"].includes(a.action));
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-ws__head">
              <div>
                <Link to={`/board/meetings/${m.id}`} className="crm-ws__back">
                  <Icon name="i-cleft" /> {m.title}
                </Link>
                <h2>Minutes</h2>
                <div className="crm-row">
                  <WfPill def={MEETING_DEF} state={m.state} />
                  {saved && editable ? <span className="crm-small">Saved {saved}</span> : null}
                </div>
              </div>
              <div className="crm-ws__actions">
                <Link className="crm-btn" to={`/print/minutes/${m.id}`} target="_blank">
                  <Icon name="i-download" /> Print
                </Link>
                <ActionBar
                  actions={acts}
                  state={m.state}
                  onAct={async (a, input) => {
                    if (draft && editable) await saveMinutes(m.id, draft, actor);
                    await actOnMeeting(m.id, a.action, actor, input);
                    if (a.action === "start_minutes") setDraft(null);
                    show(`${a.label}: done.`);
                  }}
                />
              </div>
            </div>
            {["Scheduled", "Pack issued"].includes(m.state) ? <CrmBanner tone="info">Minutes open once the meeting is held. Use Run meeting on the day.</CrmBanner> : null}
            {m.state === "Held" ? <CrmBanner tone="info">Start the minutes — the draft is pre-filled from the run log (attendance, declarations, decisions and votes).</CrmBanner> : null}
            {m.state === "Minutes submitted" ? (
              <CrmBanner tone="lock">
                Submitted and frozen. They're approved at the next meeting of the {b.body.name}
                {b.next ? (
                  <>
                    {" "}
                    (<Link to={`/board/meetings/${b.next.id}/run`}>{b.next.title}</Link>)
                  </>
                ) : null}
                .
              </CrmBanner>
            ) : null}
            {m.state === "Minutes approved" ? <CrmBanner tone="ok">Approved at {m.minutes?.approved_at_meeting} on {fmtDay(m.minutes?.approved_at)}. This is a gate document and can no longer change.</CrmBanner> : null}
            {m.minutes && draft ? (
              <div className="crm-card">
                <label className="crm-field">
                  Opening, attendance and declarations
                  <textarea className="crm-textarea" style={{ minHeight: 120 }} disabled={!editable} value={draft.general} onChange={(e) => setDraft({ ...draft, general: e.target.value })} />
                </label>
                {m.agenda.map((it, i) => (
                  <label key={it.id} className="crm-field" style={{ marginTop: 14 }}>
                    {i + 1}. {it.title}
                    {it.decision ? <span className="hint">Run log: {it.decision.outcome}{it.decision.resolution_id ? ` → ${it.decision.resolution_id}` : ""}</span> : <span className="hint">No decision recorded in the run log.</span>}
                    <textarea className="crm-textarea" disabled={!editable} value={draft.items[it.id] ?? ""} onChange={(e) => setDraft({ ...draft, items: { ...draft.items, [it.id]: e.target.value } })} />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}
