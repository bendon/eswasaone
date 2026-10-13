import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import type { HrLiveOverview } from "../api/types";
import { StatusPill } from "../me/parts";

/** H0 department staffing: filled against approved posts, from the live overview's establishment (no new fetch). */

type Dept = HrLiveOverview["establishment"]["departments"][number];
type Status = "critical" | "under" | "full" | "over" | "na";
type Sort = "vacant" | "rate" | "name" | "approved";

const STATUS: Record<Status, { cls: string; label: string }> = {
  critical: { cls: "bad", label: "Critical" },
  under: { cls: "leave", label: "Understaffed" },
  full: { cls: "ok", label: "Fully staffed" },
  over: { cls: "info", label: "Over establishment" },
  na: { cls: "mute", label: "Not applicable" },
};

const SORTS: Record<Sort, string> = { vacant: "Vacant (high to low)", rate: "Fill rate (low to high)", name: "Department (A to Z)", approved: "Approved (high to low)" };
const PAGE = 10;
const TOP_VACANCIES = 5;

export function statusOf(d: Pick<Dept, "approved" | "filled">): Status {
  if (!d.approved) return "na";
  if (d.filled > d.approved) return "over";
  if (d.filled === d.approved) return "full";
  return d.filled === 0 ? "critical" : "under";
}

function rate(d: Pick<Dept, "approved" | "filled">): number {
  return d.approved ? Math.round((d.filled / d.approved) * 100) : 0;
}

function pct(n: number, of: number): number {
  return of ? Math.round((n / of) * 100) : 0;
}

/** Filled vs vacant donut: two arcs with a 2px surface gap, total in the middle. */
function Donut({ filled, vacant }: { filled: number; vacant: number }) {
  const total = filled + vacant;
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = filled && vacant ? 1.5 : 0;
  const fLen = total ? (filled / total) * c : 0;
  const arcs = [
    { key: "filled", len: fLen, off: 0, n: filled },
    { key: "vacant", len: c - fLen, off: fLen, n: vacant },
  ].filter((a) => a.n > 0);
  return (
    <svg viewBox="0 0 100 100" className="hr-staff__donut" role="img" aria-label={`${filled} filled and ${vacant} vacant of ${total} posts`}>
      <circle cx="50" cy="50" r={r} className="hr-staff__donut-bg" />
      {arcs.map((a) => (
        <circle
          key={a.key}
          cx="50"
          cy="50"
          r={r}
          className={`hr-staff__arc ${a.key}`}
          strokeDasharray={`${Math.max(0, a.len - gap)} ${c}`}
          strokeDashoffset={-a.off - gap / 2}
          transform="rotate(-90 50 50)"
        >
          <title>{`${a.key === "filled" ? "Filled" : "Vacant"}: ${a.n} (${pct(a.n, total)}%)`}</title>
        </circle>
      ))}
      <text x="50" y="49" className="hr-staff__donut-v">
        {total}
      </text>
      <text x="50" y="62" className="hr-staff__donut-l">
        posts
      </text>
    </svg>
  );
}

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="hr-staff__ring" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="bg" />
      <circle cx="32" cy="32" r={r} className="fg" strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37">
        {value}%
      </text>
    </svg>
  );
}

