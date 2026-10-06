import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  askAgent,
  apiFetch,
  AuthError,
  Icon,
  RecordDrawer,
  Toast,
  type DrawerAction,
  type DrawerSection,
  type InstitutionHome,
  type IconName,
  DateField,
} from "@eswasaone/shared-ui";
import { Bar } from "react-chartjs-2";
import { fontSans } from "@eswasaone/shared-ui/system";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useInstitution } from "../layout/InstitutionLayout";
import { pathForRouteId, routeFromAsk } from "../nav";
import {
  MODULE_TILES,
  type PriorityItem,
  type SysStatus,
} from "../dashboard/fixtures";
import { buildLiveAttentionQueue } from "../dashboard/attention";
import { probeCoreHealth } from "../lib/coreHealth";
import type {
  ApprovalsResponse,
  AuditSummary,
  FinanceDashboard,
  TbtNotificationsResponse,
} from "../api/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = fontSans;
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = "#8A9AB1";

type RangeId = "Day" | "Week" | "Month" | "Quarter";

const RANGES: RangeId[] = ["Day", "Week", "Month", "Quarter"];

type DashKpi = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  meta: string;
  delta?: { dir: "up" | "down" | "flat"; text: string };
  icon: IconName;
  tint: string;
  tone: string;
};

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatOpsDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatOpsTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function firstName(full: string | undefined, fallback: string): string {
  const raw = (full || fallback || "").trim();
  return raw.split(/\s+/)[0] || "there";
}

