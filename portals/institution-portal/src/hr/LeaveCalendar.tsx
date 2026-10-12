import { useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import type { HrLeaveCalendar } from "../api/types";

/** H4 calendar: approved leave solid, open requests dashed, Field Visits "F". Live GET /hr/leave/calendar (scoped). */

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

function label(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function LeaveCalendar({ enabled, refreshKey }: { enabled: boolean; refreshKey?: string | number | null }) {
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const x = new Date(start);
      x.setUTCDate(start.getUTCDate() + i);
      if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6) out.push(x);
    }
    return out;
  }, [start]);
  const from = isoDay(days[0]);
  const to = isoDay(days[days.length - 1]);
  const res = useApiResource<HrLeaveCalendar>(`/hr/leave/calendar?start=${from}&end=${to}`, { enabled, refreshKey });
  const d = res.data;

  // Only people with something on in the window; the full list would be the whole directory for HR.
  const people = useMemo(() => (d ? d.people.filter((p) => d.entries.some((e) => e.employee === p.employee)) : []), [d]);

  function cell(employee: string, day: string) {
    const e = d?.entries.find((x) => x.employee === employee && x.from_date <= day && x.to_date >= day);
    if (!e) return null;
    const letter = e.kind === "field" ? "F" : (e.label || "?").charAt(0).toUpperCase();
    return { letter, title: `${e.label}${e.approved ? "" : " (requested)"}`, pending: !e.approved };
  }

  function shift(weeks: number) {
    const x = new Date(start);
    x.setUTCDate(x.getUTCDate() + weeks * 7);
    setStart(x);
  }

  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Leave calendar</h3>
          <p>
            {label(from)} to {label(to)}. Solid is approved, dashed is waiting, F is a field visit.
          </p>
        </div>
        <div className="hr-head__r">
          <button type="button" className="btn ghost sm" onClick={() => shift(-2)}>
            Earlier
          </button>
          <button type="button" className="btn ghost sm" onClick={() => shift(2)}>
            Later
          </button>
        </div>
      </div>
      <div className="hr-box__b">
        <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="panel">
          {people.length ? (
            <div className="hr-scroll">
              <table className="hr-table" aria-label="Leave calendar">
                <thead>
                  <tr>
                    <th>Person</th>
                    {days.map((x) => (
                      <th key={isoDay(x)} style={{ textAlign: "center" }}>
                        {label(isoDay(x))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.employee}>
                      <td>
                        <b>{p.employee_name || p.employee}</b>
                        {p.department ? <small style={{ display: "block", color: "var(--muted)" }}>{p.department}</small> : null}
                      </td>
                      {days.map((x) => {
                        const c = cell(p.employee, isoDay(x));
                        return (
                          <td key={isoDay(x)} style={{ textAlign: "center" }} title={c?.title}>
                            {c ? (
                              <span
                                aria-label={c.title}
                                style={{
                                  display: "inline-grid",
                                  placeItems: "center",
                                  width: 28,
                                  height: 24,
                                  borderRadius: 6,
                                  fontWeight: 800,
                                  fontSize: 12,
                                  background: c.pending ? "transparent" : "var(--navy-l, #eceefc)",
                                  border: c.pending ? "1.5px dashed var(--navy)" : "0",
                                }}
                              >
                                {c.letter}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nobody away" detail="No approved leave, open requests or field visits in these two weeks." />
          )}
        </ResourceGate>
      </div>
    </div>
  );
}
