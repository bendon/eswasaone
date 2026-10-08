/**
 * Board member area (gap 03 G4) — /institution/member/*. Board members are not Desk users: they get a
 * minimal shell (no staff sidebar) with issued packs, votes, minutes, declarations and their profile.
 * TODO: wire real — member session from Core (/auth/me with role "Eswasa Board Member").
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { BrandLogo, DialogProvider, getDemoPersona, Icon, me } from "@eswasaone/shared-ui";
import { CrmBanner, useCrmToast } from "@eswasaone/shared-ui/crm";
import {
  BOARD_MEMBER_NAMES,
  castVote,
  EVALUATION_QUESTIONS,
  evaluationResults,
  getMeeting,
  getNote,
  listDeclarations,
  listMembers,
  MEETING_DEF,
  memberHome,
  recordDeclaration,
  RESOLUTION_DEF,
  saveMember,
  saveNote,
  setAttendance,
  submitEvaluation,
  tally,
  type GovMember,
  type Vote,
} from "@eswasaone/shared-ui/governance";
import { listNotifications, markNotificationRead } from "@eswasaone/shared-ui/notify";
import { DeclarationForm } from "./RegisterViews";
import { fmtDay, fmtDayTime, Gate, useGov, VOTE_LABEL, WfPill } from "./ui";

const MEMBER_KEY = "eswasaone.demo.member";

type MemberCtx = { name: string; switchTo: (n: string | null) => void };
const Ctx = createContext<MemberCtx>({ name: "", switchTo: () => undefined });
const useMember = () => useContext(Ctx);

export function MemberLayout() {
  const [name, setName] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(MEMBER_KEY);
    } catch {
      return null;
    }
  });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (name) return setChecked(true);
    const p = getDemoPersona();
    if (p && BOARD_MEMBER_NAMES.includes(p.full_name)) {
      setName(p.full_name);
      return setChecked(true);
    }
    void me()
      .then((u) => {
        if (u && BOARD_MEMBER_NAMES.includes(u.full_name)) setName(u.full_name);
      })
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, [name]);

  const switchTo = (n: string | null) => {
    try {
      if (n) sessionStorage.setItem(MEMBER_KEY, n);
      else sessionStorage.removeItem(MEMBER_KEY);
    } catch {
      /* ignore */
    }
    setName(n);
  };

  if (!checked) return null;
  return (
    <DialogProvider>
      <div className="eo-member">
        <header className="eo-member__top">
          <span className="eo-member__brand">
            <BrandLogo variant="mark" /> Board member area
          </span>
          {name ? (
            <nav aria-label="Member">
              <NavLink to="/member" end>
                Home
              </NavLink>
              <NavLink to="/member/votes">Votes</NavLink>
              <NavLink to="/member/minutes">Minutes</NavLink>
              <NavLink to="/member/declarations">Declarations</NavLink>
              <NavLink to="/member/evaluation">Evaluation</NavLink>
              <NavLink to="/member/profile">Profile</NavLink>
            </nav>
          ) : null}
          <span className="crm-spacer" />
          {name ? (
            <span className="crm-row crm-small">
              <b>{name}</b>
              <button type="button" className="crm-link" onClick={() => switchTo(null)}>
                Sign out
              </button>
            </span>
          ) : null}
        </header>
        <main className="eo-member__main">{name ? <Ctx.Provider value={{ name, switchTo }}>
          <Outlet />
        </Ctx.Provider> : <MemberSignIn onPick={switchTo} />}</main>
      </div>
    </DialogProvider>
  );
}