function relativeClock(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const now = new Date();
  const sameDay =
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate();
  if (sameDay) {
    return t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return `Yesterday ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function feedDot(severity?: string): string {
  if (severity === "success") return "var(--green)";
  if (severity === "warn") return "var(--amber)";
  if (severity === "critical") return "var(--red)";
  return "var(--navy)";
}

export function InstitutionHomePage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const navigate = useNavigate();
  const [home, setHome] = useState<InstitutionHome | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [approvals, setApprovals] = useState<ApprovalsResponse | null>(null);
  const [tbt, setTbt] = useState<TbtNotificationsResponse | null>(null);
  const [overdueAudits, setOverdueAudits] = useState<AuditSummary[]>([]);
  const [coreHealth, setCoreHealth] = useState<"up" | "down" | "unknown">("unknown");
  const [range, setRange] = useState<RangeId>("Month");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  // Attention queue detail drawer
  const [selected, setSelected] = useState<PriorityItem | null>(null);
  const [draftDue, setDraftDue] = useState("");
  const [chaseNote, setChaseNote] = useState("");
  const [acting, setActing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void probeCoreHealth()
      .then(setCoreHealth)
      .catch(() => setCoreHealth("down"));
  }, [sessionKey]);

  useEffect(() => {
    void apiFetch<InstitutionHome>("/home/institution")
      .then(setHome)
      .catch((err: unknown) => {
        if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
        else console.error(err);
      });
  }, [sessionKey, openAuth]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.allSettled([
      apiFetch<FinanceDashboard>("/finance/kpis"),
      apiFetch<ApprovalsResponse>("/approvals?limit=5"),
      apiFetch<TbtNotificationsResponse>("/tbt/alerts?limit=5"),
      apiFetch<{ items?: AuditSummary[] }>("/certification/audits/overdue"),
    ]).then(([f, a, t, aud]) => {
      if (cancelled) return;
      if (f.status === "fulfilled") setFinance(f.value);
      if (a.status === "fulfilled") setApprovals(a.value);
      if (t.status === "fulfilled") setTbt(t.value);
      if (aud.status === "fulfilled") setOverdueAudits(aud.value.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [user, sessionKey]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const handleAsk = useCallback(
    async (message: string) => {
      const q = message.trim();
      if (!q) return;
      setBusy(true);
      try {
        const res = await askAgent({ message: q, context: { portal: "institution" } });
        showToast(res.answer.slice(0, 120) || "Done.");
        const dest = routeFromAsk(q, res.tools_used);
        if (dest && dest !== "/") navigate(dest);
      } catch (err) {
        if (err instanceof AuthError && err.authRequired) {
          openAuth(err.reason || err.message);
          showToast("Sign in to continue with that action.");
        } else {
          showToast("Assistant unavailable right now.");
        }
      } finally {
        setBusy(false);
        setAsk("");
      }
    },
    [navigate, openAuth, showToast],
  );

  function onOpsSubmit(e: FormEvent) {
    e.preventDefault();
    void handleAsk(ask);
  }

  const name = firstName(user.full_name, user.username);
  const pendingCount = approvals?.pending_count ?? 0;

  const priority: PriorityItem[] = useMemo(() => {
    const items = buildLiveAttentionQueue({
      approvals: approvals?.items,
      overdueAudits,
      tbt: tbt?.items,
    });
    return items.filter((it) => !dismissed.has(it.id));
  }, [approvals, overdueAudits, tbt, dismissed]);
  const attentionN = priority.length;

  const kpis: DashKpi[] = useMemo(() => {
    const fromApi = home?.kpis ?? [];
    const byKey = Object.fromEntries(fromApi.map((k) => [k.key, k]));
    const openApps = byKey.open_apps ?? byKey.pending ?? byKey.certified;
    const pastSlaApi = byKey.past_sla ?? byKey.overdue;
    const auditsApi = byKey.audits_week ?? byKey.audits;
    const revenue = byKey.revenue;
    const standards = byKey.standards_ytd ?? byKey.standards;

    // Client-side fallbacks from data already loaded for the attention queue.
    const pastSlaFallback =
      approvals?.items != null
        ? String(approvals.items.filter((i) => i.sla_breached).length)
        : undefined;
    const auditsFallback =
      overdueAudits.length > 0
        ? String(overdueAudits.length)
        : byKey.overdue_audits?.value != null
          ? String(byKey.overdue_audits.value)
          : undefined;

    const pastSlaVal =
      pastSlaApi?.value != null ? String(pastSlaApi.value) : pastSlaFallback;
    const auditsVal =
      auditsApi?.value != null ? String(auditsApi.value) : auditsFallback;

    const revVal =
      finance != null
        ? `${Math.round(finance.revenue_ytd_szl / 1000).toLocaleString()}`
        : revenue?.value != null
          ? String(revenue.value)
          : "—";

    const dash = (value: string | undefined, unit: string, meta: string, extras: Partial<DashKpi>): DashKpi => ({
      key: extras.key || "k",
      label: extras.label || "",
      value: value ?? "—",
      unit: value != null && value !== "—" ? unit : undefined,
      meta: value != null && value !== "—" ? meta : "Awaiting live data",
      icon: extras.icon || "i-badge",
      tint: extras.tint || "#ECEEFC",
      tone: extras.tone || "#313391",
      delta: extras.delta,
    });

    return [
      dash(openApps?.value != null ? String(openApps.value) : undefined, "active", "Open applications", {
        key: "open",
        label: "Open applications",
        icon: "i-badge",
        tint: "#ECEEFC",
        tone: "#313391",
      }),
      dash(pastSlaVal, "overdue", "Open ToDos past due", {
        key: "sla",
        label: "Past SLA",
        icon: "i-warn",
        tint: "#FDECEC",
        tone: "#9F1239",
      }),
      dash(
        auditsVal,
        auditsApi?.value != null ? "scheduled" : "overdue",
        auditsApi?.value != null ? "This week" : "Overdue (fallback)",
        {
          key: "audits",
          label: "Audits this week",
          icon: "i-cal",
          tint: "#FEF6DC",
          tone: "#B8860B",
        },
      ),
      {
        key: "revenue",
        label: "Revenue YTD",
        value: revVal,
        unit: revVal !== "—" ? "k" : undefined,
        meta:
          finance != null
            ? `${(100 + (finance.variance_pct || 0)).toFixed(0)}% of target`
            : revVal !== "—"
              ? "From home KPIs"
              : "Awaiting live data",
        delta:
          finance != null
            ? {
                dir: finance.variance_pct >= 0 ? "up" : "down",
                text: `${finance.variance_pct >= 0 ? "+" : ""}${finance.variance_pct.toFixed(1)}%`,
              }
            : undefined,
        icon: "i-dollar",
        tint: "#DCFCE7",
        tone: "#166534",
      },
      dash(standards?.value != null ? String(standards.value) : undefined, "published", "Year to date", {
        key: "standards",
        label: "Standards YTD",
        icon: "i-file",
        tint: "#F0E9FB",
        tone: "#7C3AED",
      }),
    ];
  }, [home, finance, approvals, overdueAudits]);

  const systemStatus: SysStatus[] = useMemo(() => {
    const coreRow: SysStatus = {
      label: "Core API",
      state: coreHealth === "up" ? "up" : coreHealth === "down" ? "down" : "warn",
      value:
        coreHealth === "up" ? "Reachable" : coreHealth === "down" ? "Unreachable" : "Checking…",
    };
    return [coreRow];
  }, [coreHealth]);

  const systemFoot =
    coreHealth === "up"
      ? "Core API reachable"
      : coreHealth === "down"
        ? "Core API unreachable"
        : "Checking Core API…";

  const feed = home?.feed ?? [];

  const openItem = useCallback((item: PriorityItem) => {
    setSelected(item);
    setDraftDue(item.dueDate || "");
    setChaseNote(
      item.kind === "lab_chase"
        ? `Please prioritise the outstanding lab panel for ${item.ref || item.title}. SLA is ${item.sla.label}.`
        : "",
    );
  }, []);

  const closeDrawer = useCallback(() => {
    setSelected(null);
    setDraftDue("");
    setChaseNote("");
    setActing(false);
  }, []);

  const dismissItem = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  async function confirmReschedule() {
    if (!selected || !draftDue) {
      showToast("Pick a new scheduled date.");
      return;
    }
    setActing(true);
    try {
      if (selected.kind === "audit_reschedule" || selected.kind === "audit_overdue") && selected.name) {
        await apiFetch(`/certification/audits/${encodeURIComponent(selected.name)}`, {
          method: "PATCH",
          headers: { "Idempotency-Key": `${selected.name}-reschedule-${Date.now()}` },
          body: JSON.stringify({
            action: "reschedule",
            confirm: true,
            payload: { due_date: draftDue },
          }),
        });
        showToast(`Rescheduled ${selected.name} to ${draftDue}`);
        dismissItem(selected.id);
        closeDrawer();
        return;
      }
      // Fallback navigate into audits desk for non-live stubs.
      showToast(`Opening audit to reschedule for ${draftDue}`);
      const href = selected.href;
      closeDrawer();
      dismissItem(selected.id);
      if (href) {
        navigate(
          href.includes("?")
            ? `${href}&date=${encodeURIComponent(draftDue)}`
            : `${href}?date=${encodeURIComponent(draftDue)}`,
        );
      }
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else showToast(err instanceof Error ? err.message : "Reschedule failed");
    } finally {
      setActing(false);
    }
  }

  async function confirmChaseLab() {
    if (!selected) return;
    const note = chaseNote.trim();
    if (!note) {
      showToast("Add a short note for the lab desk.");
      return;
    }
    setActing(true);
    // TODO: wire real — POST messaging / metrology chase endpoint
    await new Promise((r) => window.setTimeout(r, 300));
    showToast(`Chaser sent for ${selected.ref || "lab panel"}`);
    dismissItem(selected.id);
    setActing(false);
    closeDrawer();
  }

  async function confirmApproval(outcome: "approve" | "reject" | "return") {
    if (!selected?.doctype || !selected?.name) {
      showToast("Missing document reference.");
      return;
    }
    setActing(true);
    try {
      if (selected.live) {
        await apiFetch(
          `/approvals/${encodeURIComponent(selected.doctype)}/${encodeURIComponent(selected.name)}/act`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: outcome, confirm: true }),
          },
        );
      }
      showToast(
        outcome === "approve"
          ? `Approved ${selected.name}`
          : outcome === "reject"
            ? `Rejected ${selected.name}`
            : `Returned ${selected.name}`,
      );
      dismissItem(selected.id);
      closeDrawer();
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) openAuth(err.reason);
      else showToast(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  function openInModule() {
    if (!selected?.href) {
      showToast("No module link for this item.");
      return;
    }
    const href = selected.href;
    closeDrawer();
    navigate(href);
  }

  const drawerSections: DrawerSection[] = selected
    ? [
        {
          heading: "Details",
          content: (
            <>
              {selected.details.map((d) => (
                <div className="kv" key={d.label}>
                  <b>{d.label}</b>
                  <span
                    className={
                      d.label.toLowerCase().includes("id") ||
                      d.label === "Document" ||
                      d.label === "Application" ||
                      d.label === "Symbol" ||
                      d.label === "Audit ID"
                        ? "mono"
                        : undefined
                    }
                  >
                    {d.value}
                  </span>
                </div>
              ))}
              <div className="kv">
                <b>SLA</b>
                <span className={`sla ${selected.sla.kind}`}>
                  <span className="d" />
                  {selected.sla.label}
                </span>
              </div>
            </>
          ),
        },
        ...(selected.kind === "audit_reschedule"
          ? [
              {
                heading: "Reschedule",
                content: (
                  <div className="kv">
                    <b>New date</b>
                    <DateField
                      value={draftDue}
                      onChange={setDraftDue}
                      ariaLabel="New date"
                      required
                    />
                  </div>
                ),
              } satisfies DrawerSection,
            ]
          : []),
        ...(selected.kind === "lab_chase"
          ? [
              {
                heading: "Chase note",
                content: (
                  <div
                    className="kv"
                    style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
                  >
                    <b>Message to lab desk</b>
                    <textarea
                      value={chaseNote}
                      onChange={(e) => setChaseNote(e.target.value)}
                      rows={4}
                      style={{
                        font: "inherit",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--line)",
                        width: "100%",
                        resize: "vertical",
                      }}
                    />
                  </div>
                ),
              } satisfies DrawerSection,
            ]
          : []),
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        ...(selected.kind === "audit_reschedule"
          ? [
              {
                label: acting ? "Saving…" : "Confirm reschedule",
                icon: "i-cal" as IconName,
                variant: "gold" as const,
                disabled: acting || !draftDue,
                onClick: () => void confirmReschedule(),
              },
            ]
          : []),
        ...(selected.kind === "lab_chase"
          ? [
              {
                label: acting ? "Sending…" : "Send chaser",
                icon: "i-send" as IconName,
                variant: "gold" as const,
                disabled: acting || !chaseNote.trim(),
                onClick: () => void confirmChaseLab(),
              },
            ]
          : []),
        ...(selected.kind === "approval"
          ? [
              {
                label: acting ? "Working…" : "Approve",
                icon: "i-check" as IconName,
                variant: "gold" as const,
                disabled: acting,
                onClick: () => void confirmApproval("approve"),
              },
              {
                label: "Reject",
                icon: "i-x" as IconName,
                variant: "ghost" as const,
                disabled: acting,
                onClick: () => void confirmApproval("reject"),
              },
            ]
          : []),
        ...(selected.kind === "committee" ||
        selected.kind === "tbt" ||
        selected.kind === "comment" ||
        selected.kind === "generic"
          ? [
              {
                label: selected.action.label,
                icon: selected.action.icon,
                variant: "gold" as const,
                onClick: openInModule,
              },
            ]
          : []),
        {
          label: selected.href ? "Open in module" : "Close",
          icon: selected.href ? ("i-open" as IconName) : ("i-x" as IconName),
          variant: "ghost" as const,
          onClick: selected.href ? openInModule : closeDrawer,
        },
      ]
    : [];

  const chartMonths = finance?.months;
  const hasChart =
    Boolean(chartMonths?.labels?.length) &&
    Boolean(chartMonths?.budget_thousands?.length) &&
    Boolean(chartMonths?.actual_thousands?.length);

  const planRows = finance?.plan && finance.plan.length > 0 ? finance.plan : [];

  function planWidth(status: string): string {
    if (status === "green") return "86%";
    if (status === "red") return "64%";
    return "67%";
  }

  function planColor(status: string): string {
    if (status === "green") return "var(--green)";
    if (status === "red") return "var(--red)";
    return "var(--amber)";
  }

  return (
    <div className="dash">
      <section className="ops" aria-label="Operations bar">
        <div className="ops__copy">
          <b>
            {formatOpsDate(now)} · {formatOpsTime(now)}
          </b>
          <span>
            {greetingFor(now.getHours())}, {name}.{" "}
            {attentionN > 0
              ? `${attentionN} item${attentionN === 1 ? "" : "s"} need your attention today.`
              : "Nothing needs your attention right now."}
          </span>
        </div>

        <form className="ops__search" role="search" onSubmit={onOpsSubmit}>
          <Icon name="i-search" />
          <label className="sr-only" htmlFor="opsInput">
            Ask EswasaOne
          </label>
          <input
            id="opsInput"
            type="text"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder='Ask EswasaOne, e.g. “audits overdue this week”, “APP-2026-00042”, “revenue YTD”…'
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" aria-label="Ask" disabled={busy}>
            <Icon name="i-spark" /> Ask
          </button>
        </form>

        <div className="ops__range" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? "on" : undefined}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <section className="kpis" aria-label="Key indicators">
        {kpis.map((k) => (
          <article key={k.key} className="kpi">
            <div className="kpi__head">
              <span className="kpi__ic" style={{ ["--ic-tint" as string]: k.tint, ["--ic-tone" as string]: k.tone }}>
                <Icon name={k.icon} />
              </span>
              <span className="kpi__label">{k.label}</span>
            </div>
            <div className="kpi__val">
              {k.key === "revenue" ? <small>SZL</small> : null}
              {k.value}
              {k.unit ? <small>{k.unit}</small> : null}
            </div>
            <div className="kpi__meta">
              {k.delta ? (
                <span className={`kpi__delta ${k.delta.dir}`}>
                  <Icon name={k.delta.dir === "down" ? "i-trend-down" : "i-trend"} />
                  {k.delta.text}
                </span>
              ) : null}
              <span>{k.meta}</span>
            </div>
          </article>
        ))}
      </section>

      <div className="row r-3-2">
        <section className="panel" aria-labelledby="pqTitle">
          <div className="panel__h">
            <div>
              <h3 id="pqTitle">Needs your attention</h3>
              <p>Items assigned to you or your team that require a decision</p>
            </div>
            <div className="r">
              <Link
                to="/approvals"
                style={{
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "var(--navy)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                View all <Icon name="i-cright" />
              </Link>
            </div>
          </div>
          <div className="pq">
            {priority.length === 0 ? (
              <div className="pq__item sev-navy" style={{ cursor: "default" }}>
                <span className="pq__ic" style={{ ["--ic-tint" as string]: "#ECEEFC", ["--ic-tone" as string]: "#313391" }}>
                  <Icon name="i-check-c" />
                </span>
                <div className="pq__body">
                  <div className="pq__title">Inbox clear</div>
                  <div className="pq__meta">
                    <span className="tag">No pending approvals, overdue audits, or unread TBT alerts</span>
                  </div>
                </div>
              </div>
            ) : (
              priority.map((item) => (
                <div
                  key={item.id}
                  className={`pq__item sev-${item.sev}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(item);
                    }
                  }}
                >
                  <span
                    className="pq__ic"
                    style={{ ["--ic-tint" as string]: item.tint, ["--ic-tone" as string]: item.tone }}
                  >
                    <Icon name={item.icon} />
                  </span>
                  <div className="pq__body">
                    <div className="pq__title">
                      {item.ref ? <span className="ref">{item.ref}</span> : null}
                      {item.title}
                    </div>
                    <div className="pq__meta">
                      {item.meta.map((m) => (
                        <span key={m} className="tag">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pq__act">
                    <span className={`sla ${item.sla.kind}`}>
                      <span className="d" />
                      {item.sla.label}
                    </span>
                    <button
                      type="button"
                      className={`pq__btn ${item.action.variant}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openItem(item);
                      }}
                    >
                      <Icon name={item.action.icon} /> {item.action.label}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="panel" aria-labelledby="sysTitle">
            <div className="panel__h">
              <div>
                <h3 id="sysTitle">System status</h3>
                <p>Live Core health probe</p>
              </div>
            </div>
            <div className="status" style={{ padding: "8px 20px 4px" }}>
              {systemStatus.map((s) => (
                <div key={s.label} className="status__row">
                  <span className={`status__dot ${s.state}`} />
                  <span className="status__lbl">{s.label}</span>
                  <span className="status__val">{s.value}</span>
                </div>
              ))}
            </div>
            <div className="status__foot">
              <Icon name="i-clock" />
              {systemFoot}
            </div>
          </section>

          <section className="panel" aria-labelledby="actTitle">
            <div className="panel__h">
              <div>
                <h3 id="actTitle">Recent activity</h3>
                <p>Across your team in the last 24 hours</p>
              </div>
            </div>
            <ul className="feed">
              {feed.length === 0 ? (
                <li>
                  <span className="feed__d" style={{ background: "var(--muted-2)" }} />
                  <div className="feed__body">
                    <b>No recent feed items</b>
                    <span>Activity will appear as records move through modules.</span>
                  </div>
                </li>
              ) : (
                feed.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <span className="feed__d" style={{ background: feedDot(item.severity) }} />
                    <div className="feed__body">
                      <b>{item.title}</b>
                      {item.body ? <span>{item.body}</span> : null}
                      <time>{relativeClock(item.created_at)}</time>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>

      <div className="row r-3-2">
        <section className="panel" aria-labelledby="revTitle">
          <div className="panel__h">
            <div>
              <h3 id="revTitle">Revenue vs budget</h3>
              <p>Monthly, SZL thousands · {range}</p>
            </div>
            <div className="r">
              <div className="chart-legend">
                <span>
                  <i style={{ background: "var(--navy)" }} />
                  Actual
                </span>
                <span>
                  <i style={{ background: "#D3DDE9" }} />
                  Budget
                </span>
              </div>
            </div>
          </div>
          <div className="panel__body">
            <div className="chart">
              {hasChart ? (
                <Bar
                  data={{
                    labels: chartMonths!.labels,
                    datasets: [
                      {
                        label: "Budget",
                        data: chartMonths!.budget_thousands,
                        backgroundColor: "#D3DDE9",
                        borderRadius: 3,
                        barPercentage: 0.7,
                        categoryPercentage: 0.7,
                      },
                      {
                        label: "Actual",
                        data: chartMonths!.actual_thousands,
                        backgroundColor: "#313391",
                        borderRadius: 3,
                        barPercentage: 0.7,
                        categoryPercentage: 0.7,
                      },
                    ],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false } },
                      y: {
                        grid: { color: "#EFF3F8" },
                        ticks: { callback: (v) => String(v) },
                      },
                    },
                  }}
                />
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  Revenue series appears when Core returns finance KPIs.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="tlTitle">
          <div className="panel__h">
            <div>
              <h3 id="tlTitle">Annual plan KPIs</h3>
              <p>Traffic light vs target</p>
            </div>
            <div className="r">
              <Link
                to="/finance"
                style={{
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "var(--navy)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Finance <Icon name="i-cright" />
              </Link>
            </div>
          </div>
          <div className="panel__body">
            <div className="tl">
              {planRows.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                  No annual-plan targets from Finance yet.
                </p>
              ) : (
                planRows.map((row) => {
                const color = planColor(row.status);
                return (
                  <div key={row.key} className="tl__row">
                    <div className="tl__top">
                      <span className="lbl">
                        {row.label}
                        <small>Target {row.target}</small>
                      </span>
                      <span className="v">
                        {row.actual} <span className="s" style={{ background: color }} />
                      </span>
                    </div>
                    <div className="tl__bar">
                      <div
                        className="tl__fill"
                        style={{ width: planWidth(row.status), background: color }}
                      />
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="sec-head">
        <div>
          <h2>Modules</h2>
          <p>Everything the Authority runs, one click away</p>
        </div>
        <div className="r">
          <Link to="/reports">
            Open reports <Icon name="i-cright" />
          </Link>
        </div>
      </div>

      <section className="mods" aria-label="Portal modules">
        {MODULE_TILES.map((m) => {
          const to = pathForRouteId(m.id) ?? "/";
          const badge =
            m.id === "approvals" && pendingCount
              ? String(pendingCount)
              : m.id === "tbt" && tbt?.new_count
                ? String(tbt.new_count)
                : m.badge;
          const alert = m.id === "approvals" && pendingCount > 0;
          return (
            <Link key={m.id} to={to} className="mod">
              <span className="mod__ic">
                <Icon name={m.icon} />
              </span>
              <div className="mod__body">
                <b>{m.title}</b>
                <span>{m.foot}</span>
              </div>
              {badge ? (
                <span className={`mod__badge${alert ? " alert" : ""}`}>{badge}</span>
              ) : null}
            </Link>
          );
        })}
      </section>

      <RecordDrawer
        open={Boolean(selected)}
        onClose={closeDrawer}
        reference={selected?.ref || selected?.name}
        title={selected?.title ?? ""}
        subtitle={
          selected ? (
            <>
              <span className={`sla ${selected.sla.kind}`}>
                <span className="d" />
                {selected.sla.label}
              </span>
              <span className="tag">{selected.kind.replace(/_/g, " ")}</span>
            </>
          ) : null
        }
        sections={drawerSections}
        actions={drawerActions}
      />

      <Toast message={toast} />
    </div>
  );
}
