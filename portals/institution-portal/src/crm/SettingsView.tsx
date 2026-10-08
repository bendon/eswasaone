import { SignalRulesCard } from "./CrmExtras";
import { useEffect, useState } from "react";
import { Icon, ModuleHeader, useDialogs } from "@eswasaone/shared-ui";
import {
  CrmBanner,
  SERVICE_LABEL,
  getCrmConfig,
  isCaseManager,
  resetCrmDemo,
  saveCrmConfig,
  useCrm,
  useCrmToast,
  type CaseType,
  type CasePriority,
  type CrmConfig,
  type ServiceLine,
} from "@eswasaone/shared-ui/crm";
import { CrmGate, useActor } from "./shared";

type Section = "sla" | "routing" | "templates" | "prices" | "tiers";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "sla", label: "Case types & SLAs" },
  { id: "routing", label: "Routing rules" },
  { id: "templates", label: "Reply templates" },
  { id: "prices", label: "Price list & approvals" },
  { id: "tiers", label: "Tiers & survey" },
];

/** CRM settings — SLAs, routing, templates, price list, tiers, survey. Managers edit; others read. */
export function CrmSettingsView() {
  const actor = useActor();
  const res = useCrm(() => getCrmConfig());
  return (
    <CrmGate res={res} what="CRM settings">
      {(cfg) => (
        <>
          <SettingsForm initial={cfg} canEdit={isCaseManager(actor)} />
          <div style={{ marginTop: 16 }}>
            <SignalRulesCard />
          </div>
        </>
      )}
    </CrmGate>
  );
}

