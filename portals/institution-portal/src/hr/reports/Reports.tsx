import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrReportCatalogue, HrReportColumn, HrReportFilter, HrReportResult } from "../../api/types";
import { Banner, Crumbs, fmtDay } from "../../me/parts";
import { errorText, hrSaveFile } from "../api";

/**
 * H16 HR reports (HR additions plan 07). The catalogue comes from the server, already filtered to the viewer's
 * roles: HR sees everything they may run, a line manager (`?team=1`, linked from My team) only the team-scoped
 * reports, narrowed to their reports. Filters live in the URL and drive the GET. Export is a POST (filters and
 * reason stay out of URLs); the server logs it before building the file, and asks for a reason when the report
 * names people. Print uses a print stylesheet that hides the chrome. Nothing here invents a row.
 */

const MIN_REASON = 10;

function cell(c: HrReportColumn, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (c.type === "date") return fmtDay(String(v), true);
  if (c.type === "percent") return `${v}%`;
  if (c.type === "number" && typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

function sortValue(c: HrReportColumn, v: unknown): number | string {
  if (v === null || v === undefined || v === "") return c.type === "number" || c.type === "percent" ? -Infinity : "";
  if (c.type === "number" || c.type === "percent") return Number(v);
  return String(v).toLowerCase();
}

export function ReportsHome() {
  const { user, sessionKey } = useInstitution();
  const [params] = useSearchParams();
  const team = params.get("team") === "1";
  const res = useApiResource<HrReportCatalogue>(`/hr/reports${team ? "?team=1" : ""}`, { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        {team ? <Crumbs items={[["My team", "/team"], ["Reports"]]} /> : null}
        <div className="hr-head">
          <div>
            <h2>{team ? "Team reports" : "Reports"}</h2>
            <p>{team ? "Reports about the people who report to you." : "Run a report, filter it, and export it to CSV or Excel or print it. Exports are logged."}</p>
          </div>
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            d.items.length ? (
              d.groups.map((g) => (
                <section key={g} className="hr-report-group" aria-label={g}>
                  <h3>{g}</h3>
                  <div className="hr-cards">
                    {d.items
                      .filter((i) => i.group === g)
                      .map((i) => (
                        <Link key={i.id} className="hr-card" to={`/hr/reports/${i.id}${team ? "?team=1" : ""}`}>
                          <span className="l">{i.names ? "Names people" : "Counts only"}</span>
                          <b>{i.title}</b>
                          {i.description ? <span className="d">{i.description}</span> : null}
                          {i.scope === "team" ? <span className="d">Your reports only</span> : null}
                        </Link>
                      ))}
                  </div>
                </section>
              ))
            ) : (
              <EmptyState title="No reports for you" detail={team ? "Nobody reports to you, so there are no team reports." : "Your role doesn't run any HR report."} />
            )
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}

function FilterInput({ f, value, onChange }: { f: HrReportFilter; value: string; onChange: (v: string) => void }) {
  if (f.type === "department" || f.type === "select") {
    return (
      <select className="hr-in" value={value} onChange={(e) => onChange(e.target.value)} aria-label={f.label}>
        <option value="">{f.type === "department" ? "All departments" : "All"}</option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="hr-in"
      type={f.type === "date" ? "date" : "number"}
      min={f.type === "number" ? 0 : undefined}
      value={value}
      aria-label={f.label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ReportView() {
  const { id = "" } = useParams();
  const { user, sessionKey } = useInstitution();
  const [params, setParams] = useSearchParams();
  const team = params.get("team") === "1";
  const query = useMemo(() => {
    const q = new URLSearchParams(params);
    q.delete("team");
    return q.toString();
  }, [params]);
  const res = useApiResource<HrReportResult>(`/hr/reports/${encodeURIComponent(id)}${query ? `?${query}` : ""}`, {
    enabled: Boolean(user && id),
    refreshKey: sessionKey,
  });
  const d = res.data;
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const rows = useMemo(() => {
    if (!d) return [];
    if (!sort) return d.rows;
    const c = d.columns.find((x) => x.key === sort.key);
    if (!c) return d.rows;
    return [...d.rows].sort((a, b) => {
      const x = sortValue(c, a[c.key]);
      const y = sortValue(c, b[c.key]);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [d, sort]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value); // an empty value overrides the server's default ("All")
    setParams(next, { replace: true });
  }

  function value(f: HrReportFilter): string {
    const v = params.get(f.key) ?? d?.applied?.[f.key];
    return v === null || v === undefined ? "" : String(v);
  }

  async function exportAs(format: "csv" | "xlsx") {
    if (!d) return;
    setBusy(format);
    setMsg(null);
    try {
      const filters = Object.fromEntries(d.filters.map((f) => [f.key, value(f)]).filter(([, v]) => v !== ""));
      const name = await hrSaveFile(`/hr/reports/${encodeURIComponent(d.id)}/export`, { format, filters, reason: d.names ? reason.trim() : null }, `${d.id}.${format}`);
      setMsg({ kind: "ok", text: `Saved ${name}. The export is recorded in the access log.` });
    } catch (e) {
      setMsg({ kind: "bad", text: errorText(e, "Not exported.") });
    } finally {
      setBusy(null);
    }
  }

  const needReason = Boolean(d?.names) && reason.trim().length < MIN_REASON;
  const back = team ? "/hr/reports?team=1" : "/hr/reports";

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view hr-report-print">
        <div className="hr-report-noprint">
          <Crumbs items={team ? [["My team", "/team"], ["Reports", back], [d?.title ?? "Report"]] : [["Reports", back], [d?.title ?? "Report"]]} />
        </div>
        <div className="hr-head">
          <div>
            <h2>{d?.title ?? "Report"}</h2>
            <p>
              {d ? `${d.total} ${d.total === 1 ? "row" : "rows"}.` : null} {d?.description}
              {d?.scope === "team" ? " Only your reports are shown." : null}
            </p>
          </div>
          {d ? (
            <div className="hr-head__r hr-report-noprint">
              <button type="button" className="btn ghost" onClick={() => window.print()}>
                Print
              </button>
            </div>
          ) : null}
        </div>
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
          {d ? (
            <>
              {d.filters.length ? (
                <div className="hr-filters hr-report-noprint">
                  {d.filters.map((f) => (
                    <label key={f.key} className="hr-f">
                      <span>{f.label}</span>
                      <FilterInput f={f} value={value(f)} onChange={(v) => setFilter(f.key, v)} />
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="hr-report-printonly">
                {d.filters
                  .map((f) => [f.label, value(f)])
                  .filter(([, v]) => v)
                  .map(([l, v]) => `${l}: ${v}`)
                  .join(" · ")}
              </p>
              {d.note ? (
                <Banner kind="info" title="About this report">
                  {d.note}
                </Banner>
              ) : null}
              {d.summary.length ? (
                <div className="hr-cards hr-report-summary">
                  {d.summary.map((s) => (
                    <div key={s.label} className="hr-card">
                      <span className="l">{s.label}</span>
                      <span className="v">{s.value === null || s.value === undefined ? "—" : String(s.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {d.truncated ? (
                <Banner kind="warn" title={`Showing the first ${d.rows.length} of ${d.total} rows`}>
                  Narrow the filters, or export: the file has every row.
                </Banner>
              ) : null}
              {rows.length ? (
                <div className="hr-box hr-scroll">
                  <table className="hr-table">
                    <thead>
                      <tr>
                        {d.columns.map((c) => {
                          const on = sort?.key === c.key;
                          return (
                            <th key={c.key} className={c.type === "number" || c.type === "percent" ? "num" : undefined} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                              <button
                                type="button"
                                className="hr-th-sort"
                                onClick={() => setSort(on && sort.dir === 1 ? { key: c.key, dir: -1 } : { key: c.key, dir: 1 })}
                              >
                                {c.label}
                                {on ? (sort.dir === 1 ? " ▲" : " ▼") : null}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          {d.columns.map((c) => (
                            <td key={c.key} className={c.type === "number" || c.type === "percent" ? "num" : undefined}>
                              {cell(c, r[c.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No rows" detail="Nothing matches these filters." />
              )}
              <div className="hr-report-export hr-report-noprint">
                {d.names ? (
                  <label className="hr-f">
                    <span>Why you need this export (it names people; at least {MIN_REASON} characters)</span>
                    <textarea className="hr-in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                ) : null}
                <div className="hr-report-export__btns">
                  <button type="button" className="btn" disabled={Boolean(busy) || needReason} onClick={() => void exportAs("csv")}>
                    {busy === "csv" ? "Exporting…" : "Export CSV"}
                  </button>
                  <button type="button" className="btn" disabled={Boolean(busy) || needReason} onClick={() => void exportAs("xlsx")}>
                    {busy === "xlsx" ? "Exporting…" : "Export Excel"}
                  </button>
                </div>
                <p className="hr-report-export__note">Exports are logged.</p>
                {msg ? <Banner kind={msg.kind} title={msg.kind === "bad" ? "Not exported" : "Exported"}>{msg.text}</Banner> : null}
              </div>
            </>
          ) : null}
        </ResourceGate>
      </div>
    </RequireStaff>
  );
}
