import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, RecordDrawer } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type {
  GovernanceMeeting,
  GovernanceOverview,
  GovernanceRisk,
  PackSection,
} from "../api/types";
import { PackTrack } from "./PackTrack";
import { HeatMap } from "./HeatMap";
import {
  STUB_ACTIONS,
  STUB_CALENDAR,
  STUB_HEAT_RISKS,
  STUB_KPIS,
  STUB_NEXT_MEETING,
  STUB_NEXT_MEETING_UI,
  STUB_PACK_SECTIONS,
} from "./stubs";

function meetingWhen(m: GovernanceMeeting | null | undefined): {
  month: string;
  day: string;
  weekday: string;
  iso: string;
} {
  const iso = m?.scheduled_at || (m?.date ? `${m.date}T09:00:00` : "");
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return { month: "—", day: "—", weekday: "—", iso: "" };
  }
  return {
    month: d.toLocaleString(undefined, { month: "short", year: "numeric" }).toUpperCase(),
    day: String(d.getDate()).padStart(2, "0"),
    weekday: d.toLocaleString(undefined, {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    }),
    iso,
  };
}

function daysUntil(iso: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function calParts(date: string): { day: string; month: string } {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return { day: "—", month: "—" };
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
  };
}

function heatRisksFromCells(
  cells: GovernanceOverview["heat_cells"] | undefined,
): GovernanceRisk[] {
  if (!cells?.length) return [];
  // Expand counts into synthetic rows so HeatMap can tally L×I.
  const rows: GovernanceRisk[] = [];
  for (const c of cells) {
    for (let i = 0; i < c.count; i++) {
      rows.push({
        id: `heat-${c.L}-${c.I}-${i}`,
        title: "",
        status: "Open",
        residual_likelihood: c.L,
        residual_impact: c.I,
        score: c.L * c.I,
        band: c.L * c.I >= 15 ? "critical" : c.L * c.I >= 10 ? "high" : c.L * c.I >= 5 ? "medium" : "low",
        flagged_for_pack: false,
      });
    }
  }
  return rows;
}

function attendanceSummary(m: GovernanceMeeting | null | undefined) {
  const att = m?.attendance ?? [];
  if (att.length === 0) return null;
  const confirmed = att.filter(
    (a) => a.rsvp?.toLowerCase() === "yes" || a.attended === true,
  ).length;
  const apologies = att.filter((a) => a.apology || a.rsvp?.toLowerCase() === "no").length;
  const awaiting = att.length - confirmed - apologies;
  return { confirmed, apologies, awaiting, total: att.length };
}