function SettingsForm({ initial, canEdit }: { initial: CrmConfig; canEdit: boolean }) {
  const dialogs = useDialogs();
  const [cfg, setCfg] = useState<CrmConfig>(initial);
  const [section, setSection] = useState<Section>("sla");
  const [dirty, setDirty] = useState(false);
  const [toast, showToast] = useCrmToast();

  useEffect(() => {
    if (!dirty) setCfg(initial);
  }, [initial, dirty]);

  const edit = (fn: (c: CrmConfig) => void) => {
    setCfg((c) => {
      const n = structuredClone(c);
      fn(n);
      return n;
    });
    setDirty(true);
  };

  async function save() {
    await saveCrmConfig(cfg);
    setDirty(false);
    showToast("Settings saved");
  }

  async function reset() {
    const ok = await dialogs.confirm({
      title: "Reset demo data",
      message: "Replace every case, client, signal, opportunity, quote and setting with the original sample data?",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    await resetCrmDemo();
    setDirty(false);
    showToast("Demo data reset");
  }

  const types = Object.keys(cfg.case_types) as CaseType[];
  const dis = !canEdit;

  return (
    <>
      <ModuleHeader
        title="CRM settings"
        subtitle="Service levels, routing, templates and pricing used across cases, quotes and the public complaints pages"
        extra={
          <>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={() => void reset()}>
              <Icon name="i-refresh" /> Reset demo data
            </button>
            <button type="button" className="crm-btn crm-btn--pri" disabled={!dirty || dis} onClick={() => void save()}>
              Save changes
            </button>
          </>
        }
      />
      {!canEdit ? <CrmBanner tone="lock">Read-only. A Quality, Sales or Customer Service manager can change these.</CrmBanner> : null}
      <div className="crm-tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} className={section === s.id ? "on" : ""} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "sla" ? (
        <>
          <CrmBanner>
            Targets are <b>provisional</b> (confirmation pack F8–F11: enquiry 5 days, complaint 20 days, reopen within 14 days). The public page cites
            CER_PR_006 (acknowledge in 3, resolve in 30). Mark a row confirmed once ESWASA signs off. Working days exclude weekends and public holidays, and
            the clock pauses while waiting on the customer.
          </CrmBanner>
          <div className="crm-card crm-card--flush">
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Case type</th>
                    <th>Acknowledge (days)</th>
                    <th>Resolve (days)</th>
                    <th>Owning team</th>
                    <th>Hidden from sales</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => {
                    const c = cfg.case_types[t];
                    return (
                      <tr key={t}>
                        <td>
                          <b>{c.label}</b>
                          <span className="crm-small">{c.description}</span>
                        </td>
                        <td style={{ width: 120 }}>
                          <input className="crm-input" type="number" min={0} disabled={dis} value={c.ack_days} onChange={(e) => edit((n) => void (n.case_types[t].ack_days = Number(e.target.value)))} aria-label={`${c.short} acknowledge days`} />
                        </td>
                        <td style={{ width: 120 }}>
                          <input className="crm-input" type="number" min={1} disabled={dis} value={c.resolve_days} onChange={(e) => edit((n) => void (n.case_types[t].resolve_days = Number(e.target.value)))} aria-label={`${c.short} resolve days`} />
                        </td>
                        <td>
                          <select className="crm-select" disabled={dis || t === "appeal"} value={c.team} onChange={(e) => edit((n) => void (n.case_types[t].team = e.target.value))} aria-label={`${c.short} team`}>
                            {cfg.teams.map((tm) => (
                              <option key={tm}>{tm}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" disabled={dis || t === "appeal"} checked={c.restricted} onChange={(e) => edit((n) => void (n.case_types[t].restricted = e.target.checked))} aria-label={`${c.short} restricted`} />
                        </td>
                        <td>
                          <button type="button" className={`crm-pill ${c.to_confirm ? "crm-pill--amber" : "crm-pill--green"}`} style={{ border: 0, cursor: dis ? "default" : "pointer" }} disabled={dis} onClick={() => edit((n) => void (n.case_types[t].to_confirm = !n.case_types[t].to_confirm))}>
                            {c.to_confirm ? "To confirm" : "Confirmed"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="crm-card" style={{ marginTop: 14, maxWidth: 420 }}>
            <label className="crm-field">
              Customer can reopen a resolved case within (days)
              <input className="crm-input" type="number" min={0} disabled={dis} value={cfg.reopen_days} onChange={(e) => edit((n) => void (n.reopen_days = Number(e.target.value)))} />
              <span className="hint">After this the case closes automatically.</span>
            </label>
          </div>
        </>
      ) : null}

      {section === "routing" ? (
        <div className="crm-stack">
          <span className="crm-small">Rules run top to bottom when a case arrives. The first match sets the team and, optionally, the priority. Keywords are regular expressions, case-insensitive.</span>
          {cfg.routing.map((r, i) => (
            <div key={r.id} className="crm-card">
              <div className="crm-form crm-form--2">
                <label className="crm-field" style={{ gridColumn: "1 / -1" }}>
                  Rule
                  <input className="crm-input" disabled={dis} value={r.label} onChange={(e) => edit((n) => void (n.routing[i].label = e.target.value))} />
                </label>
                <label className="crm-field">
                  When type is
                  <select className="crm-select" disabled={dis} value={r.when.type ?? ""} onChange={(e) => edit((n) => void (n.routing[i].when.type = (e.target.value || undefined) as CaseType | undefined))}>
                    <option value="">Any type</option>
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {cfg.case_types[t].short}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="crm-field">
                  and text matches
                  <input className="crm-input crm-mono" disabled={dis} value={r.when.keyword ?? ""} onChange={(e) => edit((n) => void (n.routing[i].when.keyword = e.target.value || undefined))} placeholder="e.g. calibrat|scale" />
                </label>
                <label className="crm-field">
                  Route to team
                  <select className="crm-select" disabled={dis} value={r.team} onChange={(e) => edit((n) => void (n.routing[i].team = e.target.value))}>
                    {cfg.teams.map((tm) => (
                      <option key={tm}>{tm}</option>
                    ))}
                  </select>
                </label>
                <label className="crm-field">
                  Set priority
                  <select className="crm-select" disabled={dis} value={r.priority ?? ""} onChange={(e) => edit((n) => void (n.routing[i].priority = (e.target.value || undefined) as CasePriority | undefined))}>
                    <option value="">Keep default</option>
                    {(["low", "normal", "high", "urgent"] as CasePriority[]).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="crm-row" style={{ marginTop: 10 }}>
                <label className="crm-check">
                  <input type="checkbox" disabled={dis} checked={r.enabled} onChange={(e) => edit((n) => void (n.routing[i].enabled = e.target.checked))} />
                  Enabled
                </label>
                <span className="crm-spacer" />
                <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={dis || i === 0} onClick={() => edit((n) => void n.routing.splice(i - 1, 0, ...n.routing.splice(i, 1)))}>
                  Move up
                </button>
                <button type="button" className="crm-btn crm-btn--sm crm-btn--danger" disabled={dis} onClick={() => edit((n) => void n.routing.splice(i, 1))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="crm-btn"
            disabled={dis}
            style={{ alignSelf: "flex-start" }}
            onClick={() => edit((n) => void n.routing.push({ id: `r${Date.now() % 100000}`, label: "New rule", when: {}, team: "Customer Service", enabled: false }))}
          >
            <Icon name="i-plus" /> Add rule
          </button>
        </div>
      ) : null}

      {section === "templates" ? (
        <div className="crm-stack">
          <span className="crm-small">
            Placeholders: <span className="crm-mono">{"{name} {ref} {type} {team} {due} {resolution} {reopen}"}</span>
          </span>
          {cfg.templates.map((t, i) => (
            <div key={t.id} className="crm-card">
              <div className="crm-form">
                <label className="crm-field">
                  Name
                  <input className="crm-input" disabled={dis} value={t.name} onChange={(e) => edit((n) => void (n.templates[i].name = e.target.value))} />
                </label>
                <div className="crm-row">
                  {types.map((ty) => (
                    <label key={ty} className="crm-check" style={{ fontSize: 12.5 }}>
                      <input
                        type="checkbox"
                        disabled={dis}
                        checked={t.types.includes(ty)}
                        onChange={(e) =>
                          edit((n) => {
                            n.templates[i].types = e.target.checked ? [...n.templates[i].types, ty] : n.templates[i].types.filter((x) => x !== ty);
                          })
                        }
                      />
                      {cfg.case_types[ty].short}
                    </label>
                  ))}
                </div>
                <textarea className="crm-textarea" style={{ minHeight: 140 }} disabled={dis} value={t.body} onChange={(e) => edit((n) => void (n.templates[i].body = e.target.value))} aria-label={`${t.name} body`} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="crm-btn"
            disabled={dis}
            style={{ alignSelf: "flex-start" }}
            onClick={() => edit((n) => void n.templates.push({ id: `t${Date.now() % 100000}`, name: "New template", types: ["enquiry"], body: "Dear {name},\n\n\n\nKind regards,\nESWASA" }))}
          >
            <Icon name="i-plus" /> Add template
          </button>
        </div>
      ) : null}

      {section === "prices" ? (
        <>
          <CrmBanner>ESWASA publishes no fee schedule. These amounts are placeholders until the ERPNext price list is connected.</CrmBanner>
          <div className="crm-card" style={{ maxWidth: 420, marginBottom: 14 }}>
            <label className="crm-field">
              Discounts above this % need Sales Manager approval
              <input className="crm-input" type="number" min={0} max={50} disabled={dis} value={cfg.discount_approval_pct} onChange={(e) => edit((n) => void (n.discount_approval_pct = Number(e.target.value)))} />
            </label>
          </div>
          <div className="crm-card crm-card--flush">
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Service</th>
                    <th>Item</th>
                    <th>Unit</th>
                    <th className="num">Price (E)</th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.price_list.map((p, i) => (
                    <tr key={p.code}>
                      <td className="crm-mono">{p.code}</td>
                      <td>
                        <select className="crm-select" disabled={dis} value={p.service} onChange={(e) => edit((n) => void (n.price_list[i].service = e.target.value as ServiceLine))} aria-label="Service">
                          {Object.keys(SERVICE_LABEL).map((s) => (
                            <option key={s} value={s}>
                              {SERVICE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="crm-input" disabled={dis} value={p.label} onChange={(e) => edit((n) => void (n.price_list[i].label = e.target.value))} aria-label="Item" />
                      </td>
                      <td>
                        <input className="crm-input" disabled={dis} value={p.unit} onChange={(e) => edit((n) => void (n.price_list[i].unit = e.target.value))} aria-label="Unit" />
                      </td>
                      <td style={{ width: 130 }}>
                        <input className="crm-input" type="number" min={0} disabled={dis} value={p.amount} onChange={(e) => edit((n) => void (n.price_list[i].amount = Number(e.target.value)))} aria-label="Price" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button
            type="button"
            className="crm-btn"
            disabled={dis}
            style={{ marginTop: 12 }}
            onClick={() => edit((n) => void n.price_list.push({ code: `NEW-${n.price_list.length + 1}`, service: "certification", label: "New item", unit: "each", amount: 0 }))}
          >
            <Icon name="i-plus" /> Add item
          </button>
        </>
      ) : null}

      {section === "tiers" ? (
        <div className="crm-grid crm-grid--2">
          <div className="crm-card">
            <div className="crm-card__h">
              <h3>Client tiers</h3>
            </div>
            <div className="crm-form">
              {cfg.tiers.map((t, i) => (
                <label key={t.id} className="crm-field">
                  {t.label}
                  <input className="crm-input" disabled={dis} value={t.rule} onChange={(e) => edit((n) => void (n.tiers[i].rule = e.target.value))} />
                </label>
              ))}
            </div>
          </div>
          <div className="crm-card">
            <div className="crm-card__h">
              <div>
                <h3>Satisfaction survey</h3>
                <p>Sent when a case closes. The first question is the 1–5 star rating.</p>
              </div>
            </div>
            <div className="crm-form">
              {cfg.survey.map((q, i) => (
                <div key={i} className="crm-row" style={{ flexWrap: "nowrap" }}>
                  <input className="crm-input" disabled={dis} value={q} onChange={(e) => edit((n) => void (n.survey[i] = e.target.value))} aria-label={`Question ${i + 1}`} />
                  <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" disabled={dis || i === 0} onClick={() => edit((n) => void n.survey.splice(i, 1))} aria-label="Remove question">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="crm-btn crm-btn--sm" disabled={dis} style={{ alignSelf: "flex-start" }} onClick={() => edit((n) => void n.survey.push("New question"))}>
                <Icon name="i-plus" /> Add question
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast}
    </>
  );
}
