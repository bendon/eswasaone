import { useEffect, useMemo, useState } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import {
  AuthError,
  FormDrawer,
  Icon,
  RecordDrawer,
  Toast,
  useConfirmAction,
  type DrawerAction,
  type DrawerSection,
  type FormDrawerField,
  type IconName,
} from "@eswasaone/shared-ui";
import type {
  AllowedAction,
  GovernanceMeeting,
  GovernanceMeetingAct,
  GovernanceMeetingsResponse,
} from "../api/types";
import { PackTrack } from "./PackTrack";
import { govPost } from "./api";

type StatusFilter =
  | ""
  | "Scheduled"
  | "Pack issued"
  | "Held"
  | "Minutes in draft"
  | "Minutes approved";

const WORKFLOW_STATUSES: StatusFilter[] = [
  "Scheduled",
  "Pack issued",
  "Held",
  "Minutes in draft",
  "Minutes approved",
];

const STATUS_TONE: Record<string, string> = {
  Scheduled: "navy",
  "Pack issued": "info",
  Held: "warn",
  "Minutes in draft": "warn",
  "Minutes approved": "ok",
  Cancelled: "bad",
};

const MEETING_ACTS = new Set<GovernanceMeetingAct["action"]>([
  "reschedule",
  "cancel",
  "record_attendance",
  "start_minutes",
  "submit_minutes",
  "approve_minutes",
]);

