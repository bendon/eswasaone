import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import type { DatesSetArg, EventInput } from "@fullcalendar/core";
import { useApiResource } from "../hooks/useApiResource";
import { ErrorState } from "../components/PageStates";
import type { HrLeaveCalendar } from "../api/types";

/** H4 calendar: approved leave solid, open requests dashed, Field Visits purple, holidays shaded. Live GET /hr/leave/calendar (scoped, ≤ 62 days). */

type Holiday = { date: string; description?: string | null };

/** Local calendar day as YYYY-MM-DD (FullCalendar hands us local midnights). */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return isoDay(d);
}

const LEGEND = [
  { cls: "leave", label: "Approved leave" },
  { cls: "pending", label: "Requested" },
  { cls: "field", label: "Field visit" },
  { cls: "holiday", label: "Public holiday" },
];

export function LeaveCalendar({ enabled, refreshKey, holidays = [] }: { enabled: boolean; refreshKey?: string | number | null; holidays?: Holiday[] }) {
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [department, setDepartment] = useState("");
  const res = useApiResource<HrLeaveCalendar>(range ? `/hr/leave/calendar?start=${range.start}&end=${range.end}` : "", {
    enabled: enabled && Boolean(range),
    refreshKey,
  });
  const d = res.data;

  const departments = useMemo(() => [...new Set((d?.people ?? []).map((p) => p.department).filter(Boolean) as string[])].sort(), [d]);

  const events = useMemo<EventInput[]>(() => {
    if (!d) return [];
    const people = new Map(d.people.map((p) => [p.employee, p]));
    const out: EventInput[] = d.entries
      .filter((e) => !department || people.get(e.employee)?.department === department)
      .map((e, i) => {
        const who = people.get(e.employee)?.employee_name || e.employee;
        const kind = e.kind === "field" ? "field" : e.approved ? "leave" : "pending";
        return {
          id: `${e.employee}-${e.from_date}-${i}`,
          title: `${who} · ${e.label}${kind === "pending" ? " (requested)" : ""}`,
          start: e.from_date,
          end: nextDay(e.to_date),
          allDay: true,
          classNames: [`eo-fc-ev--${kind}`],
        };
      });
    for (const h of holidays) {
      out.push({ id: `hol-${h.date}`, title: h.description || "Holiday", start: h.date, allDay: true, display: "background", classNames: ["eo-fc-ev--holiday"] });
    }
    return out;
  }, [d, department, holidays]);

  function onDates(info: DatesSetArg) {
    const end = new Date(info.end);
    end.setDate(end.getDate() - 1);
    const next = { start: isoDay(info.start), end: isoDay(end) };
    setRange((r) => (r && r.start === next.start && r.end === next.end ? r : next));
  }

  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Leave calendar</h3>
          <p>Who is away, who has asked, and who is out on a field visit.</p>
        </div>
        <div className="hr-head__r" style={{ alignItems: "center" }}>
          <span className="eo-fc-legend">
            {LEGEND.map((l) => (
              <span key={l.cls} className={`eo-fc-ev--${l.cls}`}>
                <i />
                {l.label}
              </span>
            ))}
          </span>
          {departments.length > 1 ? (
            <select className="hr-in" aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: "auto" }}>
              <option value="">All departments</option>
              {departments.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <div className="hr-box__b">
        {res.error && !d ? <ErrorState message={res.error} onRetry={res.reload} /> : null}
        <div className={`eo-fc eo-fc--flat${res.loading || res.refreshing ? " is-loading" : ""}`} aria-label="Leave calendar" aria-busy={res.loading || res.refreshing}>
          <FullCalendar
            plugins={[dayGridPlugin, listPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,listMonth" }}
            buttonText={{ today: "Today", month: "Month", week: "Week", list: "Agenda" }}
            firstDay={1}
            height="auto"
            dayMaxEvents={3}
            moreLinkClick="popover"
            fixedWeekCount={false}
            noEventsContent="Nobody away in this period."
            events={events}
            datesSet={onDates}
            eventDidMount={(info) => {
              info.el.title = info.event.title;
            }}
          />
        </div>
      </div>
    </div>
  );
}
