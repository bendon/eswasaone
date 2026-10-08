/**
 * Pack builder v2 (G9): versions with frozen snapshots, "what changed", section editor / upload per
 * owner, readiness gate, issue (gate artefact), "Remind owner" with the exact message.
 */
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { CrmBanner, CrmDrawer, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  actOnPack,
  addSection,
  getPack,
  listMeetings,
  moveSection,
  PACK_DEF,
  packActions,
  packIssuePreview,
  reminderPreview,
  remindOwner,
  updateSection,
  type Pack,
  type PackSection,
} from "@eswasaone/shared-ui/governance";
import { MessagePreview } from "@eswasaone/shared-ui/notify";
import { BriefingDrawer } from "./Briefing";
import { HistoryTimeline } from "@eswasaone/shared-ui/record";
import { DEMO_STAFF } from "@eswasaone/shared-ui/tasks";
import { ActionBar, ReasonDialog } from "@eswasaone/shared-ui/workflow";
import { Bar, fmtDay, fmtDayTime, Gate, useGov, useStaffActor, WfPill } from "./ui";

/** /board/pack — pick the meeting (defaults to the next one). */
export function PackIndex() {
  const res = useGov(() => listMeetings());
  const nav = useNavigate();
  return (
    <Gate res={res} what="Meetings">
      {(ms) => {
        const upcoming = ms.filter((m) => ["Scheduled", "Pack issued"].includes(m.state)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        const next = upcoming.find((m) => m.body_id === "BOARD") ?? upcoming[0];
        return (
          <div className="crm-stack">
            <div className="crm-row">
              <span className="crm-small">Choose a meeting:</span>
              <select className="crm-select" style={{ width: "auto" }} defaultValue="" onChange={(e) => e.target.value && nav(`/board/pack/${e.target.value}`)} aria-label="Meeting">
                <option value="" disabled>
                  Meeting…
                </option>
                {ms.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} — {fmtDay(m.scheduled_at)}
                  </option>
                ))}
              </select>
            </div>
            {next ? <PackBuilder meetingId={next.id} /> : <p className="crm-muted">No upcoming meetings.</p>}
          </div>
        );
      }}
    </Gate>
  );
}

export function PackBuilderPage() {
  const { meetingId = "" } = useParams();
  return <PackBuilder meetingId={meetingId} />;
}

