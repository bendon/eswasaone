import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
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
import { type PriorityItem } from "../dashboard/fixtures";
import { buildLiveAttentionQueue } from "../dashboard/attention";
import { EsiFeed } from "../dashboard/EsiFeed";
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

/** Attention rows shown on the overview — the rest live behind "View all". */
const ATTENTION_PREVIEW = 4;

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
    year: "numeric",
  });
}

function formatOpsTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function firstName(full: string | undefined, fallback: string): string {
  const raw = (full || fallback || "").trim();
  return raw.split(/\s+/)[0] || "there";
}

export function InstitutionHomePage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const navigate = useNavigate();
  const [home, setHome] = useState<InstitutionHome | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [approvals, setApprovals] = useState<ApprovalsResponse | null>(null);
  const [tbt, setTbt] = useState<TbtNotificationsResponse | null>(null);
  const [overdueAudits, setOverdueAudits] = useState<AuditSummary[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Track last-visit timestamp for the "From Esi" subtitle.
  // Reads the previous value on mount, then immediately stores "now" for next visit.
  const [lastSeen] = useState<string | null>(() => {
    try {
      return localStorage.getItem("eswasaone.institution.lastSeen");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("eswasaone.institution.lastSeen", new Date().toISOString());
    } catch {
      /* storage unavailable — non-critical */
    }
  }, []);

  // Keep the greeting clock current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Attention queue detail drawer
  const [selected, setSelected] = useState<PriorityItem | null>(null);
  const [draftDue, setDraftDue] = useState("");
  const [chaseNote, setChaseNote] = useState("");
  const [acting, setActing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

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
      apiFetch<FinanceDashboard>("/finance/kpis", { quiet: true }),
      apiFetch<ApprovalsResponse>("/approvals?limit=5", { quiet: true }),
      apiFetch<TbtNotificationsResponse>("/tbt/alerts?limit=5", { quiet: true }),
      apiFetch<{ items?: AuditSummary[] }>("/certification/audits/overdue", {
        quiet: true,
      }),
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

  const name = firstName(user.full_name, user.username);

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
    ];
  }, [home, finance, approvals, overdueAudits]);

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
      if (selected.kind === "audit_reschedule" && selected.name) {
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

  const attentionPreview = priority.slice(0, ATTENTION_PREVIEW);
  const attentionMore = attentionN - attentionPreview.length;

  return (
    <div className="dash">
      <section className="hero2" aria-label="Overview">
        <div className="hero2__head">
          <div>
            <h2 className="hero2__greet">
              {greetingFor(now.getHours())}, {name}
            </h2>
            <p className="hero2__date">
              {formatOpsDate(now)} · <time>{formatOpsTime(now)}</time>
            </p>
          </div>
          <div className="hero2__meta">
            <span className={`hero2__attn${attentionN > 0 ? " is-alert" : ""}`}>
              <Icon name={attentionN > 0 ? "i-bell" : "i-check-c"} />
              {attentionN > 0
                ? `${attentionN} item${attentionN === 1 ? "" : "s"} need${attentionN === 1 ? "s" : ""} your attention`
                : "Nothing needs your attention"}
            </span>
          </div>
        </div>

        <div className="hero2__stats" aria-label="Key indicators">
          {kpis.map((k) => {
            const alert = k.key === "sla" && k.value !== "—" && Number(k.value) > 0;
            return (
              <div key={k.key} className={`hero2__stat${alert ? " is-alert" : ""}`}>
                <div className="hero2__stat-label">
                  <span
                    className="hero2__stat-ic"
                    style={{ ["--ic-tint" as string]: k.tint, ["--ic-tone" as string]: k.tone }}
                  >
                    <Icon name={k.icon} />
                  </span>
                  {k.label}
                </div>
                <div className="hero2__stat-val">
                  {k.key === "revenue" && k.value !== "—" ? <small>SZL</small> : null}
                  {k.value}
                  {k.unit ? <small>{k.unit}</small> : null}
                </div>
                <div className="hero2__stat-meta">
                  {k.delta ? (
                    <span className={`kpi__delta ${k.delta.dir}`}>
                      <Icon name={k.delta.dir === "down" ? "i-trend-down" : "i-trend"} />
                      {k.delta.text}
                    </span>
                  ) : null}
                  <span>{k.meta}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="row r-3">
        <section className="panel" aria-labelledby="pqTitle">
          <div className="panel__h">
            <div>
              <h3 id="pqTitle">Needs your attention</h3>
              <p>Decisions waiting on you or your team</p>
            </div>
            <div className="r">
              <Link to="/approvals">
                {attentionMore > 0 ? `+${attentionMore} more` : "View all"} <Icon name="i-cright" />
              </Link>
            </div>
          </div>
          <div className="pq pq--compact">
            {attentionPreview.length === 0 ? (
              <div className="dash-empty">
                <Icon name="i-check-c" />
                <b>Inbox clear</b>
                <span>No pending approvals, overdue audits or unread TBT alerts.</span>
              </div>
            ) : (
              attentionPreview.map((item) => (
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
                      <span className={`sla ${item.sla.kind}`}>
                        <span className="d" />
                        {item.sla.label}
                      </span>
                      {item.meta.slice(0, 1).map((m) => (
                        <span key={m} className="tag">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Icon name="i-cright" className="pq__go" />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="revTitle">
          <div className="panel__h">
            <div>
              <h3 id="revTitle">Revenue vs budget</h3>
              <p>Monthly, SZL thousands</p>
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
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.7,
                      },
                      {
                        label: "Actual",
                        data: chartMonths!.actual_thousands,
                        backgroundColor: "#313391",
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.7,
                      },
                    ],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, border: { display: false } },
                      y: {
                        grid: { color: "#EFF3F8" },
                        border: { display: false },
                        ticks: { callback: (v) => String(v) },
                      },
                    },
                  }}
                />
              ) : (
                <div className="dash-empty">
                  <Icon name="i-chart" />
                  <b>No revenue series yet</b>
                  <span>Appears when Core returns finance KPIs.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="tlTitle">
          <div className="panel__h">
            <div>
              <h3 id="tlTitle">Annual plan</h3>
              <p>Actual vs target</p>
            </div>
            <div className="r">
              <Link to="/finance">
                Finance <Icon name="i-cright" />
              </Link>
            </div>
          </div>
          <div className="panel__body">
            <div className="tl">
              {planRows.length === 0 ? (
                <div className="dash-empty">
                  <Icon name="i-gauge" />
                  <b>No targets yet</b>
                  <span>Annual-plan targets appear once Finance publishes them.</span>
                </div>
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

      <EsiFeed
        feed={feed}
        approvals={approvals?.items}
        lastSeen={lastSeen}
        onAsk={(q) => showToast(`Esi: "${q}" — routing to assistant…`)}
        onClaimAll={() => showToast("Claiming all unclaimed applications…")}
      />

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
