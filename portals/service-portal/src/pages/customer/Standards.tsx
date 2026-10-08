/**
 * Customer / stakeholder standards pages (gap 06 S3, S5, S6, S9, S12): "Have your say" drafts with
 * clause-by-clause comments, new work proposals, TC directory and membership applications, my comments
 * and proposals with dispositions, standards alerts, and the TC member area with ballot voting.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon, Select } from "@eswasaone/shared-ui";
import {
  applyToTc,
  castVote,
  DISPOSITION_LABEL,
  getBallot,
  getTc,
  getWorkItem,
  listComments,
  listProposals,
  listSubscriptions,
  listTcs,
  myBallots,
  myCommittees,
  openDrafts,
  PROPOSAL_DEF,
  submitComments,
  submitProposal,
  subscribe,
  tallyBallot,
  unsubscribe,
  VOTE_LABEL,
  type DraftComment,
  type MemberCategory,
  type Subscription,
  type Vote,
} from "@eswasaone/shared-ui/standards";
import { displayState } from "@eswasaone/shared-ui/workflow";
import { fmtD, Loadable, Panel, PublicPage, Toast, useCustomer, useCustomerData, useMsg } from "./ui";

const daysLeft = (iso?: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : 0);

export function DraftsPage() {
  const res = useCustomerData(() => openDrafts(), []);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Standards", to: "/standards" }, { label: "Have your say" }]} title="Have your say on draft standards" lead="Draft Eswatini standards open for public comment. Read the draft and comment clause by clause — every comment gets a written response from the technical committee.">
      <div className="crm-row" style={{ marginBottom: 14 }}>
        <Link className="cf-btn cf-btn--ghost" to="/standards/propose">
          Propose a new standard
        </Link>
        <Link className="cf-btn cf-btn--ghost" to="/standards/committees">
          Technical committees
        </Link>
        <Link className="cf-btn cf-btn--ghost" to="/account/subscriptions">
          Get alerts
        </Link>
      </div>
      <Loadable res={res} what="Drafts">
        {(rows) =>
          rows.length ? (
            <div className="crm-grid crm-grid--2">
              {rows.map((w) => (
                <Link key={w.id} to={`/standards/drafts/${w.id}`} className="cf-card" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="cf-head__kicker">
                    {w.ref} · {w.tc_name}
                  </span>
                  <h3 style={{ margin: "4px 0" }}>{w.title}</h3>
                  <p className="crm-small">{w.scope}</p>
                  <span className={`crm-pill crm-pill--${daysLeft(w.comment_period?.closes) < 10 ? "red" : "amber"}`}>Closes {fmtD(w.comment_period?.closes)} · {daysLeft(w.comment_period?.closes)} days left</span>{" "}
                  <span className="crm-small">{w.comments} comments so far</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="crm-empty">
              <Icon name="i-file" />
              <b>No drafts are open for comment right now</b>
              <Link to="/account/subscriptions">Get an alert when the next one opens</Link>
            </div>
          )
        }
      </Loadable>
    </PublicPage>
  );
}

type Row = Pick<DraftComment, "clause" | "paragraph" | "type" | "comment" | "proposed_change">;
const blankRow = (): Row => ({ clause: "", paragraph: "", type: "technical", comment: "", proposed_change: "" });

export function DraftDetailPage() {
  const { id = "" } = useParams();
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [by, setBy] = useState({ name: me.name === "Customer" ? "" : me.name, org: "", email: me.email ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const res = useCustomerData(() => getWorkItem(id), [id]);
  return (
    <Loadable res={res} what="Draft">
      {({ wi: w, tc }) => {
        const open = w.state === "Public Review" && daysLeft(w.comment_period?.closes) >= 0;
        const draft = [...w.drafts].reverse().find((d) => d.locked) ?? w.drafts[w.drafts.length - 1];
        return (
          <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Have your say", to: "/standards/drafts" }, { label: w.ref }]} title={`${w.ref} ${w.title}`} lead={`${tc?.number} ${tc?.name} · ${open ? `open for comment until ${fmtD(w.comment_period?.closes)}` : "not open for comment"}`}>
            <Toast msg={msg} />
            <div className="crm-grid crm-grid--main">
              <div className="cf-card">
                <h3 style={{ marginTop: 0 }}>Draft {draft?.label}</h3>
                <p>
                  <b>Scope.</b> {w.scope}
                </p>
                <p className="crm-small">{draft?.summary}</p>
                <a className="crm-btn crm-btn--sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${w.ref} ${w.title}\nDraft ${draft?.label}\n\n${w.scope}\n\n(Demo preview of the draft text.)`)}`} download={`${w.ref.replace(/\W+/g, "-")}-${draft?.label}.txt`}>
                  <Icon name="i-download" /> Read the full draft
                </a>
                <p className="crm-small" style={{ marginTop: 10 }}>
                  Drafts for comment are free. The published standard will be sold through the e-store.
                </p>
              </div>
              <div className="cf-card">
                {sent ? (
                  <div className="crm-banner crm-banner--ok">
                    Thank you — {sent} comment(s) received. You'll see the committee's response in <Link to="/account/comments">My comments</Link>.
                  </div>
                ) : null}
                {open ? (
                  <>
                    <h3 style={{ marginTop: 0 }}>Your comments</h3>
                    {rows.map((r, n) => (
                      <div key={n} className="crm-stack" style={{ borderBottom: "1px solid var(--line, #e5e7eb)", paddingBottom: 10, marginBottom: 10 }}>
                        <div className="crm-grid crm-grid--3">
                          <label className="crm-field">
                            Clause *
                            <input className="crm-input" placeholder="5.2 or General" value={r.clause} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, clause: e.target.value } : x)))} />
                          </label>
                          <label className="crm-field">
                            Paragraph / table
                            <input className="crm-input" value={r.paragraph} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, paragraph: e.target.value } : x)))} />
                          </label>
                          <label className="crm-field">
                            Type
                            <Select value={r.type} onChange={(val) => setRows(rows.map((x, k) => (k === n ? { ...x, type: val as Row["type"] } : x)))} block>
                              <option value="technical">Technical</option>
                              <option value="editorial">Editorial</option>
                              <option value="general">General</option>
                            </Select>
                          </label>
                        </div>
                        <textarea className="crm-textarea" placeholder="Comment *" value={r.comment} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, comment: e.target.value } : x)))} />
                        <textarea className="crm-textarea" placeholder="Proposed change" value={r.proposed_change} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, proposed_change: e.target.value } : x)))} />
                      </div>
                    ))}
                    <button type="button" className="crm-btn crm-btn--sm" onClick={() => setRows([...rows, blankRow()])}>
                      + Another comment
                    </button>
                    <div className="crm-grid crm-grid--3" style={{ marginTop: 10 }}>
                      <label className="crm-field">
                        Your name *
                        <input className="crm-input" value={by.name} onChange={(e) => setBy({ ...by, name: e.target.value })} />
                      </label>
                      <label className="crm-field">
                        Organisation
                        <input className="crm-input" value={by.org} onChange={(e) => setBy({ ...by, org: e.target.value })} />
                      </label>
                      <label className="crm-field">
                        Email *
                        <input className="crm-input" value={by.email} onChange={(e) => setBy({ ...by, email: e.target.value })} />
                      </label>
                    </div>
                    {err ? <p className="eo-error">{err}</p> : null}
                    <button
                      type="button"
                      className="cf-btn cf-btn--pri"
                      onClick={() => {
                        setErr(null);
                        try {
                          const out = submitComments(w.id, { name: by.name, org: by.org || undefined, email: by.email || "demo" }, rows);
                          setSent(out.length);
                          setRows([blankRow()]);
                          show("Comments submitted.");
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Submit comments
                    </button>
                  </>
                ) : (
                  <p>The comment period is closed. The committee is resolving the comments received.</p>
                )}
              </div>
            </div>
          </PublicPage>
        );
      }}
    </Loadable>
  );
}

export function ProposePage() {
  const me = useCustomer();
  const nav = useNavigate();
  const tcs = useCustomerData(() => listTcs(), []);
  const [v, setV] = useState({ title: "", scope: "", justification: "", intl_refs: "", stakeholders: "", urgency: "normal" as "normal" | "high", tc_id: "", name: me.name === "Customer" ? "" : me.name, org: "", email: me.email ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Standards", to: "/standards" }, { label: "Propose a standard" }]} title="Propose a new standard" lead="Industry, government, consumers and TC members can propose new work (NWIP). The TC secretary reviews it and puts it to the technical committee.">
      <div className="cf-card crm-form">
        <label className="crm-field">
          Title *
          <input className="crm-input" value={v.title} onChange={set("title")} />
        </label>
        <label className="crm-field">
          Scope — what the standard would cover *
          <textarea className="crm-textarea" value={v.scope} onChange={set("scope")} />
        </label>
        <label className="crm-field">
          Justification — why it's needed *
          <textarea className="crm-textarea" value={v.justification} onChange={set("justification")} />
        </label>
        <div className="crm-grid crm-grid--2">
          <label className="crm-field">
            Relevant international standards
            <input className="crm-input" value={v.intl_refs} onChange={set("intl_refs")} placeholder="ISO, IEC, SADC, ARSO, Codex…" />
          </label>
          <label className="crm-field">
            Stakeholders affected
            <input className="crm-input" value={v.stakeholders} onChange={set("stakeholders")} />
          </label>
          <label className="crm-field">
            Suggested committee
            <Select value={v.tc_id} onChange={(val) => setV({ ...v, tc_id: val })} block>
              <option value="">Not sure</option>
              {(tcs.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} {t.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="crm-field">
            Urgency
            <Select value={v.urgency} onChange={(val) => setV({ ...v, urgency: val as typeof v.urgency })} block>
              <option value="normal">Normal</option>
              <option value="high">High (regulation, safety, trade)</option>
            </Select>
          </label>
          <label className="crm-field">
            Your name *
            <input className="crm-input" value={v.name} onChange={set("name")} />
          </label>
          <label className="crm-field">
            Organisation
            <input className="crm-input" value={v.org} onChange={set("org")} />
          </label>
          <label className="crm-field">
            Email *
            <input className="crm-input" value={v.email} onChange={set("email")} />
          </label>
        </div>
        {err ? <p className="eo-error">{err}</p> : null}
        <button
          type="button"
          className="cf-btn cf-btn--pri"
          onClick={() => {
            setErr(null);
            try {
              submitProposal({ title: v.title, scope: v.scope, justification: v.justification, intl_refs: v.intl_refs, stakeholders: v.stakeholders, urgency: v.urgency, tc_id: v.tc_id || undefined, proposer: { name: v.name, org: v.org, email: v.email || "demo" } });
              nav("/account/comments");
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Submit proposal
        </button>
      </div>
    </PublicPage>
  );
}

export function CommitteesPage() {
  const res = useCustomerData(() => listTcs(), []);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Standards", to: "/standards" }, { label: "Technical committees" }]} title="Technical committees" lead="Standards are written by committees balancing industry, government, academia and consumers. Apply to join one in your field.">
      <Loadable res={res} what="Committees">
        {(tcs) => (
          <div className="crm-grid crm-grid--2">
            {tcs.map((tc) => (
              <div key={tc.id} className="cf-card">
                <span className="cf-head__kicker">{tc.number}</span>
                <h3 style={{ margin: "4px 0" }}>{tc.name}</h3>
                <p className="crm-small">{tc.scope}</p>
                <p className="crm-small">
                  Chair {tc.chair} · {tc.members.length} members
                </p>
                <Link className="cf-btn cf-btn--ghost" to={`/standards/committees/${tc.id}/join`}>
                  Apply to join
                </Link>
              </div>
            ))}
          </div>
        )}
      </Loadable>
    </PublicPage>
  );
}

export function JoinTcPage() {
  const { tc: id = "" } = useParams();
  const me = useCustomer();
  const [v, setV] = useState({ name: me.name === "Customer" ? "" : me.name, org: "", email: me.email ?? "", category: "industry" as MemberCategory, motivation: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const res = useCustomerData(() => getTc(id), [id]);
  return (
    <Loadable res={res} what="Committee">
      {(tc) => (
        <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "Committees", to: "/standards/committees" }, { label: `Join ${tc.number}` }]} title={`Apply to join ${tc.number} ${tc.name}`} lead="Members serve 3-year terms, review drafts, attend meetings and vote on ballots.">
          {done ? (
            <div className="crm-banner crm-banner--ok">Application sent. The TC secretary will reply within 10 working days.</div>
          ) : (
            <div className="cf-card crm-form crm-grid crm-grid--2">
              <label className="crm-field">
                Name
                <input className="crm-input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </label>
              <label className="crm-field">
                Organisation
                <input className="crm-input" value={v.org} onChange={(e) => setV({ ...v, org: e.target.value })} />
              </label>
              <label className="crm-field">
                Email
                <input className="crm-input" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
              </label>
              <label className="crm-field">
                Interest category
                <Select value={v.category} onChange={(val) => setV({ ...v, category: val as MemberCategory })} block>
                  {["industry", "government", "academia", "consumer", "other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </label>
              <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
                Why do you want to join? What expertise do you bring?
                <textarea className="crm-textarea" value={v.motivation} onChange={(e) => setV({ ...v, motivation: e.target.value })} />
              </label>
              {err ? <p className="eo-error">{err}</p> : null}
              <button
                type="button"
                className="cf-btn cf-btn--pri"
                onClick={() => {
                  try {
                    applyToTc(tc.id, { ...v, email: v.email || "demo" });
                    setDone(true);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Send application
              </button>
            </div>
          )}
        </PublicPage>
      )}
    </Loadable>
  );
}

export function AccountCommentsPage() {
  const me = useCustomer();
  const res = useCustomerData(() => ({ comments: listComments({ email: me.email }), proposals: listProposals({ email: me.email }) }), [me.email]);
  return (
    <Panel title="Standards participation" sub="Your comments on draft standards with the committee's disposition, and your proposals." actions={<Link className="abtn" to="/standards/drafts">Have your say</Link>}>
      <Loadable res={res} what="Comments">
        {({ comments, proposals }) => (
          <div className="crm-stack">
            <h3 style={{ margin: 0 }}>Proposals</h3>
            {proposals.length ? (
              proposals.map((p) => (
                <p key={p.id} style={{ margin: "4px 0" }}>
                  <b>{p.title}</b> <span className="crm-small">{p.id} · {fmtD(p.at)}</span> <span className={`crm-pill crm-pill--${PROPOSAL_DEF.states.find((s) => s.id === p.state)?.tone}`}>{displayState(PROPOSAL_DEF, p.state, "customer")}</span>
                  {p.state === "Rejected" ? <span className="crm-small" style={{ display: "block" }}>Reason: {p.history[p.history.length - 1]?.reason ?? p.history[p.history.length - 1]?.note}</span> : null}
                </p>
              ))
            ) : (
              <p className="crm-muted">None.</p>
            )}
            <h3 style={{ margin: "10px 0 0" }}>Comments</h3>
            {comments.length ? (
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Draft</th>
                    <th>Clause</th>
                    <th>Your comment</th>
                    <th>Committee response</th>
                  </tr>
                </thead>
                <tbody>
                  {comments.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.wi_ref}</b>
                        <span className="crm-small">{c.wi_title}</span>
                      </td>
                      <td>{c.clause}</td>
                      <td>{c.comment}</td>
                      <td>{c.disposition ? <><span className={`crm-pill crm-pill--${c.disposition === "rejected" ? "red" : "green"}`}>{DISPOSITION_LABEL[c.disposition]}</span> <span className="crm-small">{c.response}</span></> : <span className="crm-small">{c.wi_state === "Public Review" ? "Period still open" : "Being resolved"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="crm-muted">None yet.</p>
            )}
          </div>
        )}
      </Loadable>
    </Panel>
  );
}

export function AccountSubscriptionsPage() {
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [v, setV] = useState<{ kind: Subscription["kind"]; value: string; events: Subscription["events"] }>({ kind: "sector", value: "Food", events: ["drafts", "publications", "withdrawals"] });
  const res = useCustomerData(() => ({ subs: listSubscriptions(me.email), tcs: listTcs() }), [me.email]);
  const sectors = ["Food", "Construction", "Management", "Electrical", "Chemicals", "Energy", "Manufacturing"];
  return (
    <Panel title="Standards alerts" sub="Be told when drafts open for comment, standards are published or withdrawn.">
      <Toast msg={msg} />
      <Loadable res={res} what="Subscriptions">
        {({ subs, tcs }) => (
          <div className="crm-stack">
            {subs.map((s) => (
              <div key={s.id} className="crm-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line, #e5e7eb)" }}>
                <span style={{ flex: 1 }}>
                  <b>{s.label}</b> <span className="crm-small">{s.events.join(", ")}</span>
                </span>
                <button type="button" className="crm-link" onClick={() => (unsubscribe(s.id), show("Unsubscribed."))}>
                  Unsubscribe
                </button>
              </div>
            ))}
            <div className="crm-card">
              <div className="crm-row">
                <Select value={v.kind} onChange={(val) => setV({ ...v, kind: val as Subscription["kind"], value: val === "tc" ? tcs[0]?.id ?? "" : "Food" })}>
                  <option value="sector">Sector</option>
                  <option value="tc">Committee</option>
                </Select>
                <Select value={v.value} onChange={(val) => setV({ ...v, value: val })}>
                  {v.kind === "sector" ? sectors.map((x) => <option key={x}>{x}</option>) : tcs.map((t) => <option key={t.id} value={t.id}>{t.number} {t.name}</option>)}
                </Select>
                {(["drafts", "publications", "withdrawals"] as const).map((ev) => (
                  <label key={ev} className="crm-check">
                    <input type="checkbox" checked={v.events.includes(ev)} onChange={(e) => setV({ ...v, events: e.target.checked ? [...v.events, ev] : v.events.filter((x) => x !== ev) })} /> {ev}
                  </label>
                ))}
                <button
                  type="button"
                  className="crm-btn crm-btn--sm crm-btn--pri"
                  onClick={() => {
                    try {
                      subscribe({ email: me.email ?? "demo", kind: v.kind, value: v.value, label: v.kind === "tc" ? tcs.find((t) => t.id === v.value)?.number ?? v.value : `${v.value} sector`, events: v.events });
                      show("Subscribed.");
                    } catch (e) {
                      show(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Subscribe
                </button>
              </div>
              <p className="crm-small">To follow one standard, open it in the catalogue and choose “Alert me”.</p>
            </div>
          </div>
        )}
      </Loadable>
    </Panel>
  );
}

export function TcAreaPage() {
  const me = useCustomer();
  const res = useCustomerData(() => ({ mine: myCommittees(me.email), ballots: myBallots(me.email), drafts: openDrafts() }), [me.email]);
  return (
    <PublicPage crumbs={[{ label: "Home", to: "/" }, { label: "TC member area" }]} title="Technical committee member area" lead="Your committees, ballots to vote on and drafts to review.">
      <Loadable res={res} what="Membership">
        {({ mine, ballots, drafts }) =>
          !mine.length ? (
            <div className="crm-empty">
              <Icon name="i-users" />
              <b>You aren't a member of a technical committee</b>
              <Link to="/standards/committees">Apply to join one</Link>
            </div>
          ) : (
            <div className="crm-stack">
              <div className="crm-grid crm-grid--2">
                {mine.map(({ tc, member }) => (
                  <div key={tc.id} className="cf-card">
                    <span className="cf-head__kicker">{tc.number}</span>
                    <h3 style={{ margin: "4px 0" }}>{tc.name}</h3>
                    <p className="crm-small">
                      {member.voting ? "Voting member" : "Observer"} · {member.category} · term to {fmtD(member.term_end)}
                    </p>
                    <p className="crm-small">Next meeting: {tc.meetings.filter((m) => new Date(m.date) > new Date()).map((m) => `${m.title} on ${fmtD(m.date)}`)[0] ?? "—"}</p>
                  </div>
                ))}
              </div>
              <h2 style={{ margin: "8px 0 0" }}>Ballots</h2>
              {ballots.map(({ ballot, wi, voted }) => (
                <div key={ballot.id} className="cf-card crm-row">
                  <span style={{ flex: 1 }}>
                    <b>
                      {wi.ref} {wi.title}
                    </b>
                    <span className="crm-small" style={{ display: "block" }}>
                      {ballot.id} · {ballot.state === "Open" ? `closes ${fmtD(ballot.closes)}` : ballot.state}
                    </span>
                  </span>
                  {ballot.state === "Open" && !voted ? (
                    <Link className="cf-btn cf-btn--pri" to={`/tc/ballots/${ballot.id}`}>
                      Vote now
                    </Link>
                  ) : (
                    <Link className="cf-btn cf-btn--ghost" to={`/tc/ballots/${ballot.id}`}>
                      {voted ? "Your vote" : "Result"}
                    </Link>
                  )}
                </div>
              ))}
              {!ballots.length ? <p className="crm-muted">No ballots.</p> : null}
              <h2 style={{ margin: "8px 0 0" }}>Drafts to review</h2>
              {drafts
                .filter((d) => mine.some((m) => m.tc.id === d.tc_id))
                .map((d) => (
                  <p key={d.id}>
                    <Link to={`/standards/drafts/${d.id}`}>
                      {d.ref} {d.title}
                    </Link>{" "}
                    <span className="crm-small">comments close {fmtD(d.comment_period?.closes)}</span>
                  </p>
                ))}
            </div>
          )
        }
      </Loadable>
    </PublicPage>
  );
}

export function TcBallotPage() {
  const { id = "" } = useParams();
  const me = useCustomer();
  const [msg, show] = useMsg();
  const [vote, setVote] = useState<Vote>("approve");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const res = useCustomerData(() => ({ b: getBallot(id), mine: myCommittees(me.email) }), [id, me.email]);
  return (
    <Loadable res={res} what="Ballot">
      {({ b, mine }) => {
        if (!b) return <p>Ballot not found.</p>;
        const member = mine.find((m) => m.tc.id === b.wi.tc_id && b.ballot.eligible.includes(m.member.name))?.member;
        const my = member ? b.ballot.votes[member.name] : undefined;
        const t = tallyBallot(b.ballot);
        return (
          <PublicPage crumbs={[{ label: "TC member area", to: "/tc" }, { label: b.ballot.id }]} title={`Ballot: ${b.wi.ref} ${b.wi.title}`} lead={`${b.tc?.number} · draft ${b.ballot.draft_label} · ${b.ballot.state === "Open" ? `closes ${fmtD(b.ballot.closes)}` : b.ballot.state}`}>
            <Toast msg={msg} />
            <div className="crm-grid crm-grid--main">
              <div className="cf-card">
                <p>
                  <b>Scope.</b> {b.wi.scope}
                </p>
                <a className="crm-btn crm-btn--sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${b.wi.ref} ${b.wi.title} — ${b.ballot.draft_label}\n\n${b.wi.scope}`)}`} download={`${b.wi.ref}-${b.ballot.draft_label}.txt`}>
                  <Icon name="i-download" /> Draft for ballot
                </a>
                <p className="crm-small" style={{ marginTop: 10 }}>
                  Rule: at least {b.ballot.rule.approve_pct}% of approve + disapprove votes, no more than {b.ballot.rule.max_disapprove_pct}% disapprove, quorum {b.ballot.rule.quorum_pct}% (to confirm). So far {t.cast} of {t.eligible} have voted.
                </p>
              </div>
              <div className="cf-card">
                {!member ? (
                  <p>You're not a voting member for this ballot.</p>
                ) : my ? (
                  <div className="crm-banner crm-banner--ok">
                    You voted <b>{VOTE_LABEL[my.vote]}</b> on {fmtD(my.at)}.{my.comment ? ` “${my.comment}”` : ""}
                  </div>
                ) : b.ballot.state !== "Open" ? (
                  <p>This ballot closed: {b.ballot.state}.</p>
                ) : (
                  <>
                    <h3 style={{ marginTop: 0 }}>Your vote, {member.name}</h3>
                    {(Object.keys(VOTE_LABEL) as Vote[]).map((k) => (
                      <label key={k} className="crm-check">
                        <input type="radio" name="vote" checked={vote === k} onChange={() => setVote(k)} /> {VOTE_LABEL[k]}
                      </label>
                    ))}
                    <label className="crm-field">
                      {vote === "disapprove" ? "Technical reasons (required)" : "Comments"}
                      <textarea className="crm-textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
                    </label>
                    {err ? <p className="eo-error">{err}</p> : null}
                    <button
                      type="button"
                      className="cf-btn cf-btn--pri"
                      onClick={() => {
                        setErr(null);
                        try {
                          castVote(b.ballot.id, member.name, vote, comment);
                          show("Vote recorded. Thank you.");
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Cast vote
                    </button>
                  </>
                )}
              </div>
            </div>
          </PublicPage>
        );
      }}
    </Loadable>
  );
}