function toneFor(status?: string): string {
  if (!status) return "mute";
  if (status in STATUS_TONE) return STATUS_TONE[status]!;
  return "mute";
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function attendanceLabel(m: GovernanceMeeting): string {
  const rows = m.attendance ?? [];
  if (!rows.length) return "—";
  const yes = rows.filter((a) => (a.rsvp ?? "").toLowerCase() === "yes").length;
  return `${yes}/${rows.length}`;
}

function minutesLabel(status: string): string {
  const k = status.toLowerCase();
  if (k.includes("minutes approved")) return "Approved";
  if (k.includes("minutes in draft") || k.includes("draft")) return "Draft";
  if (k === "held") return "Pending";
  return "—";
}

function packLabel(m: GovernanceMeeting): string {
  if (m.pack_track) {
    const ready = m.pack_track.sections.filter((s) => s.status === "ready").length;
    const n = m.pack_track.sections.length;
    if (m.status === "Pack issued") return `Issued`;
    if (n) return `Building (${ready}/${n})`;
  }
  if (m.pack_id) return m.pack_id;
  return "—";
}

function actionIcon(action: string): IconName {
  if (action.includes("cancel")) return "i-x";
  if (action.includes("minutes")) return "i-file";
  if (action.includes("attendance")) return "i-users";
  return "i-check";
}

const MEETING_FIELDS: FormDrawerField[] = [
  { name: "title", label: "Title", required: true },
  {
    name: "body",
    label: "Body",
    type: "select",
    options: [
      { value: "Full Board", label: "Full Board" },
      { value: "Audit & Risk Committee", label: "Audit & Risk Committee" },
      { value: "Technical Committee", label: "Technical Committee" },
    ],
  },
  { name: "date", label: "Date", type: "date", required: true },
  { name: "venue", label: "Venue", placeholder: "ESWASA Boardroom" },
];

/** Meetings — workflow statuses + allowed_actions[] → POST .../act. */
export function MeetingsView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const { confirmAction, host } = useConfirmAction();
  const { data, loading, refreshing, error, authRequired, reload } =
    useApiResource<GovernanceMeetingsResponse>("/governance/meetings", {
      enabled: Boolean(user),
      refreshKey: sessionKey,
    });

  const [bodyFilter, setBodyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const items = data?.items ?? [];

  const bodies = useMemo(() => {
    const set = new Set<string>();
    for (const m of items) {
      const body = m.body_name || m.body;
      if (body) set.add(body);
    }
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((m) => {
      const body = m.body_name || m.body || "";
      if (bodyFilter && body !== bodyFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (!needle) return true;
      return `${m.id} ${m.title} ${body} ${m.status}`.toLowerCase().includes(needle);
    });
  }, [items, bodyFilter, statusFilter, q]);

  const openMeeting = items.find((m) => m.id === openId) ?? null;

  async function runAllowed(m: GovernanceMeeting, act: AllowedAction) {
    const ok = await confirmAction({
      title: act.label,
      message: `${act.label} for “${m.title}”?`,
      consequence: act.consequence ?? undefined,
      ruleId: act.rule_id ?? undefined,
      confirmLabel: act.label,
      danger: act.danger,
    });
    if (!ok) return;

    const action = act.action as GovernanceMeetingAct["action"];
    if (!MEETING_ACTS.has(action)) {
      // TODO: wire real — non-enum allowed_actions (e.g. issue_pack) once Core expands Act schema
      setFlash(`${act.label} — action “${act.action}” not in Act schema yet`);
      return;
    }

    setBusy(true);
    try {
      await govPost<GovernanceMeeting>(
        `/governance/meetings/${encodeURIComponent(m.id)}/act`,
        { action, confirm: true } satisfies GovernanceMeetingAct,
      );
      setFlash(`${act.label} — done`);
      void reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const drawerSections: DrawerSection[] = openMeeting
    ? [
        {
          heading: "Meeting details",
          content: (
            <>
              <div className="kv">
                <b>Title</b>
                <span>{openMeeting.title}</span>
              </div>
              <div className="kv">
                <b>Body</b>
                <span>{openMeeting.body_name || openMeeting.body || "—"}</span>
              </div>
              <div className="kv">
                <b>Date</b>
                <span>{fmtDate(openMeeting.scheduled_at ?? openMeeting.date)}</span>
              </div>
              <div className="kv">
                <b>Status</b>
                <span className={`st ${toneFor(openMeeting.status)}`}>{openMeeting.status}</span>
              </div>
            </>
          ),
        },
        ...(openMeeting.pack_track?.sections?.length
          ? [
              {
                heading: "Pack track",
                content: <PackTrack sections={openMeeting.pack_track.sections} />,
              } satisfies DrawerSection,
            ]
          : []),
      ]
    : [];

  const drawerActions: DrawerAction[] = openMeeting
    ? [
        ...(openMeeting.allowed_actions ?? []).map((act) => ({
          label: act.label,
          icon: actionIcon(act.action),
          variant: (act.danger ? "ghost" : "gold") as DrawerAction["variant"],
          disabled: busy,
          onClick: () => void runAllowed(openMeeting, act),
        })),
        {
          label: "Close",
          variant: "ghost",
          onClick: () => setOpenId(null),
        },
      ]
    : [];

  async function onSchedule(values: Record<string, string>) {
    const ok = await confirmAction({
      title: "Schedule meeting",
      message: `Schedule “${values.title}”?`,
      consequence: "Creates a Board Meeting and pack draft via Core.",
      ruleId: "R-G2",
      confirmLabel: "Schedule",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await govPost<GovernanceMeeting>("/governance/meetings", {
        title: values.title,
        body: values.body || null,
        meeting_type: "Ordinary",
        date: values.date || undefined,
        venue: values.venue || undefined,
        hybrid: false,
        confirm: true,
      });
      setFlash(`Meeting scheduled — ${values.title}`);
      setFormOpen(false);
      void reload();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else setFlash(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceGate
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRetry={reload}
      hasData={data != null}
      skeleton="list"
      label="Loading meetings…"
    >
      <div className="gov">
        {host}
        <Toast message={flash} />

        <div className="toolbar">
          <select
            className="sel"
            aria-label="Filter by body"
            value={bodyFilter}
            onChange={(e) => setBodyFilter(e.target.value)}
          >
            <option value="">All bodies</option>
            {bodies.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            className="sel"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="">All statuses</option>
            {WORKFLOW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="search">
            <Icon name="i-search" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search meetings"
              aria-label="Search meetings"
            />
          </label>
          <button type="button" className="btn pri" onClick={() => setFormOpen(true)}>
            <Icon name="i-plus" />
            Schedule meeting
          </button>
        </div>

        <div className="panel">
          <div className="tbl-wrap">
            {filtered.length === 0 ? (
              <EmptyState
                title={items.length ? "No meetings match" : "Nothing here yet"}
                detail={
                  items.length
                    ? "Adjust filters above."
                    : "Meetings will appear once they are scheduled."
                }
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th>Date</th>
                    <th>Pack</th>
                    <th>Attendance</th>
                    <th>Minutes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const body = m.body_name || m.body;
                    return (
                      <tr key={m.id} onClick={() => setOpenId(m.id)}>
                        <td>
                          <div className="t">{m.title}</div>
                          <div className="s">
                            <span className="mono">{m.id}</span>
                            {body ? ` · ${body}` : ""}
                          </div>
                        </td>
                        <td>{fmtDate(m.scheduled_at ?? m.date)}</td>
                        <td>{packLabel(m)}</td>
                        <td>{attendanceLabel(m)}</td>
                        <td>{minutesLabel(m.status)}</td>
                        <td>
                          <span className={`st ${toneFor(m.status)}`}>{m.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <RecordDrawer
          open={Boolean(openMeeting)}
          onClose={() => setOpenId(null)}
          reference={openMeeting?.id}
          title={openMeeting?.title ?? "Meeting"}
          subtitle={openMeeting ? fmtDate(openMeeting.scheduled_at ?? openMeeting.date) : null}
          sections={drawerSections}
          actions={drawerActions}
        />

        <FormDrawer
          open={formOpen}
          title="Schedule meeting"
          mode="create"
          fields={MEETING_FIELDS}
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSubmit={onSchedule}
        />
      </div>
    </ResourceGate>
  );
}
