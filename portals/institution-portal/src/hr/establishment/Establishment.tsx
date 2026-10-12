import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import { errorText } from "../api";
import type {
  HrDesignationsResponse,
  HrEstablishment,
  HrEstChange,
  HrEstChangeDetail,
  HrEstChangeKind,
  HrEstDepartment,
  HrEstPost,
  HrGradeBandsResponse,
} from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep, StatusPill, Track } from "../../me/parts";

/**
 * Establishment (journey J11; screens H3, H3a, H3b). Approved posts come from submitted Staffing Plans.
 * HR or the head of a department asks for a change; the Executive Director decides in Approvals, and new
 * posts or regrades then go to the Council HR & Remuneration Committee (recorded by the Board Secretary).
 * These screens show where a request is and who decides; they never approve.
 */

const BASE = "/hr/structure";
const deptPath = (d: string) => `${BASE}/departments/${encodeURIComponent(d)}`;
const changePath = (id: string) => `${BASE}/changes/${encodeURIComponent(id)}`;

const CHANGE_CHOICES: Array<{ value: HrEstChangeKind; title: string; detail: string }> = [
  { value: "Add", title: "Add posts", detail: "More approved posts. Goes to the Council after the Executive Director." },
  { value: "Remove", title: "Remove posts", detail: "Only empty posts that aren't being recruited." },
  { value: "Freeze", title: "Freeze posts", detail: "Keep vacant posts approved but stop recruiting to them." },
  { value: "Unfreeze", title: "Unfreeze posts", detail: "Frozen posts can be recruited to again." },
  { value: "Regrade", title: "Regrade the post", detail: "Move the designation to another grade. Goes to the Council." },
];

export function changeState(state: HrEstChange["state"]): { label: string; cls: string } {
  if (state === "Approved") return { label: "Approved", cls: "ok" };
  if (state === "Sent back") return { label: "Sent back", cls: "leave" };
  if (state === "Not approved") return { label: "Not approved", cls: "bad" };
  return { label: state === "Waiting for Council" ? "With the Council" : "With the Executive Director", cls: "info" };
}