/** Overview — composed from GET /governance/overview (WS-I5). */
export function OverviewView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const navigate = useNavigate();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<GovernanceOverview>("/governance/overview", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [heatFilter, setHeatFilter] = useState<string | null>(null);
  const [openMeeting, setOpenMeeting] = useState(false);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const useStub = useMemo(() => {
    if (!data) return true;
    // Thin Frappe stand-ins (e.g. Board Pack row as meeting) with no sections /
    // KPIs should still show the SoT demo scaffold — not a blank track.
    const hasTrack = (data.pack_track?.sections?.length ?? 0) > 0;
    const hasKpis =
      (data.kpis?.open_actions ?? 0) > 0 || (data.kpis?.overdue_actions ?? 0) > 0;
    const hasOverdue = (data.overdue_actions?.length ?? 0) > 0;
    return !hasTrack && !hasKpis && !hasOverdue;
  }, [data]);

  const nextMeeting = useStub
    ? STUB_NEXT_MEETING
    : (data?.next_meeting ?? null);
  const when = meetingWhen(useStub ? null : nextMeeting);
  const stubWhen = useStub ? meetingWhen(STUB_NEXT_MEETING) : when;

  const sections: PackSection[] = useMemo(() => {
    if (useStub) return STUB_PACK_SECTIONS.filter((s) => s.included !== false);
    const raw = data?.pack_track?.sections ?? [];
    return raw.filter((s) => s.included !== false);
  }, [useStub, data?.pack_track?.sections]);

  const readyCount = sections.filter((s) => String(s.status).toLowerCase() === "ready").length;
  const dueLabel =
    data?.pack_track?.due_label ||
    (useStub ? STUB_NEXT_MEETING_UI.pack_due_label : null);

  const kpis = useStub
    ? STUB_KPIS
    : [
        {
          id: "actions",
          label: "Open resolution actions",
          value: String(data?.kpis?.open_actions ?? 0),
          hint:
            (data?.kpis?.overdue_actions ?? 0) > 0
              ? `${data!.kpis!.overdue_actions} overdue`
              : undefined,
          hintTone: "bad" as const,
          to: "resolutions",
        },
        {
          id: "risks",
          label: "High and critical risks",
          value: String(data?.kpis?.high_critical_risks ?? 0),
          hint:
            (data?.kpis?.worsening_risks ?? 0) > 0
              ? `${data!.kpis!.worsening_risks} worsening`
              : undefined,
          hintTone: "warn" as const,
          to: "risks",
        },
        {
          id: "attendance",
          label: "Board attendance, 2026",
          value:
            data?.kpis?.board_attendance_pct != null
              ? `${Math.round(data.kpis.board_attendance_pct)}%`
              : "—",
          hint: undefined,
          hintTone: "good" as const,
          to: "members",
        },
        {
          id: "decls",
          label: "Declarations of interest due",
          value: String(data?.kpis?.declarations_due ?? 0),
          hint: (data?.kpis?.declarations_due ?? 0) > 0 ? "before next meeting" : undefined,
          hintTone: "warn" as const,
          to: "members",
        },
      ];

  const overdueActions: import("../api/types").ResolutionAction[] = useStub
    ? STUB_ACTIONS.filter((a) => a.status === "Overdue" || a.status === "Open").slice(0, 5)
    : (data?.overdue_actions ?? []).slice(0, 5);

  const recentRes = (data?.recent_resolutions ?? []).slice(0, 5);

  const calendar = useStub
    ? STUB_CALENDAR.map((c) => {
        const p = calParts(c.date);
        return {
          id: c.id,
          day: p.day,
          month: p.month,
          title: c.title,
          subtitle: c.kind ?? "",
          status_tone: "navy" as const,
          status_label: c.kind ?? "Scheduled",
        };
      })
    : (data?.calendar ?? []).map((c) => {
        const p = calParts(c.date);
        return {
          id: c.id,
          day: p.day,
          month: p.month,
          title: c.title,
          subtitle: c.kind ?? "",
          status_tone: "navy" as const,
          status_label: c.kind ?? "Scheduled",
        };
      });

  const heatRisks =
    useStub
      ? STUB_HEAT_RISKS
      : heatRisksFromCells(data?.heat_cells).length
        ? heatRisksFromCells(data?.heat_cells)
        : STUB_HEAT_RISKS;

  const att = attendanceSummary(nextMeeting);
  const displayTitle = useStub ? STUB_NEXT_MEETING.title : nextMeeting?.title ?? "No meeting scheduled";
  const displayId = useStub ? STUB_NEXT_MEETING.id : nextMeeting?.id ?? "—";
  const displayVenue = useStub ? STUB_NEXT_MEETING.venue : nextMeeting?.venue;
  const displayHybrid = useStub
    ? STUB_NEXT_MEETING_UI.online_label
    : nextMeeting?.hybrid
      ? nextMeeting.online_link || "Hybrid"
      : null;

  function onHeatSelect(key: string | null) {
    setHeatFilter(key);
    if (key) navigate(`/board/risks?heat=${encodeURIComponent(key)}`);
  }

  return (
    <ResourceGate
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRetry={() => void reload()}
      hasData={Boolean(data) || useStub}
      skeleton="dashboard"
      label="Loading board overview…"
    >
      <div className="gov">
        <div className="nextmtg">
          <div className="cal">
            <span className="m">{stubWhen.month}</span>
            <span className="d">{stubWhen.day}</span>
            <span className="w">{stubWhen.weekday}</span>
            <span className="in">In {daysUntil(stubWhen.iso || STUB_NEXT_MEETING.scheduled_at || "")} days</span>
          </div>
          <div className="nm">
            <div className="nm__top">
              <div>
                <h3>{displayTitle}</h3>
                <div className="nm__meta">
                  {displayVenue ? (
                    <span>
                      <Icon name="i-pin" />
                      {displayVenue}
                    </span>
                  ) : null}
                  {displayHybrid ? (
                    <span>
                      <Icon name="i-monitor" />
                      {displayHybrid}
                    </span>
                  ) : null}
                  <span className="mono">{displayId}</span>
                </div>
              </div>
              <div className="r">
                <button type="button" className="btn ghost sm" onClick={() => setOpenMeeting(true)}>
                  Open meeting
                </button>
                <Link to="/board/pack" className="btn gold sm">
                  <Icon name="i-layers" />
                  Build pack
                </Link>
              </div>
            </div>
            <div>
              <div className="pack-h">
                <b>Board pack</b>
                <span>
                  {readyCount} of {sections.length} sections ready
                </span>
                {dueLabel ? <span className="due">{dueLabel}</span> : null}
              </div>
              <PackTrack sections={sections} onSelect={() => navigate("/board/pack")} />
            </div>
            <div className="quorum">
              {useStub ? (
                <>
                  <div className="avs" aria-hidden>
                    {STUB_NEXT_MEETING_UI.avatars.map((a) => (
                      <i key={a.initials} className={a.kind}>
                        {a.initials}
                      </i>
                    ))}
                  </div>
                  <span>
                    <b style={{ color: "var(--ink)" }}>
                      {STUB_NEXT_MEETING_UI.confirmed} of {STUB_NEXT_MEETING_UI.total_members}{" "}
                      confirmed
                    </b>
                    , quorum of {STUB_NEXT_MEETING_UI.quorum} met. {STUB_NEXT_MEETING_UI.awaiting}{" "}
                    awaiting reply, {STUB_NEXT_MEETING_UI.apologies} apology.
                  </span>
                </>
              ) : att ? (
                <span>
                  <b style={{ color: "var(--ink)" }}>
                    {att.confirmed} of {att.total} confirmed
                  </b>
                  {att.awaiting || att.apologies
                    ? `, ${att.awaiting} awaiting, ${att.apologies} apologies.`
                    : null}
                </span>
              ) : (
                <span>Attendance will appear once members RSVP.</span>
              )}
            </div>
          </div>
        </div>

        <div className="kpis">
          {kpis.map((k) => (
            <Link key={k.id} to={`/board/${k.to}`} className="kpi" style={{ textDecoration: "none" }}>
              <div className="l">{k.label}</div>
              <div className="v">
                {k.value}
                {k.hint ? <small className={k.hintTone}>{k.hint}</small> : null}
              </div>
            </Link>
          ))}
        </div>

        <div className="grid g-3-2">
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Actions needing attention</h3>
                <p>From board and committee resolutions</p>
              </div>
              <div className="r">
                <Link to="/board/resolutions" className="btn ghost sm">
                  All actions
                </Link>
              </div>
            </div>
            <div className="list">
              {overdueActions.length === 0 ? (
                <EmptyState title="No open actions" detail="Resolution actions appear once recorded." />
              ) : (
                overdueActions.map((a) => {
                  const st = String(a.status).toLowerCase();
                  return (
                    <div
                      key={a.id}
                      className="li"
                      onClick={() => navigate("/board/resolutions")}
                      onKeyDown={(e) => e.key === "Enter" && navigate("/board/resolutions")}
                      role="button"
                      tabIndex={0}
                    >
                      <div>
                        <b>{a.description}</b>
                        <div className="sub">
                          {a.resolution ? <span className="ref">{a.resolution}</span> : null}
                          {a.owner ? <span>{a.owner}</span> : null}
                          {a.due_date ? <span>Due {a.due_date}</span> : null}
                        </div>
                      </div>
                      <span className={`st ${st.includes("overdue") ? "bad" : "warn"}`}>
                        {a.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Risk profile</h3>
                <p>Residual rating</p>
              </div>
              <div className="r">
                <Link to="/board/risks" className="btn ghost sm">
                  Register
                </Link>
              </div>
            </div>
            <div className="panel__b">
              <HeatMap risks={heatRisks} selected={heatFilter} onSelect={onHeatSelect} />
            </div>
          </div>
        </div>

        <div className="grid g-1-1">
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Governance calendar</h3>
                <p>Next 90 days</p>
              </div>
            </div>
            <div className="cl">
              {calendar.length === 0 ? (
                <EmptyState title="No upcoming items" detail="Calendar entries appear from Core." />
              ) : (
                calendar.map((c) => (
                  <div key={c.id} className="cl__i">
                    <div className="cl__d">
                      <b>{c.day}</b>
                      <span>{c.month}</span>
                    </div>
                    <div>
                      <div className="t">{c.title}</div>
                      <div className="s">{c.subtitle}</div>
                    </div>
                    <span className={`st ${c.status_tone}`}>{c.status_label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel__h">
              <div>
                <h3>Recent resolutions</h3>
                <p>Last meetings</p>
              </div>
              <div className="r">
                <Link to="/board/resolutions" className="btn ghost sm">
                  Register
                </Link>
              </div>
            </div>
            <div className="list">
              {recentRes.length === 0 ? (
                <div className="li">
                  <div>
                    <b>No resolutions yet</b>
                    <div className="sub">Live items appear from Core once available.</div>
                  </div>
                </div>
              ) : (
                recentRes.map((r) => (
                  <div
                    key={r.id}
                    className="li"
                    onClick={() => navigate("/board/resolutions")}
                    onKeyDown={(e) => e.key === "Enter" && navigate("/board/resolutions")}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <b>{r.title ?? r.text ?? r.id}</b>
                      <div className="sub">
                        <span className="ref">{r.id}</span>
                        <span>{r.meeting || "—"}</span>
                      </div>
                    </div>
                    <span className="st navy">{r.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <RecordDrawer
          open={openMeeting}
          onClose={() => setOpenMeeting(false)}
          reference={displayId}
          title={displayTitle}
          subtitle={stubWhen.weekday}
          sections={[
            {
              heading: "Meeting",
              content: (
                <>
                  <div className="kv">
                    <b>Body</b>
                    <span>
                      {useStub
                        ? STUB_NEXT_MEETING.body
                        : nextMeeting?.body_name || nextMeeting?.body || "—"}
                    </span>
                  </div>
                  <div className="kv">
                    <b>Venue</b>
                    <span>{displayVenue || "—"}</span>
                  </div>
                  <div className="kv">
                    <b>Status</b>
                    <span>{useStub ? "Scheduled" : nextMeeting?.status || "—"}</span>
                  </div>
                </>
              ),
            },
          ]}
          actions={[
            {
              label: "Build pack",
              icon: "i-layers",
              variant: "gold",
              onClick: () => {
                setOpenMeeting(false);
                navigate("/board/pack");
              },
            },
            {
              label: "Close",
              variant: "ghost",
              onClick: () => setOpenMeeting(false),
            },
          ]}
        />
      </div>
    </ResourceGate>
  );
}