function MemberSignIn({ onPick }: { onPick: (n: string) => void }) {
  return (
    <div className="crm-card" style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2 style={{ marginTop: 0 }}>Board member sign-in</h2>
      <p className="crm-muted">Members sign in with the account ESWASA issued for board papers. Until member accounts are connected, choose a member to try the area.</p>
      <div className="eo-pick">
        {BOARD_MEMBER_NAMES.map((n) => (
          <button key={n} type="button" onClick={() => onPick(n)}>
            <b>{n}</b>
            <em>Continue</em>
          </button>
        ))}
      </div>
      <p className="crm-small" style={{ marginTop: 12 }}>
        Staff: <Link to="/board">back to Board & Governance</Link>
      </p>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="crm-card">
      <div className="crm-card__h">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function MemberHome() {
  const { name } = useMember();
  const res = useGov(async () => ({ home: await memberHome(name), notes: listNotifications("member", { name }) }), [name]);
  return (
    <Gate res={res} what="Member area">
      {({ home, notes }) => {
        const toVote = home.votes.filter((r) => r.state === "Circulated" && !r.votes[name]);
        return (
          <div className="crm-stack">
            <h2 style={{ margin: 0 }}>Welcome, {name.split(" ").slice(-1)[0]}</h2>
            {home.declarationDue ? (
              <CrmBanner>
                Your annual declaration of interest for {new Date().getFullYear()} is due. <Link to="/member/declarations">File it now</Link>.
              </CrmBanner>
            ) : null}
            {toVote.length ? (
              <CrmBanner tone="info">
                {toVote.length} written resolution(s) waiting for your vote. <Link to="/member/votes">Vote</Link>.
              </CrmBanner>
            ) : null}
            <div className="crm-grid crm-grid--2">
              <Section title="Next meeting">
                {home.next ? (
                  <div className="crm-stack" style={{ gap: 6 }}>
                    <b style={{ fontSize: 16 }}>{home.next.title}</b>
                    <span className="crm-small">
                      {fmtDayTime(home.next.scheduled_at)} · {home.next.venue}
                    </span>
                    <WfPill def={MEETING_DEF} state={home.next.state} audience="member" />
                    <RsvpControl meetingId={home.next.id} current={home.next.attendance[name]?.rsvp ?? "pending"} />
                    <Link className="crm-btn crm-btn--sm crm-btn--pri" style={{ alignSelf: "flex-start" }} to={`/member/meetings/${home.next.id}`}>
                      Agenda and papers
                    </Link>
                  </div>
                ) : (
                  <p className="crm-muted">No meeting scheduled.</p>
                )}
              </Section>
              <Section title="Packs to read">
                {!home.packs.length ? (
                  <p className="crm-muted">No issued packs yet.</p>
                ) : (
                  <ul className="eo-notes">
                    {home.packs.slice(0, 4).map(({ meeting, pack }) => (
                      <li key={pack.id} className="eo-note">
                        <div>
                          <Link to={`/member/meetings/${meeting.id}`}>
                            <b>{meeting.title}</b>
                          </Link>
                          <span className="crm-small">
                            Pack v{pack.issued_version} · {fmtDay(meeting.scheduled_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
            <Section title="Messages">
              {!notes.length ? (
                <p className="crm-muted">No messages.</p>
              ) : (
                <ul className="eo-notes">
                  {notes.slice(0, 6).map((n) => (
                    <li key={n.id} className={`eo-note${n.read ? "" : " unread"}`} onClick={() => markNotificationRead(n.id)}>
                      <span className="eo-note__dot" />
                      <div>
                        <b>{n.title}</b>
                        <p style={{ whiteSpace: "pre-wrap" }}>{n.body.split("\n").slice(0, 4).join("\n")}</p>
                        <span className="crm-small">{fmtDayTime(n.at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        );
      }}
    </Gate>
  );
}

function RsvpControl({ meetingId, current }: { meetingId: string; current: "yes" | "no" | "pending" }) {
  const { name } = useMember();
  return (
    <div className="crm-seg" aria-label="Your attendance">
      {(["yes", "no"] as const).map((v) => (
        <button key={v} type="button" className={current === v ? "on" : ""} onClick={() => void setAttendance(meetingId, name, { rsvp: v, apology: v === "no" }, { name, roles: ["Eswasa Board Member"] })}>
          {v === "yes" ? "I'll attend" : "Send apology"}
        </button>
      ))}
    </div>
  );
}

export function MemberMeeting() {
  const { id = "" } = useParams();
  const { name } = useMember();
  const res = useGov(() => getMeeting(id), [id]);
  const [toast, show] = useCrmToast();
  const [conflict, setConflict] = useState<{ item: string; text: string } | null>(null);
  return (
    <Gate res={res} what="Meeting">
      {(b) => {
        const m = b.meeting;
        const pack = b.pack;
        const snap = pack?.issued_version ? pack.versions.find((v) => v.v === pack.issued_version) : undefined;
        const myConflicts = m.declarations.filter((d) => d.member === name && d.item_id).map((d) => d.item_id!);
        const hiddenSections = new Set(m.agenda.filter((a) => myConflicts.includes(a.id)).flatMap((a) => a.section_ids));
        return (
          <div className="crm-stack">
            {toast}
            <Link to="/member" className="crm-ws__back">
              <Icon name="i-cleft" /> Home
            </Link>
            <div className="crm-row">
              <h2 style={{ margin: 0 }}>{m.title}</h2>
              <WfPill def={MEETING_DEF} state={m.state} audience="member" />
            </div>
            <span className="crm-small">
              {fmtDayTime(m.scheduled_at)} · {m.venue}
              {m.online_link ? ` · ${m.online_link}` : ""}
            </span>
            {["Scheduled", "Pack issued"].includes(m.state) ? <RsvpControl meetingId={m.id} current={m.attendance[name]?.rsvp ?? "pending"} /> : null}
            <Section title="Agenda">
              <ol className="eo-agenda">
                {m.agenda.map((it, i) => (
                  <li key={it.id}>
                    <span className="eo-agenda__n">{i + 1}</span>
                    <div>
                      <b>{it.title}</b>
                      <span className="crm-small">
                        {it.kind} · {it.presenter}
                      </span>
                      {myConflicts.includes(it.id) ? <span className="crm-pill crm-pill--purple">You declared an interest — you'll be recused</span> : null}
                    </div>
                    {["Scheduled", "Pack issued"].includes(m.state) && !myConflicts.includes(it.id) ? (
                      <button type="button" className="crm-link" onClick={() => setConflict({ item: it.id, text: "" })}>
                        Declare a conflict
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Section>
            {snap ? (
              <div className="crm-card eo-watermark" data-mark={`${name} · CONFIDENTIAL`}>
                <div className="crm-card__h">
                  <h3>
                    Board pack v{snap.v} <span className="crm-small">issued {fmtDay(snap.assembled_at)}</span>
                  </h3>
                  <button type="button" className="crm-btn crm-btn--sm" onClick={() => window.print()}>
                    <Icon name="i-download" /> Print / save PDF (watermarked)
                  </button>
                </div>
                <div className="eo-reader">
                  <nav className="eo-reader__toc" aria-label="Contents">
                    {snap.sections.map((s, i) => (
                      <a key={s.id} href={`#sec-${s.id}`}>
                        {i + 1}. {s.title}
                      </a>
                    ))}
                  </nav>
                  <div>
                    {snap.sections.map((s, i) => (
                      <section key={s.id} id={`sec-${s.id}`} className="eo-reader__sec">
                        <h3>
                          {i + 1}. {s.title}
                        </h3>
                        {s.restricted && hiddenSections.has(s.id) ? (
                          <CrmBanner tone="lock">Withheld — you declared an interest on the agenda item this paper supports.</CrmBanner>
                        ) : (
                          <>
                            <p>{s.content || "(Paper attached)"}</p>
                            {s.figures && Object.keys(s.figures).length ? (
                              <div className="crm-row">
                                {Object.entries(s.figures).map(([k, v]) => (
                                  <span key={k} className="crm-pill crm-pill--outline">
                                    {k}: <b>{v}</b>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <PrivateNote packId={pack!.id} sectionId={s.id} />
                          </>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <CrmBanner tone="info">The pack hasn't been issued yet. You'll get a message when it is.</CrmBanner>
            )}
            {conflict ? (
              <div className="crm-card">
                <b>Declare a conflict on item {m.agenda.findIndex((a) => a.id === conflict.item) + 1}</b>
                <textarea className="crm-textarea" value={conflict.text} onChange={(e) => setConflict({ ...conflict, text: e.target.value })} placeholder="Describe your interest" />
                <div className="crm-row" style={{ marginTop: 8 }}>
                  <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setConflict(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="crm-btn crm-btn--pri"
                    disabled={!conflict.text.trim()}
                    onClick={() =>
                      void recordDeclaration({ member: name, kind: "meeting", meeting_id: m.id, item_id: conflict.item, interest: conflict.text, recorded_by: name }).then(() => {
                        setConflict(null);
                        show("Declared. The secretary will record you as recused on that item.");
                      })
                    }
                  >
                    Declare
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      }}
    </Gate>
  );
}

function PrivateNote({ packId, sectionId }: { packId: string; sectionId: string }) {
  const { name } = useMember();
  const [text, setText] = useState(() => getNote(name, packId, sectionId));
  const [open, setOpen] = useState(Boolean(text));
  useEffect(() => {
    const t = window.setTimeout(() => void saveNote(name, packId, sectionId, text), 600);
    return () => window.clearTimeout(t);
  }, [text, name, packId, sectionId]);
  return open ? (
    <label className="crm-field" style={{ marginTop: 8 }}>
      <span className="hint">Private note — only you can see this</span>
      <textarea className="crm-textarea" value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  ) : (
    <button type="button" className="crm-link" onClick={() => setOpen(true)}>
      + Private note
    </button>
  );
}

export function MemberVotes() {
  const { name } = useMember();
  const res = useGov(() => memberHome(name), [name]);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Gate res={res} what="Votes">
      {(home) => (
        <div className="crm-stack">
          <h2 style={{ margin: 0 }}>Written resolutions</h2>
          {err ? <p className="eo-error">{err}</p> : null}
          {!home.votes.length ? <p className="crm-muted">Nothing circulated to you.</p> : null}
          {home.votes.map((r) => {
            const mine = r.votes[name];
            const open = r.state === "Circulated";
            const t = tally(r);
            return (
              <div key={r.id} className="crm-card">
                <div className="crm-card__h">
                  <div>
                    <h3>{r.title}</h3>
                    <p>
                      {r.id} · {open ? `closes ${fmtDayTime(r.window?.closes)}` : `closed ${fmtDay(r.decided_at ?? r.window?.closes)}`}
                    </p>
                  </div>
                  <WfPill def={RESOLUTION_DEF} state={r.state} audience="member" />
                </div>
                <p style={{ lineHeight: 1.6 }}>{r.text}</p>
                {r.papers.length ? <p className="crm-small">Papers: {r.papers.join(", ")}</p> : null}
                {open ? (
                  <div className="eo-votes">
                    {(["for", "against", "abstain"] as Vote[]).map((v) => (
                      <button key={v} type="button" className={`${v}${mine === v ? " on" : ""}`} onClick={() => void castVote(r.id, name, v).then(() => setErr(null), (e: Error) => setErr(e.message))}>
                        {VOTE_LABEL[v]}
                      </button>
                    ))}
                    {mine ? <span className="crm-small">You voted {VOTE_LABEL[mine].toLowerCase()} — you can change it until the window closes.</span> : null}
                  </div>
                ) : (
                  <p className="crm-small">
                    Result: {t.for} for · {t.against} against · {t.abstain} abstain. {mine ? `You voted ${VOTE_LABEL[mine].toLowerCase()}.` : "You didn't vote."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Gate>
  );
}

export function MemberMinutes() {
  const { name } = useMember();
  const res = useGov(() => memberHome(name), [name]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Gate res={res} what="Minutes">
      {(home) => (
        <div className="crm-stack">
          <h2 style={{ margin: 0 }}>Minutes</h2>
          {home.minutes.map((m) => (
            <div key={m.id} className="crm-card">
              <div className="crm-card__h">
                <div>
                  <h3>{m.title}</h3>
                  <p>{fmtDay(m.scheduled_at)}</p>
                </div>
                <WfPill def={MEETING_DEF} state={m.state} audience="member" />
                <button type="button" className="crm-link" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  {open === m.id ? "Hide" : "Read"}
                </button>
              </div>
              {open === m.id && m.minutes ? (
                <div className="crm-stack" style={{ gap: 8 }}>
                  {m.state !== "Minutes approved" ? <CrmBanner tone="info">Draft — for approval at the next meeting.</CrmBanner> : null}
                  <p style={{ margin: 0 }}>{m.minutes.general}</p>
                  {m.agenda.map((it, i) => (
                    <p key={it.id} style={{ margin: 0 }}>
                      <b>
                        {i + 1}. {it.title}.
                      </b>{" "}
                      {m.minutes!.items[it.id]}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Gate>
  );
}

export function MemberDeclarations() {
  const { name } = useMember();
  const res = useGov(async () => (await listDeclarations()).filter((d) => d.member === name), [name]);
  const [open, setOpen] = useState(false);
  return (
    <Gate res={res} what="Declarations">
      {(list) => (
        <div className="crm-stack">
          <div className="crm-row">
            <h2 style={{ margin: 0 }}>My declarations</h2>
            <span className="crm-spacer" />
            <button type="button" className="crm-btn crm-btn--gold" onClick={() => setOpen(true)}>
              File a declaration
            </button>
          </div>
          {!list.some((d) => d.kind === "annual" && d.period === String(new Date().getFullYear())) ? <CrmBanner>Your {new Date().getFullYear()} annual declaration is due.</CrmBanner> : null}
          {list.map((d) => (
            <div key={d.id} className="crm-card">
              <b>{d.kind === "annual" ? `Annual ${d.period}` : d.kind === "gift" ? "Gift / hospitality" : `Meeting ${d.meeting_id}`}</b>
              <p style={{ margin: "4px 0" }}>{d.interest}</p>
              <span className="crm-small">{fmtDay(d.at)}</span>
            </div>
          ))}
          {open ? <DeclarationForm members={[name]} fixedMember={name} by={name} onClose={() => setOpen(false)} /> : null}
        </div>
      )}
    </Gate>
  );
}

export function MemberEvaluation() {
  const { name } = useMember();
  const res = useGov(() => evaluationResults(), []);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  return (
    <Gate res={res} what="Evaluation">
      {(r) =>
        r.submitted.includes(name) ? (
          <CrmBanner tone="ok">Thank you — your {new Date().getFullYear()} evaluation is in. Results are shared with the Chair once everyone has responded ({r.responses} of {r.eligible} so far).</CrmBanner>
        ) : (
          <div className="crm-card">
            <h2 style={{ marginTop: 0 }}>Board evaluation {new Date().getFullYear()}</h2>
            <p className="crm-muted">Anonymous in the aggregate. 1 = strongly disagree, 5 = strongly agree.</p>
            {EVALUATION_QUESTIONS.map((q) => (
              <div key={q} className="crm-row" style={{ justifyContent: "space-between", margin: "10px 0" }}>
                <span>{q}</span>
                <div className="crm-seg">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={scores[q] === n ? "on" : ""} onClick={() => setScores({ ...scores, [q]: n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="crm-field">
              Comment (optional)
              <textarea className="crm-textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <button type="button" className="crm-btn crm-btn--pri" style={{ marginTop: 10 }} disabled={Object.keys(scores).length < EVALUATION_QUESTIONS.length} onClick={() => void submitEvaluation(name, scores, comment)}>
              Submit
            </button>
          </div>
        )
      }
    </Gate>
  );
}

export function MemberProfile() {
  const { name } = useMember();
  const res = useGov(async () => (await listMembers()).find((m) => m.name === name) ?? null, [name]);
  const [toast, show] = useCrmToast();
  return (
    <Gate res={res} what="Profile">
      {(m: GovMember) => (
        <ProfileForm m={m} onSaved={() => show("Preferences saved.")} toast={toast} />
      )}
    </Gate>
  );
}

function ProfileForm({ m, onSaved, toast }: { m: GovMember; onSaved: () => void; toast: ReactNode }) {
  const [prefs, setPrefs] = useState(m.prefs ?? { email: true, sms: false });
  const [phone, setPhone] = useState(m.phone ?? "");
  const bodies = useMemo(() => m.bodies.join(", "), [m.bodies]);
  return (
    <div className="crm-card" style={{ maxWidth: 640 }}>
      {toast}
      <h2 style={{ marginTop: 0 }}>{m.name}</h2>
      <dl className="crm-kv">
        <dt>Role</dt>
        <dd>{m.role}</dd>
        <dt>Title</dt>
        <dd>{m.title}</dd>
        <dt>Bodies</dt>
        <dd>{bodies}</dd>
        <dt>Term</dt>
        <dd>
          {fmtDay(m.term_start)} – {fmtDay(m.term_end)}
        </dd>
        <dt>Email</dt>
        <dd>{m.email}</dd>
      </dl>
      <h3>Contact preferences</h3>
      <label className="crm-check">
        <input type="checkbox" checked={prefs.email} onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })} /> Email me when a pack is issued or a vote opens
      </label>
      <label className="crm-check">
        <input type="checkbox" checked={prefs.sms} onChange={(e) => setPrefs({ ...prefs, sms: e.target.checked })} /> SMS reminders
      </label>
      <label className="crm-field" style={{ marginTop: 10 }}>
        Mobile
        <input className="crm-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+268 …" />
      </label>
      <button type="button" className="crm-btn crm-btn--pri" style={{ marginTop: 12 }} onClick={() => void saveMember({ ...m, prefs, phone }).then(onSaved)}>
        Save
      </button>
    </div>
  );
}