function PackBuilder({ meetingId }: { meetingId: string }) {
  const actor = useStaffActor();
  const res = useGov(() => getPack(meetingId), [meetingId]);
  const [toast, show] = useCrmToast();
  const [edit, setEdit] = useState<PackSection | null>(null);
  const [remind, setRemind] = useState<PackSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [diff, setDiff] = useState<number | null>(null);
  const [brief, setBrief] = useState<number | null>(null);
  const [view, setView] = useState<number | null>(null);

  return (
    <Gate res={res} what="Board pack">
      {({ pack, meeting, body }) => {
        const inc = pack.sections.filter((s) => s.included);
        const ready = inc.filter((s) => s.status === "ready").length;
        const acts = packActions(pack.id, actor);
        const locked = pack.state === "Issued";
        const issuePrev = packIssuePreview(pack.id);
        return (
          <div className="crm-stack">
            {toast}
            <div className="crm-ws__head">
              <div>
                <Link to={`/board/meetings/${meeting.id}`} className="crm-ws__back">
                  <Icon name="i-cleft" /> {meeting.title}
                </Link>
                <h2>Board pack — {meeting.title}</h2>
                <div className="crm-row">
                  <WfPill def={PACK_DEF} state={pack.state} />
                  <span className="crm-small">
                    {ready}/{inc.length} sections Ready · {pack.versions.length} version(s){pack.issued_version ? ` · v${pack.issued_version} issued` : ""} · meeting {fmtDayTime(meeting.scheduled_at)}
                  </span>
                </div>
              </div>
              <div className="crm-ws__actions">
                <ActionBar
                  actions={acts}
                  state={pack.state}
                  preview={(a) => (a.action === "issue" && issuePrev ? issuePrev : null)}
                  onAct={async (a, input) => {
                    await actOnPack(pack.id, a.action, actor, input);
                    show(a.action === "assemble" ? "New version assembled — figures snapshotted." : a.action === "issue" ? "Pack issued — members notified." : `${a.label}: done.`);
                  }}
                />
              </div>
            </div>
            <Bar pct={inc.length ? Math.round((ready / inc.length) * 100) : 0} tone={ready === inc.length ? "green" : "amber"} />
            {locked ? <CrmBanner tone="lock">v{pack.issued_version} is issued and frozen. To change it, supersede it with a new version (members are told why).</CrmBanner> : null}

            <div className="crm-grid crm-grid--main">
              <div className="crm-card crm-card--flush">
                <div className="crm-card__h">
                  <h3>Sections</h3>
                  <p>Owners write or upload their section from their Approvals task; live module sections fill themselves at assembly.</p>
                  {!locked ? (
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => setAdding(true)}>
                      <Icon name="i-plus" /> Section
                    </button>
                  ) : null}
                </div>
                <div className="crm-table-wrap">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Section</th>
                        <th>Owner</th>
                        <th>Due</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pack.sections.map((s, i) => (
                        <tr key={s.id} style={s.included ? undefined : { opacity: 0.5 }}>
                          <td>
                            <div className="crm-stack" style={{ gap: 2 }}>
                              <button type="button" className="crm-link" disabled={locked || i === 0} onClick={() => void moveSection(pack.id, s.id, -1)} aria-label="Move up">
                                ↑
                              </button>
                              <button type="button" className="crm-link" disabled={locked || i === pack.sections.length - 1} onClick={() => void moveSection(pack.id, s.id, 1)} aria-label="Move down">
                                ↓
                              </button>
                            </div>
                          </td>
                          <td>
                            <b>{s.title}</b>
                            <span className="crm-small">
                              {s.source === "live_module" ? `Live: ${s.module}` : s.source}
                              {s.restricted ? " · restricted (hidden from conflicted members)" : ""}
                              {s.file ? ` · ${s.file}` : ""}
                            </span>
                          </td>
                          <td>{s.owner}</td>
                          <td>
                            {fmtDay(s.due)}
                            {s.status !== "ready" && new Date(s.due) < new Date() ? <span className="crm-pill crm-pill--red">Late</span> : null}
                          </td>
                          <td>
                            <span className={`crm-pill crm-pill--${s.status === "ready" ? "green" : s.status === "draft" ? "amber" : "slate"}`}>{s.status === "awaiting" ? "Awaiting owner" : s.status}</span>
                          </td>
                          <td className="num">
                            {!locked ? (
                              <>
                                <button type="button" className="crm-link" onClick={() => setEdit(s)}>
                                  Edit
                                </button>
                                {s.status !== "ready" && s.source !== "live_module" ? (
                                  <>
                                    {" · "}
                                    <button type="button" className="crm-link" onClick={() => setRemind(s)}>
                                      Remind
                                    </button>
                                  </>
                                ) : null}
                                {" · "}
                                <button type="button" className="crm-link" onClick={() => void updateSection(pack.id, s.id, { included: !s.included }, actor)}>
                                  {s.included ? "Exclude" : "Include"}
                                </button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="crm-ws__rail">
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Versions</h3>
                  </div>
                  {!pack.versions.length ? (
                    <p className="crm-small">Nothing assembled yet. Assembly freezes live figures as v1.</p>
                  ) : (
                    <ul className="eo-notes">
                      {[...pack.versions].reverse().map((v) => (
                        <li key={v.v} className="eo-note">
                          <div style={{ flex: 1 }}>
                            <b>
                              v{v.v} {pack.issued_version === v.v ? <span className="crm-pill crm-pill--green">Issued</span> : null}
                            </b>
                            <span className="crm-small" style={{ display: "block" }}>
                              {fmtDayTime(v.assembled_at)} · {v.by}
                              {v.note ? ` · ${v.note}` : ""}
                            </span>
                            <div className="crm-row" style={{ marginTop: 4 }}>
                              <button type="button" className="crm-link" onClick={() => setView(v.v)}>
                                Read
                              </button>
                              <button type="button" className="crm-link" onClick={() => setBrief(v.v)}>
                                Briefing
                              </button>
                              {v.v > 1 ? (
                                <button type="button" className="crm-link" onClick={() => setDiff(v.v)}>
                                  What changed
                                </button>
                              ) : null}
                              <Link className="crm-link" to={`/print/pack/${pack.id}?v=${v.v}`} target="_blank">
                                Print
                              </Link>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>Rules</h3>
                  </div>
                  <ul className="crm-small" style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Issue only when every included section is Ready, the agenda is final and notice is satisfied.</li>
                    <li>Pack at least {body.pack_days} days before the meeting ({fmtDay(new Date(new Date(meeting.scheduled_at).getTime() - body.pack_days * 86_400_000).toISOString())}).</li>
                    <li>Issued versions are never edited — supersede instead.</li>
                  </ul>
                </div>
                <div className="crm-card">
                  <div className="crm-card__h">
                    <h3>History</h3>
                  </div>
                  <HistoryTimeline events={pack.history} />
                </div>
              </div>
            </div>

            {edit ? <SectionEditor pack={pack} section={edit} onClose={() => setEdit(null)} onSaved={(m) => (setEdit(null), show(m))} /> : null}
            {remind ? (
              <ReasonDialog
                title={`Remind ${remind.owner}`}
                consequence="Sends a reminder by email and to their Approvals bell."
                confirmLabel="Send reminder"
                onClose={() => setRemind(null)}
                onSubmit={async () => {
                  await remindOwner(pack.id, remind.id, actor);
                  setRemind(null);
                  show(`Reminder sent to ${remind.owner}.`);
                }}
              >
                {(() => {
                  const p = reminderPreview(pack.id, remind.id);
                  return p ? <MessagePreview message={p} /> : null;
                })()}
              </ReasonDialog>
            ) : null}
            {adding ? <AddSection pack={pack} due={new Date(new Date(meeting.scheduled_at).getTime() - (body.pack_days + 3) * 86_400_000).toISOString()} onClose={() => setAdding(false)} /> : null}
            {diff ? <DiffDrawer pack={pack} v={diff} onClose={() => setDiff(null)} /> : null}
            {brief ? <BriefingDrawer packId={pack.id} v={brief} includeRestricted onClose={() => setBrief(null)} /> : null}
            {view ? <VersionDrawer pack={pack} v={view} onClose={() => setView(null)} /> : null}
          </div>
        );
      }}
    </Gate>
  );
}

function SectionEditor({ pack, section, onClose, onSaved }: { pack: Pack; section: PackSection; onClose: () => void; onSaved: (msg: string) => void }) {
  const actor = useStaffActor();
  const [f, setF] = useState({ title: section.title, owner: section.owner, due: section.due.slice(0, 10), content: section.content ?? "", file: section.file ?? "", restricted: section.restricted });
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = (status?: PackSection["status"]) => {
    setErr(null);
    void updateSection(pack.id, section.id, { title: f.title, owner: f.owner, due: new Date(f.due).toISOString(), content: f.content, file: f.file || undefined, restricted: f.restricted, ...(status ? { status } : f.content || f.file ? { status: section.status === "ready" ? "ready" : "draft" } : {}) }, actor)
      .then(() => onSaved(status === "ready" ? "Section marked Ready." : "Section saved."))
      .catch((e: Error) => setErr(e.message));
  };
  return (
    <CrmDrawer
      open
      wide
      title={section.title}
      subtitle={section.source === "live_module" ? `Live module section (${section.module}) — figures are frozen into the snapshot when you assemble.` : `Owner: ${section.owner}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="crm-btn" onClick={() => save()}>
            Save draft
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => save("ready")}>
            Save & mark Ready
          </button>
        </>
      }
    >
      <div className="crm-form">
        <div className="crm-form crm-form--2">
          <label className="crm-field">
            Title
            <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="crm-field">
            Owner
            <select className="crm-select" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
              {[f.owner, ...DEMO_STAFF.map((s) => s.name).filter((n) => n !== f.owner)].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="crm-field">
            Due
            <input className="crm-input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </label>
          <label className="crm-check" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={f.restricted} onChange={(e) => setF({ ...f, restricted: e.target.checked })} /> Restricted (hidden from members with a declared conflict)
          </label>
        </div>
        {section.source !== "live_module" ? (
          <>
            <label className="crm-field">
              Section text
              <textarea className="crm-textarea" style={{ minHeight: 220 }} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="Write the paper here, or upload it below." />
            </label>
            <div className="crm-row">
              <button type="button" className="crm-btn crm-btn--sm" onClick={() => input.current?.click()}>
                <Icon name="i-clip" /> {f.file ? "Replace paper" : "Upload paper"}
              </button>
              <input ref={input} type="file" hidden onChange={(e) => setF({ ...f, file: e.target.files?.[0]?.name ?? f.file })} />
              {f.file ? <span className="crm-pill crm-pill--outline">{f.file}</span> : null}
            </div>
          </>
        ) : (
          <CrmBanner tone="info">This section is generated from {section.module} data when the pack is assembled. Mark it Ready once the owner has checked the figures.</CrmBanner>
        )}
        {err ? <p className="eo-error">{err}</p> : null}
      </div>
    </CrmDrawer>
  );
}

function AddSection({ pack, due, onClose }: { pack: Pack; due: string; onClose: () => void }) {
  const actor = useStaffActor();
  const [f, setF] = useState({ title: "", owner: DEMO_STAFF[0].name, source: "upload" as PackSection["source"], due: due.slice(0, 10) });
  const [err, setErr] = useState<string | null>(null);
  return (
    <ReasonDialog
      title="Add section"
      consequence="The owner gets an Approvals task with the due date."
      confirmLabel="Add section"
      canSubmit={Boolean(f.title.trim())}
      onClose={onClose}
      onSubmit={async () => {
        try {
          await addSection(pack.id, { ...f, due: new Date(f.due).toISOString() }, actor);
          onClose();
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
          throw e;
        }
      }}
    >
      <label className="crm-field">
        Title
        <input className="crm-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </label>
      <label className="crm-field">
        Owner
        <select className="crm-select" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
          {DEMO_STAFF.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <div className="crm-form crm-form--2">
        <label className="crm-field">
          Source
          <select className="crm-select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as PackSection["source"] })}>
            <option value="upload">Upload</option>
            <option value="written">Written</option>
          </select>
        </label>
        <label className="crm-field">
          Due
          <input className="crm-input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </label>
      </div>
      {err ? <p className="eo-error">{err}</p> : null}
    </ReasonDialog>
  );
}

function wordDiff(a: string, b: string) {
  const aw = a.split(/\s+/);
  const bw = b.split(/\s+/);
  const setA = new Set(aw);
  const setB = new Set(bw);
  return (
    <>
      {aw.filter((w) => !setB.has(w)).length ? <del>{aw.filter((w) => !setB.has(w)).join(" ")}</del> : null} {bw.map((w, i) => (setA.has(w) ? `${w} ` : <ins key={i}>{w} </ins>))}
    </>
  );
}

function DiffDrawer({ pack, v, onClose }: { pack: Pack; v: number; onClose: () => void }) {
  const cur = pack.versions.find((x) => x.v === v);
  const prev = pack.versions.find((x) => x.v === v - 1);
  const rows = useMemo(() => {
    if (!cur || !prev) return [];
    const ids = new Set([...cur.sections.map((s) => s.id), ...prev.sections.map((s) => s.id)]);
    return [...ids].map((id) => ({ id, a: prev.sections.find((s) => s.id === id), b: cur.sections.find((s) => s.id === id) })).filter((r) => r.a?.content !== r.b?.content || JSON.stringify(r.a?.figures) !== JSON.stringify(r.b?.figures));
  }, [cur, prev]);
  return (
    <CrmDrawer open wide title={`What changed — v${v - 1} → v${v}`} onClose={onClose}>
      {!rows.length ? <p className="crm-muted">No differences in section text or figures.</p> : null}
      {rows.map((r) => (
        <div key={r.id} className="crm-card eo-diff">
          <b>{r.b?.title ?? r.a?.title}</b>
          {!r.a ? <p className="crm-small">Added in v{v}</p> : !r.b ? <p className="crm-small">Removed in v{v}</p> : null}
          <p style={{ lineHeight: 1.6 }}>{wordDiff(r.a?.content ?? "", r.b?.content ?? "")}</p>
          {r.b?.figures ? (
            <p className="crm-small">
              {Object.entries(r.b.figures).map(([k, val]) => `${k}: ${r.a?.figures?.[k] ?? "—"} → ${val}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ))}
    </CrmDrawer>
  );
}

function VersionDrawer({ pack, v, onClose }: { pack: Pack; v: number; onClose: () => void }) {
  const snap = pack.versions.find((x) => x.v === v);
  return (
    <CrmDrawer open wide title={`Pack v${v} (frozen ${fmtDayTime(snap?.assembled_at)})`} onClose={onClose}>
      {snap?.sections.map((s) => (
        <div key={s.id}>
          <h4 style={{ margin: "0 0 4px" }}>
            {s.title} {s.restricted ? <span className="crm-pill crm-pill--purple">Restricted</span> : null}
          </h4>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{s.content || <span className="crm-muted">(empty)</span>}</p>
          {s.figures && Object.keys(s.figures).length ? (
            <div className="crm-row" style={{ marginTop: 6 }}>
              {Object.entries(s.figures).map(([k, val]) => (
                <span key={k} className="crm-pill crm-pill--outline">
                  {k}: <b>{val}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </CrmDrawer>
  );
}