function ChangeRows({ items }: { items: HrEstChange[] }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Change</th>
            <th>Department</th>
            <th>Asked</th>
            <th>Where it is</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const st = changeState(c.state);
            return (
              <tr key={c.id}>
                <td>
                  <Link className="hr-lnk" to={changePath(c.id)}>
                    {c.summary}
                  </Link>
                </td>
                <td>{c.department}</td>
                <td>{fmtDay(c.date, true)}</td>
                <td>
                  <StatusPill cls={st.cls} label={st.label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ label, to, approved, filled, vacant, frozen }: { label: string; to?: string; approved: number; filled: number; vacant: number; frozen: number }) {
  const pct = approved ? Math.min(100, Math.round((filled / approved) * 100)) : filled ? 100 : 0;
  return (
    <div className="hr-est__row">
      <span>{to ? <Link to={to}>{label}</Link> : label}</span>
      <span className="hr-est__track" role="img" aria-label={`${filled} of ${approved} posts filled`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="hr-est__n">
        {filled} <small>/ {approved}</small>
      </span>
      <span className={`hr-est__v${vacant ? " has" : ""}`}>
        {vacant ? `${vacant} vacant` : "None vacant"}
        {frozen ? `, ${frozen} frozen` : ""}
      </span>
    </div>
  );
}

type OrgNode = { id: string; employee_name: string; department?: string | null; designation?: string | null; reports_to?: string | null };

function OrgChart() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<{ nodes: OrgNode[] }>("/hr/orgchart", { enabled: Boolean(user), refreshKey: sessionKey });
  const nodes = res.data?.nodes ?? [];
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    const parent = n.reports_to && ids.has(n.reports_to) ? n.reports_to : "";
    kids.set(parent, [...(kids.get(parent) ?? []), n]);
  }
  const branch = (parent: string, depth: number): JSX.Element | null => {
    const list = kids.get(parent);
    if (!list?.length || depth > 12) return null;
    return (
      <ul className="hr-orgtree">
        {list.map((n) => (
          <li key={n.id}>
            <b>{n.employee_name}</b>
            <span>{[n.designation, n.department].filter(Boolean).join(", ")}</span>
            {branch(n.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} hasData={Boolean(res.data)} skeleton="list">
      {nodes.length ? (
        <div className="hr-box">
          <div className="hr-box__b">{branch("", 0)}</div>
        </div>
      ) : (
        <EmptyState title="No one to show yet" detail="The org chart is drawn from each active employee's line manager (Reports to)." />
      )}
    </ResourceGate>
  );
}

/** H3 — the Establishment tab inside Structure. */
export function EstablishmentPanel() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrEstablishment>("/hr/establishment", { enabled: Boolean(user), refreshKey: sessionKey });
  const [view, setView] = useState<"posts" | "chart">("posts");
  const d = res.data;
  return (
    <div className="hr-view">
      <div className="hr-head">
        <div>
          <h2>Establishment</h2>
          <p>Approved posts from the submitted staffing plans, and who fills them.</p>
        </div>
        <div className="hr-head__r">
          <nav className="hr-struct-tabs" aria-label="Establishment view">
            <button type="button" className={view === "posts" ? "on" : undefined} onClick={() => setView("posts")}>
              Posts
            </button>
            <button type="button" className={view === "chart" ? "on" : undefined} onClick={() => setView("chart")}>
              Org chart
            </button>
          </nav>
          {d?.can_request ? (
            <Link className="btn pri" to={`${BASE}/changes/new`}>
              Request a change
            </Link>
          ) : null}
        </div>
      </div>
      {view === "chart" ? (
        <OrgChart />
      ) : (
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            <>
              {!d.has_plans ? (
                <Banner kind="info" title="No approved establishment yet">
                  Approved posts come from submitted staffing plans. Until ESWASA's approved establishment is entered, departments show
                  their people but no posts.
                </Banner>
              ) : null}
              <div className="kpis kpis--5">
                {(
                  [
                    ["Approved posts", d.totals.approved],
                    ["Filled", d.totals.filled],
                    ["In recruitment", d.totals.in_recruitment],
                    ["Vacant", d.totals.vacant],
                    ["Frozen", d.totals.frozen],
                  ] as const
                ).map(([l, v]) => (
                  <div className="kpi" key={l}>
                    <span className="l">{l}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
              </div>
              {d.departments.length ? (
                <div className="hr-box">
                  <div className="hr-box__h">
                    <div>
                      <h3>By department</h3>
                      <p>Filled against approved posts</p>
                    </div>
                  </div>
                  <div className="hr-box__b hr-est">
                    {d.departments.map((r) => (
                      <Bar key={r.department} label={r.department} to={deptPath(r.department)} approved={r.approved} filled={r.filled} vacant={r.vacant} frozen={r.frozen} />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState title="No departments yet" detail="Add departments in the Departments tab first." />
              )}
              {d.pending.length ? (
                <>
                  <h3 className="hr-sub">Waiting for a decision</h3>
                  <ChangeRows items={d.pending} />
                </>
              ) : null}
            </>
          ) : null}
        </ResourceGate>
      )}
    </div>
  );
}

function SetHead({ department, people, current, onDone }: { department: string; people: HrEstDepartment["people"]; current?: string | null; onDone: () => void }) {
  const [pick, setPick] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/hr/departments/${encodeURIComponent(department)}/head`, { method: "POST", body: JSON.stringify({ employee_id: pick, confirm: true }), quiet: true });
      onDone();
    } catch (e) {
      setErr(errorText(e, "Not saved."));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      // confirm is a query parameter on this DELETE (no body).
      await apiFetch(`/hr/departments/${encodeURIComponent(department)}/head?confirm=true`, { method: "DELETE", quiet: true });
      setPick("");
      onDone();
    } catch (e) {
      setErr(errorText(e, "Not removed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hr-inline">
      <label className="hr-f">
        <span>Head of department</span>
        <select className="hr-in" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name ?? p.id}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn ghost" disabled={!pick || pick === current || busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Set as head"}
      </button>
      {current ? (
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void remove()}>
          Remove head
        </button>
      ) : null}
      {err ? <span className="hr-note hr-bad">{err}</span> : null}
    </div>
  );
}

/** H3a — one department. */
export function DepartmentDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrEstDepartment>(`/hr/establishment/departments/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Structure", `${BASE}?tab=establishment`], [d.department]]} />
            <div className="hr-head">
              <div>
                <h2>{d.department}</h2>
                <p>
                  {d.head ? `Head: ${d.head.name}.` : "No head set yet."} {d.parent ? `Part of ${d.parent}.` : ""}
                </p>
              </div>
              {d.can_request ? (
                <div className="hr-head__r">
                  <Link className="btn pri" to={`${BASE}/changes/new?department=${encodeURIComponent(d.department)}`}>
                    Request a change
                  </Link>
                </div>
              ) : null}
            </div>
            {!d.head ? (
              <Banner kind="warn" title="No head of department">
                Staff authorisations and requisitions for this department go to its head, so they can't be routed until one is set.
              </Banner>
            ) : null}
            {d.can_set_head ? (
              <div className="hr-box">
                <div className="hr-box__b">
                  <SetHead department={d.department} people={d.people} current={d.head?.id} onDone={res.reload} />
                </div>
              </div>
            ) : null}
            {d.cover_warnings.length ? (
              <Banner kind="warn" title="Thin competence cover">
                {d.cover_warnings.map((w) => `${w.skill} (${w.holders === 0 ? "no one" : "one person"})`).join(", ")} — fewer than two people are authorised.
              </Banner>
            ) : null}
            <h3 className="hr-sub">Posts</h3>
            {d.posts.length ? <PostsTable posts={d.posts} department={d.department} canRequest={d.can_request} /> : <EmptyState title="No approved posts" detail="This department has no submitted staffing plan yet." />}
            <h3 className="hr-sub">People ({d.people.length})</h3>
            {d.people.length ? (
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.people.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link className="hr-lnk" to={`/hr/directory/${encodeURIComponent(p.id)}`}>
                            {p.name ?? p.id}
                          </Link>
                        </td>
                        <td>{p.designation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No one in this department yet" />
            )}
            {d.changes.length ? (
              <>
                <h3 className="hr-sub">Establishment changes</h3>
                <ChangeRows items={d.changes} />
              </>
            ) : null}
            <NextStep
              title={d.head ? "Keep the establishment current" : "Set the head of department"}
              body={d.head ? "Ask for a change when posts need to be added, removed, frozen or regraded." : "Choose the head above so approvals can reach them."}
              to={`${BASE}?tab=establishment`}
              label="Back to the establishment"
            />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

function PostsTable({ posts, department, canRequest }: { posts: HrEstPost[]; department: string; canRequest: boolean }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Designation</th>
            <th>Grade</th>
            <th className="num">Approved</th>
            <th className="num">Filled</th>
            <th className="num">Recruiting</th>
            <th className="num">Frozen</th>
            <th className="num">Vacant</th>
            {canRequest ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.designation}>
              <td>{p.designation}</td>
              <td>{p.grade ?? "—"}</td>
              <td className="num">{p.approved}</td>
              <td className="num">{p.filled}</td>
              <td className="num">{p.in_recruitment}</td>
              <td className="num">{p.frozen}</td>
              <td className="num">{p.vacant}</td>
              {canRequest ? (
                <td>
                  <Link className="hr-lnk" to={`${BASE}/changes/new?department=${encodeURIComponent(department)}&designation=${encodeURIComponent(p.designation)}`}>
                    Change
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** H3b — ask for an establishment change. */
export function RequestChange() {
  const [params] = useSearchParams();
  const { user, sessionKey } = useInstitution();
  const est = useApiResource<HrEstablishment>("/hr/establishment", { enabled: Boolean(user), refreshKey: sessionKey });
  const desigs = useApiResource<HrDesignationsResponse>("/hr/designations?limit=200", { enabled: Boolean(user), refreshKey: sessionKey });
  const grades = useApiResource<HrGradeBandsResponse>("/hr/grade-bands", { enabled: Boolean(user), refreshKey: sessionKey });
  const [department, setDepartment] = useState(params.get("department") ?? "");
  const [designation, setDesignation] = useState(params.get("designation") ?? "");
  const [change, setChange] = useState<HrEstChangeKind>("Add");
  const [count, setCount] = useState("1");
  const [grade, setGrade] = useState("");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<HrEstChangeDetail | null>(null);

  const row = est.data?.departments.find((r) => r.department === department);
  const post = row?.posts.find((p) => p.designation === designation);
  const titles = useMemo(() => {
    const all = new Set((desigs.data?.items ?? []).map((x) => x.id));
    for (const p of row?.posts ?? []) all.add(p.designation);
    return [...all].sort();
  }, [desigs.data, row]);
  useEffect(() => {
    if (change !== "Add" && designation && row && !post) setChange("Add");
  }, [change, designation, row, post]);

  const needCount = change !== "Regrade";
  const ready = Boolean(department && designation && reason.trim()) && (needCount ? Number(count) >= 1 : Boolean(grade));
  const council = change === "Add" || change === "Regrade";

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const out = await apiFetch<HrEstChangeDetail>("/hr/establishment/changes", {
        method: "POST",
        body: JSON.stringify({
          department,
          designation,
          change,
          count: needCount ? Number(count) : null,
          new_grade: change === "Regrade" ? grade : null,
          reason: reason.trim(),
          cost_note: cost.trim() || null,
          confirm: true,
        }),
      });
      setSent(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const who = sent.deciders.map((x) => x.name).join(" or ");
    return (
      <div className="hr hr-view">
        <Crumbs items={[["Structure", `${BASE}?tab=establishment`], ["Request a change"]]} />
        <Banner kind="ok" title="Sent to the Executive Director">
          {sent.summary} in {sent.department}. {who ? `${who} decides in Approvals.` : ""}
        </Banner>
        <NextStep title="Follow the request" body="It shows where it is and who decides next." to={changePath(sent.id)} label="Open the request" />
      </div>
    );
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={est.loading} error={est.error} onRetry={est.reload} hasData={Boolean(est.data)} skeleton="panel">
        {est.data ? (
          <div className="hr hr-view">
            <Crumbs items={[["Structure", `${BASE}?tab=establishment`], ["Request a change"]]} />
            <div className="hr-head">
              <div>
                <h2>Request an establishment change</h2>
                <p>The Executive Director decides. Adding posts or regrading also goes to the Council HR & Remuneration Committee.</p>
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__b hr-form">
                <label className="hr-f">
                  <span>Department</span>
                  <select className="hr-in" value={department} onChange={(e) => setDepartment(e.target.value)}>
                    <option value="">Choose…</option>
                    {est.data.departments.map((r) => (
                      <option key={r.department}>{r.department}</option>
                    ))}
                  </select>
                </label>
                <label className="hr-f">
                  <span>Designation</span>
                  <select className="hr-in" value={designation} onChange={(e) => setDesignation(e.target.value)}>
                    <option value="">Choose…</option>
                    {titles.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  {post ? (
                    <small>
                      Now: {post.approved} approved, {post.filled} filled, {post.in_recruitment} in recruitment, {post.frozen} frozen, {post.vacant} vacant
                      {post.grade ? `; grade ${post.grade}` : ""}.
                    </small>
                  ) : designation ? (
                    <small>No approved posts for this designation here yet, so only adding posts is possible.</small>
                  ) : null}
                </label>
                <div className="hr-radios wide" role="radiogroup" aria-label="What should change">
                  {CHANGE_CHOICES.map((c) => (
                    <label className="hr-radio" key={c.value}>
                      <input type="radio" name="est_change" checked={change === c.value} disabled={c.value !== "Add" && Boolean(designation) && !post} onChange={() => setChange(c.value)} />
                      <span>
                        <b>{c.title}</b>
                        <small>{c.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {needCount ? (
                  <label className="hr-f">
                    <span>Number of posts</span>
                    <input className="hr-in" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
                  </label>
                ) : (
                  <label className="hr-f">
                    <span>New grade</span>
                    <select className="hr-in" value={grade} onChange={(e) => setGrade(e.target.value)}>
                      <option value="">Choose…</option>
                      {(grades.data?.items ?? [])
                        .filter((g) => g.id !== post?.grade)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name ?? g.code ?? g.id}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="hr-f wide">
                  <span>Reason</span>
                  <textarea className="hr-in" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <label className="hr-f wide">
                  <span>Cost (optional)</span>
                  <textarea className="hr-in" rows={2} value={cost} placeholder="Yearly cost and budget line, if known" onChange={(e) => setCost(e.target.value)} />
                </label>
              </div>
            </div>
            <Banner kind="info" title={council ? "Executive Director, then Council" : "Executive Director"}>
              {council
                ? "After the Executive Director approves, the Board Secretary records the Council committee's decision. The establishment changes only then."
                : "The establishment changes as soon as the Executive Director approves."}
            </Banner>
            {err ? (
              <Banner kind="bad" title="Not sent">
                {err}
              </Banner>
            ) : null}
            <div className="hr-actions">
              <Link className="btn ghost" to={department ? deptPath(department) : `${BASE}?tab=establishment`}>
                Cancel
              </Link>
              <button type="button" className="btn pri" disabled={!ready || busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Send for decision"}
              </button>
            </div>
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}

/** Where an establishment change is. No Approve or Reject here: that happens in Approvals. */
export function ChangeDetail() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrEstChangeDetail>(`/hr/establishment/changes/${encodeURIComponent(id)}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const st = d ? changeState(d.state) : null;
  const open = d?.state === "Waiting for Executive Director" || d?.state === "Waiting for Council";
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
        {d && st ? (
          <div className="hr hr-view">
            <Crumbs items={[["Structure", `${BASE}?tab=establishment`], [d.department, deptPath(d.department)], [d.summary]]} />
            <div className="hr-head">
              <div>
                <h2>{d.summary}</h2>
                <p>
                  {d.department}. Asked {fmtDay(d.date, true)}.
                </p>
              </div>
              <div className="hr-head__r">
                <StatusPill cls={st.cls} label={st.label} />
              </div>
            </div>
            <div className="hr-box">
              <div className="hr-box__b">
                <Track steps={d.track.map((s) => ({ title: s.title, state: s.state ?? undefined }))} />
              </div>
            </div>
            {open ? (
              <Banner kind="info" title={d.state === "Waiting for Council" ? "With the Council HR & Remuneration Committee" : "With the Executive Director"}>
                {d.deciders.length ? `Decided in Approvals by ${d.deciders.map((x) => x.name).join(" or ")}.` : "No one holds the deciding role yet."}
              </Banner>
            ) : null}
            {d.state === "Sent back" || d.state === "Not approved" ? (
              <Banner kind={d.state === "Not approved" ? "bad" : "warn"} title={st.label}>
                {d.decision_note ?? "No note given."}
              </Banner>
            ) : null}
            {d.state === "Approved" ? (
              <Banner kind="ok" title="Establishment updated">
                {d.change === "Regrade" ? `The designation is now on grade ${d.new_grade}.` : "The staffing plan was amended."}
                {d.council_reference ? ` Council minute ${d.council_reference}.` : ""}
              </Banner>
            ) : null}
            <div className="hr-box">
              <div className="hr-box__b">
                <dl className="hr-kv">
                  <div>
                    <dt>Before</dt>
                    <dd>
                      {d.before.approved} approved, {d.before.frozen} frozen
                      {d.current_grade ? `; grade ${d.current_grade}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{d.reason ?? "—"}</dd>
                  </div>
                  {d.cost_note ? (
                    <div>
                      <dt>Cost</dt>
                      <dd>{d.cost_note}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Council decision needed</dt>
                    <dd>{d.council_required ? "Yes" : "No"}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <NextStep
              title={d.state === "Sent back" ? "Ask again with the changes requested" : "Back to the department"}
              to={d.state === "Sent back" ? `${BASE}/changes/new?department=${encodeURIComponent(d.department)}&designation=${encodeURIComponent(d.designation)}` : deptPath(d.department)}
              label={d.state === "Sent back" ? "Ask again" : "Open the department"}
            />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
