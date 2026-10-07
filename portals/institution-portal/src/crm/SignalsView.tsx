import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, ModuleHeader } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  CrmEmpty,
  SERVICE_LABEL,
  convertSignal,
  fmtE,
  fmtWhen,
  listClients,
  listSignals,
  setSignalStatus,
  useCrm,
  useCrmToast,
  type Signal,
  type SignalKind,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, SIGNAL_META, SignalIcon, useActor } from "./shared";

type View = "new" | "snoozed" | "converted" | "dismissed";

/**
 * Signals — leads raised automatically from events across the platform:
 * expiring certificates, due surveillance and calibration, new compulsory standards, TBT notifications,
 * abandoned applicability checks, standards bought without certification, NCs that suggest training,
 * inbound quote requests, and compliance signals (repeat complaints) that route to Certification instead.
 */
export function CrmSignalsView() {
  const actor = useActor();
  const navigate = useNavigate();
  const [toast, showToast] = useCrmToast();
  const [view, setView] = useState<View>("new");
  const [kind, setKind] = useState<SignalKind | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const res = useCrm(async () => {
    const [signals, clients] = await Promise.all([listSignals(), listClients()]);
    return { signals, clients };
  });

  async function convert(s: Signal) {
    setErr(null);
    try {
      const o = await convertSignal(s.id, actor);
      showToast(`Opportunity ${o.id} created`);
      navigate(`/crm/pipeline?open=${o.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function bulk(status: Signal["status"]) {
    for (const id of selected) await setSignalStatus(id, status);
    showToast(`${selected.size} signal(s) ${status}`);
    setSelected(new Set());
  }

  return (
    <CrmGate res={res} what="Signals">
      {({ signals, clients }) => {
        const nameOf = (s: Signal) => clients.find((c) => c.id === s.client_id)?.name ?? s.prospect?.name ?? (s.sector ? `${s.sector} sector` : "Market-wide");
        const rows = signals.filter((s) => s.status === view).filter((s) => kind === "all" || s.kind === kind);
        const fresh = signals.filter((s) => s.status === "new");
        const kinds = [...new Set(signals.map((s) => s.kind))];
        const value = fresh.filter((s) => !s.compliance).reduce((sum, s) => sum + s.value_estimate, 0);
        return (
          <>
            <ModuleHeader
              title="Signals"
              subtitle="Leads raised automatically from what's happening across EswasaOne — no one has to type them in"
              summary={[
                { label: "New", value: fresh.length },
                { label: "Est. value", value: fmtE(value) },
                { label: "Compliance", value: fresh.filter((s) => s.compliance).length, variant: fresh.some((s) => s.compliance) ? "breach" : undefined },
              ]}
            />
            {err ? <CrmBanner tone="err">{err}</CrmBanner> : null}
            <div className="crm-toolbar">
              <div className="crm-seg">
                {(["new", "snoozed", "converted", "dismissed"] as View[]).map((v) => (
                  <button key={v} type="button" className={view === v ? "on" : ""} onClick={() => setView(v)}>
                    {v[0].toUpperCase() + v.slice(1)}
                    <span className="n">{signals.filter((s) => s.status === v).length}</span>
                  </button>
                ))}
              </div>
              <select className="crm-select" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as SignalKind | "all")} aria-label="Signal type">
                <option value="all">All signal types</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {SIGNAL_META[k].label}
                  </option>
                ))}
              </select>
              {selected.size ? (
                <div className="crm-row" style={{ marginLeft: "auto" }}>
                  <span className="crm-small">{selected.size} selected</span>
                  <Link
                    className="crm-btn crm-btn--sm"
                    to="/marketing"
                    title="Hands the selected clients to Marketing as a campaign segment"
                  >
                    <Icon name="i-mega" /> Outreach campaign
                  </Link>
                  <button type="button" className="crm-btn crm-btn--sm" onClick={() => void bulk("snoozed")}>
                    Snooze
                  </button>
                  <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void bulk("dismissed")}>
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <CrmEmpty icon="i-spark" title={view === "new" ? "No new signals" : `No ${view} signals`} detail="Signals appear as certificates near expiry, standards are gazetted, customers abandon journeys and more." />
            ) : (
              <div className="crm-stack" style={{ gap: 10 }}>
                {rows.map((s) => (
                  <div key={s.id} className="crm-signal">
                    {view === "new" || view === "snoozed" ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.title}`}
                        checked={selected.has(s.id)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          if (e.target.checked) n.add(s.id);
                          else n.delete(s.id);
                          setSelected(n);
                        }}
                        style={{ marginTop: 12, accentColor: "var(--navy)" }}
                      />
                    ) : null}
                    <SignalIcon kind={s.kind} />
                    <div className="crm-signal__b">
                      <b>{s.title}</b>
                      <p>{s.detail}</p>
                      <div className="crm-row">
                        <span className={`crm-pill ${s.compliance ? "crm-pill--red" : ""}`}>{SIGNAL_META[s.kind].label}</span>
                        {s.client_id ? (
                          <Link className="crm-link" to={`/crm/clients/${s.client_id}`}>
                            {nameOf(s)}
                          </Link>
                        ) : (
                          <span className="crm-small">{nameOf(s)}</span>
                        )}
                        {s.services.map((x) => (
                          <span key={x} className="crm-pill crm-pill--outline">
                            {SERVICE_LABEL[x]}
                          </span>
                        ))}
                        <span className="crm-small">{fmtWhen(s.created_at)}</span>
                        {s.due_at ? <span className="crm-small">· act by {new Date(s.due_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span> : null}
                      </div>
                    </div>
                    <div className="crm-signal__act">
                      {!s.compliance ? <span className="crm-signal__v">{fmtE(s.value_estimate)}</span> : null}
                      {s.status === "converted" && s.opportunity_id ? (
                        <Link className="crm-btn crm-btn--sm" to={`/crm/pipeline?open=${s.opportunity_id}`}>
                          Open {s.opportunity_id}
                        </Link>
                      ) : s.compliance ? (
                        <Link className="crm-btn crm-btn--sm crm-btn--danger" to="/certification" onClick={() => void setSignalStatus(s.id, "converted")}>
                          <Icon name="i-shield" /> Send to Certification
                        </Link>
                      ) : s.status !== "dismissed" ? (
                        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void convert(s)}>
                          <Icon name="i-trend" /> Create opportunity
                        </button>
                      ) : null}
                      {s.status === "new" ? (
                        <div className="crm-row" style={{ gap: 4 }}>
                          <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void setSignalStatus(s.id, "snoozed")}>
                            Snooze
                          </button>
                          <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void setSignalStatus(s.id, "dismissed")}>
                            Dismiss
                          </button>
                        </div>
                      ) : s.status === "snoozed" || s.status === "dismissed" ? (
                        <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => void setSignalStatus(s.id, "new")}>
                          Restore
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {toast}
          </>
        );
      }}
    </CrmGate>
  );
}