export function StaffingOverview({ live }: { live: HrLiveOverview }) {
  const est = live.establishment;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [sort, setSort] = useState<Sort>("vacant");
  const [page, setPage] = useState(0);

  const depts = est.departments;
  const approved = est.totals?.approved ?? depts.reduce((s, d) => s + d.approved, 0);
  const filled = est.totals?.filled ?? depts.reduce((s, d) => s + d.filled, 0);
  const vacant = est.totals?.vacant ?? depts.reduce((s, d) => s + d.vacant, 0);
  const frozen = depts.reduce((s, d) => s + (d.frozen || 0), 0);
  const fillRate = pct(filled, approved);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = depts.filter((d) => (!needle || d.department.toLowerCase().includes(needle)) && (!status || statusOf(d) === status));
    const by: Record<Sort, (a: Dept, b: Dept) => number> = {
      vacant: (a, b) => b.vacant - a.vacant || rate(a) - rate(b),
      rate: (a, b) => rate(a) - rate(b) || b.vacant - a.vacant,
      name: (a, b) => a.department.localeCompare(b.department),
      approved: (a, b) => b.approved - a.approved,
    };
    return [...out].sort((a, b) => by[sort](a, b) || a.department.localeCompare(b.department));
  }, [depts, q, status, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);

  const vacancyList = useMemo(() => {
    const withVacancies = depts.filter((d) => d.vacant > 0).sort((a, b) => b.vacant - a.vacant || a.department.localeCompare(b.department));
    const top = withVacancies.slice(0, TOP_VACANCIES).map((d) => ({ name: d.department, n: d.vacant }));
    const rest = withVacancies.slice(TOP_VACANCIES);
    if (rest.length) top.push({ name: `Other departments (${rest.length})`, n: rest.reduce((s, d) => s + d.vacant, 0) });
    return top;
  }, [depts]);

  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(0);
    };
  }

  return (
    <section className="hr-staff" aria-label="Department staffing">
      <div className="hr-staff__head">
        <div>
          <h3>Department staffing</h3>
          <p>Filled against approved posts across departments</p>
        </div>
        <div className="hr-staff__filters">
          <label className="hr-staff__search">
            <Icon name="i-search" />
            <input type="search" placeholder="Search department…" aria-label="Search department" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          </label>
          <select className="hr-in" aria-label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value as Status | "")}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
          <Link to="/hr/structure?tab=establishment" className="hr-lnk">
            Open Structure
          </Link>
        </div>
      </div>

      <div className="hr-staff__stats" role="group" aria-label="Establishment totals">
        <div className="hr-staff__stat">
          <span className="hr-staff__ic navy">
            <Icon name="i-users" />
          </span>
          <div>
            <span className="l">Approved posts</span>
            <span className="v">{approved}</span>
            <span className="d">{frozen ? `Across all departments · ${frozen} frozen` : "Across all departments"}</span>
          </div>
        </div>
        <div className="hr-staff__stat">
          <span className="hr-staff__ic filled">
            <Icon name="i-check-c" />
          </span>
          <div>
            <span className="l">Filled</span>
            <span className="v">{filled}</span>
            <span className="d">{pct(filled, approved)}% of approved posts</span>
          </div>
        </div>
        <Link to="/hr/recruitment" className="hr-staff__stat vacant">
          <span className="hr-staff__ic vacant">
            <Icon name="i-briefcase" />
          </span>
          <div>
            <span className="l">Vacant</span>
            <span className="v">{vacant}</span>
            <span className="d">{pct(vacant, approved)}% of approved posts</span>
          </div>
        </Link>
        <div className="hr-staff__stat rate">
          <Ring value={fillRate} />
          <div>
            <span className="l">Overall fill rate</span>
            <span className="d">
              {filled} filled of {approved} approved
            </span>
          </div>
        </div>
      </div>

      <div className="hr-staff__grid">
        <div className="hr-stack">
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Post status</h3>
              </div>
            </div>
            <div className="hr-box__b hr-staff__split">
              <Donut filled={filled} vacant={vacant} />
              <ul className="hr-staff__legend">
                <li>
                  <i className="filled" />
                  <span>Filled</span>
                  <b>{filled}</b>
                  <small>{pct(filled, filled + vacant)}%</small>
                </li>
                <li>
                  <i className="vacant" />
                  <span>Vacant</span>
                  <b>{vacant}</b>
                  <small>{pct(vacant, filled + vacant)}%</small>
                </li>
              </ul>
            </div>
          </div>
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Vacancies by department</h3>
              </div>
            </div>
            {vacancyList.length ? (
              <ul className="hr-staff__vac">
                {vacancyList.map((v) => (
                  <li key={v.name}>
                    <span>{v.name}</span>
                    <b>{v.n}</b>
                    <small>{pct(v.n, vacant)}% of vacancies</small>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hr-box__b">
                <p className="hr-note" style={{ margin: 0 }}>
                  No open vacancies.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Department details</h3>
            </div>
            <label className="hr-staff__sort">
              <span>Sort by</span>
              <select className="hr-in" aria-label="Sort by" value={sort} onChange={(e) => reset(setSort)(e.target.value as Sort)}>
                {(Object.keys(SORTS) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORTS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shown.length ? (
            <div className="hr-scroll">
              <table className="hr-table hr-staff__table" aria-label="Department details">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="n">Filled</th>
                    <th className="n">Approved</th>
                    <th className="n">Vacant</th>
                    <th>Fill rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => {
                    const st = STATUS[statusOf(d)];
                    const r = rate(d);
                    return (
                      <tr key={d.department}>
                        <td>
                          <b>{d.department}</b>
                          {d.frozen ? <small className="sub"> · {d.frozen} frozen</small> : null}
                        </td>
                        <td className="n">{d.filled}</td>
                        <td className="n">{d.approved}</td>
                        <td className={`n${d.vacant ? " vac" : ""}`}>{d.vacant}</td>
                        <td>{d.approved ? `${r}%` : "—"}</td>
                        <td>
                          <StatusPill cls={st.cls} label={st.label} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="hr-box__b">
              <p className="hr-note" style={{ margin: 0 }}>
                No departments match.
              </p>
            </div>
          )}
          <div className="hr-staff__pager">
            <span>
              Showing {shown.length} of {rows.length} department{rows.length === 1 ? "" : "s"}
            </span>
            {pages > 1 ? (
              <div>
                <button type="button" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                  ‹
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} type="button" aria-current={i === cur ? "page" : undefined} onClick={() => setPage(i)}>
                    {i + 1}
                  </button>
                ))}
                <button type="button" aria-label="Next page" disabled={cur === pages - 1} onClick={() => setPage(cur + 1)}>
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
