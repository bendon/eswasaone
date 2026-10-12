/**
 * Key-account plan (04 P3) and the health sparkline / churn chip for Client 360.
 */
import { useEffect, useState } from "react";
import { Select } from "@eswasaone/shared-ui";
import { getAccountPlan, saveAccountPlan, SERVICE_LABEL, fmtE, fmtWhen, type AccountPlan, type ChurnRisk, type Client, type CrmActor, type ServiceLine } from "@eswasaone/shared-ui/crm";

export function Sparkline({ points, width = 120, height = 30 }: { points: { at: string; score: number }[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const xs = (i: number) => (i / (points.length - 1)) * (width - 4) + 2;
  const ys = (v: number) => height - 2 - (v / 100) * (height - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.score).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const falling = last.score < points[0].score;
  return (
    <svg width={width} height={height} role="img" aria-label={`Health ${points.map((p) => p.score).join(", ")}`} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={falling ? "var(--red)" : "var(--green)"} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={xs(points.length - 1)} cy={ys(last.score)} r={3} fill={falling ? "var(--red)" : "var(--green)"} />
    </svg>
  );
}

export function ChurnChip({ risk }: { risk: ChurnRisk }) {
  const tone = risk.level === "high" ? "red" : risk.level === "medium" ? "amber" : "green";
  return (
    <span className={`crm-pill crm-pill--${tone}`} title={risk.reasons.join("\n") || "No churn signals"}>
      Churn risk: {risk.level}
    </span>
  );
}

const uid = () => Math.random().toString(36).slice(2, 8);
const SERVICES = Object.keys(SERVICE_LABEL) as ServiceLine[];

export function AccountPlanTab({ client, actor, onSaved }: { client: Client; actor: CrmActor; onSaved: (msg: string) => void }) {
  const year = new Date().getFullYear();
  const [plan, setPlan] = useState<Omit<AccountPlan, "updated_at" | "updated_by"> & Partial<Pick<AccountPlan, "updated_at" | "updated_by">>>({ client_id: client.id, year, objectives: [], stakeholders: [], services: [] });
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getAccountPlan(client.id, year).then((p) => {
      if (p) setPlan(p);
      else
        setPlan({
          client_id: client.id,
          year,
          objectives: [{ id: uid(), text: "", status: "open" }],
          stakeholders: client.contacts.filter((c) => c.active !== false).slice(0, 3).map((c) => ({ contact_id: c.id, influence: c.primary ? "decision" : "user" })),
          services: [],
        });
      setLoaded(true);
    });
  }, [client.id, client.contacts, year]);

  if (!loaded) return <p className="crm-muted">Loading…</p>;
  const total = plan.services.filter((s) => s.status !== "lost").reduce((n, s) => n + s.value, 0);
  const won = plan.services.filter((s) => s.status === "won").reduce((n, s) => n + s.value, 0);

  const save = async () => {
    setErr(null);
    try {
      const { updated_at: _a, updated_by: _b, ...rest } = plan;
      const saved = await saveAccountPlan({ ...rest, objectives: rest.objectives.filter((o) => o.text.trim()) }, actor);
      setPlan(saved);
      onSaved("Account plan saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="crm-stack">
      {client.tier !== "key" ? <p className="crm-small">Account plans are for key accounts. This client is tier “{client.tier}” — you can still plan, but it won't show on the key-account review.</p> : null}
      {err ? <p className="eo-error">{err}</p> : null}
      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Objectives {year}</h3>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setPlan({ ...plan, objectives: [...plan.objectives, { id: uid(), text: "", status: "open" }] })}>
            Add objective
          </button>
        </div>
        {plan.objectives.map((o, i) => (
          <div key={o.id} className="crm-row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
            <input className="crm-input" style={{ flex: 1 }} aria-label={`Objective ${i + 1}`} placeholder="e.g. Move both plants to ISO 22000 before export season" value={o.text} onChange={(e) => setPlan({ ...plan, objectives: plan.objectives.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
            <Select aria-label="Status" value={o.status} onChange={(val) => setPlan({ ...plan, objectives: plan.objectives.map((x) => (x.id === o.id ? { ...x, status: val as typeof o.status } : x)) })} block>
              <option value="open">Open</option>
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="done">Done</option>
            </Select>
            <button type="button" className="crm-link" onClick={() => setPlan({ ...plan, objectives: plan.objectives.filter((x) => x.id !== o.id) })}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Stakeholders</h3>
        </div>
        {!client.contacts.length ? <p className="crm-muted">Add contacts first.</p> : null}
        {client.contacts.filter((c) => c.active !== false).map((c) => {
          const s = plan.stakeholders.find((x) => x.contact_id === c.id);
          return (
            <div key={c.id} className="crm-row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
              <label className="crm-check" style={{ flex: 1 }}>
                <input type="checkbox" checked={Boolean(s)} onChange={(e) => setPlan({ ...plan, stakeholders: e.target.checked ? [...plan.stakeholders, { contact_id: c.id, influence: "user" }] : plan.stakeholders.filter((x) => x.contact_id !== c.id) })} /> <b>{c.name}</b> <span className="crm-small">{c.role}</span>
              </label>
              {s ? (
                <>
                  <Select aria-label={`Influence of ${c.name}`} value={s.influence} onChange={(val) => setPlan({ ...plan, stakeholders: plan.stakeholders.map((x) => (x.contact_id === c.id ? { ...x, influence: val as typeof s.influence } : x)) })} block>
                    <option value="decision">Decision-maker</option>
                    <option value="influencer">Influencer</option>
                    <option value="user">User</option>
                  </Select>
                  <input className="crm-input" aria-label={`Note on ${c.name}`} placeholder="Note" value={s.note ?? ""} onChange={(e) => setPlan({ ...plan, stakeholders: plan.stakeholders.map((x) => (x.contact_id === c.id ? { ...x, note: e.target.value } : x)) })} />
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="crm-card">
        <div className="crm-card__h">
          <h3>Service plan</h3>
          <span className="crm-small">
            Planned {fmtE(total)} · won {fmtE(won)}
          </span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setPlan({ ...plan, services: [...plan.services, { id: uid(), service: "certification", quarter: 1, value: 0, status: "planned" }] })}>
            Add service
          </button>
        </div>
        {!plan.services.length ? <p className="crm-muted">No services planned yet.</p> : null}
        {plan.services.map((sv) => {
          const set = (patch: Partial<typeof sv>) => setPlan({ ...plan, services: plan.services.map((x) => (x.id === sv.id ? { ...x, ...patch } : x)) });
          return (
            <div key={sv.id} className="crm-row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
              <Select aria-label="Service" value={sv.service} onChange={(val) => set({ service: val as ServiceLine })} block>
                {SERVICES.map((k) => (
                  <option key={k} value={k}>
                    {SERVICE_LABEL[k]}
                  </option>
                ))}
              </Select>
              <Select aria-label="Quarter" value={String(sv.quarter)} onChange={(val) => set({ quarter: Number(val) as 1 | 2 | 3 | 4 })} block>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </Select>
              <input className="crm-input" type="number" min={0} aria-label="Value (E)" style={{ width: 120 }} value={sv.value} onChange={(e) => set({ value: Math.max(0, Number(e.target.value) || 0) })} />
              <Select aria-label="Status" value={sv.status} onChange={(val) => set({ status: val as typeof sv.status })} block>
                <option value="planned">Planned</option>
                <option value="quoted">Quoted</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </Select>
              <input className="crm-input" style={{ flex: 1 }} aria-label="Note" placeholder="Note" value={sv.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
              <button type="button" className="crm-link" onClick={() => setPlan({ ...plan, services: plan.services.filter((x) => x.id !== sv.id) })}>
                Remove
              </button>
            </div>
          );
        })}
      </div>

      <div className="crm-row">
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()}>
          Save account plan
        </button>
        {plan.updated_at ? (
          <span className="crm-small">
            Last saved {fmtWhen(plan.updated_at)} by {plan.updated_by}
          </span>
        ) : null}
      </div>
    </div>
  );
}
