import { useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import type { HrAppraisal, HrPerfStep } from "../../api/types";
import { Banner, StatusPill } from "../../me/parts";
import { useHrSettings } from "../useHrSettings";

/** Shared appraisal parts for H8b (HR, read-only), E7 (self-assessment) and T5 (manager review). */

export const STEP_LABEL: Record<HrPerfStep, string> = {
  self: "Self-assessment open",
  manager: "With the line manager",
  done: "Complete",
};

export function StepPill({ step }: { step: HrPerfStep }) {
  return <StatusPill cls={step === "done" ? "ok" : step === "manager" ? "info" : "leave"} label={STEP_LABEL[step]} />;
}

export function Done({ done }: { done: boolean }) {
  return <StatusPill cls={done ? "ok" : "leave"} label={done ? "Done" : "Open"} />;
}

/** 1 to HR Settings' rating_max stars. Read-only when no onChange is given. */
export function Stars({ label, value, onChange }: { label: string; value?: number | null; onChange?: (n: number) => void }) {
  const top = useHrSettings()?.rating_max ?? 0;
  if (!onChange) {
    const full = value ? Math.round(value) : 0;
    return (
      <span className="hr-stars ro" aria-label={value ? `${label}: ${value}${top ? ` of ${top}` : ""}` : `${label}: not rated`}>
        {value ? `${"★".repeat(full)}${"☆".repeat(Math.max(0, top - full))}` : "–"}
      </span>
    );
  }
  return (
    <span className="hr-stars" role="radiogroup" aria-label={label}>
      {Array.from({ length: top }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label}: ${n} of ${top}`} className={value && n <= value ? "on" : ""} onClick={() => onChange(n)}>
          ★
        </button>
      ))}
    </span>
  );
}

export function Goals({ a }: { a: HrAppraisal }) {
  return (
    <div className="hr-box hr-scroll">
      <div className="hr-box__h">
        <div>
          <h3>Objectives</h3>
          <p>Each linked to a strategic plan goal</p>
        </div>
      </div>
      {a.goals.length ? (
        <table className="hr-table">
          <thead>
            <tr>
              <th>Objective</th>
              <th>Supports</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {a.goals.map((g) => (
              <tr key={g.id}>
                <td>
                  <b>{g.goal_name}</b>
                  {g.kra ? <div className="sub">{g.kra}</div> : null}
                </td>
                <td>{g.strategic_goal ?? <span className="sub">Not linked</span>}</td>
                <td>{Math.round(g.progress)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="hr-box__b">
          <p className="hr-note">No objectives set yet. The line manager sets them.</p>
        </div>
      )}
    </div>
  );
}

/** Criteria with self and manager stars. ``rate`` makes one column editable. */
export function Criteria({ a, rate, value, onRate }: { a: HrAppraisal; rate?: "self" | "manager"; value?: Record<string, number>; onRate?: (criteria: string, n: number) => void }) {
  return (
    <div className="hr-box hr-scroll">
      <div className="hr-box__h">
        <div>
          <h3>Ratings</h3>
          <p>1 to 5 stars on each item in the template</p>
        </div>
      </div>
      {a.criteria.length ? (
        <table className="hr-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Weight</th>
              <th>Self</th>
              <th>Manager</th>
            </tr>
          </thead>
          <tbody>
            {a.criteria.map((c) => (
              <tr key={c.criteria}>
                <td>
                  <b>{c.criteria}</b>
                </td>
                <td>{c.weight ? `${c.weight}%` : "–"}</td>
                <td>{rate === "self" ? <Stars label={c.criteria} value={value?.[c.criteria]} onChange={(n) => onRate?.(c.criteria, n)} /> : <Stars label={`Self, ${c.criteria}`} value={c.self} />}</td>
                <td>{rate === "manager" ? <Stars label={c.criteria} value={value?.[c.criteria]} onChange={(n) => onRate?.(c.criteria, n)} /> : <Stars label={`Manager, ${c.criteria}`} value={c.manager} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="hr-box__b">
          <p className="hr-note">The template has no rating items. HR sets them up in the appraisal template.</p>
        </div>
      )}
    </div>
  );
}

/** Line manager or HR adds an objective while the review is open. */
export function AddGoal({ a, onAdded }: { a: HrAppraisal; onAdded: (next: HrAppraisal) => void }) {
  const [name, setName] = useState("");
  const [kra, setKra] = useState("");
  const [strategic, setStrategic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = name.trim() && (!a.kras.length || kra);
  async function add() {
    setBusy(true);
    setErr(null);
    try {
      const next = await apiFetch<HrAppraisal>(`/hr/team/${encodeURIComponent(a.employee)}/goals`, {
        method: "POST",
        body: JSON.stringify({ goal_name: name.trim(), kra: kra || null, strategic_goal: strategic.trim() || null, confirm: true }),
      });
      onAdded(next);
      setName("");
      setKra("");
      setStrategic("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not added.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hr-box">
      <div className="hr-box__h">
        <div>
          <h3>Add an objective</h3>
        </div>
      </div>
      <div className="hr-box__b hr-form">
        <label className="hr-f wide">
          <span>Objective</span>
          <input className="hr-in" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {a.kras.length ? (
          <label className="hr-f">
            <span>Result area</span>
            <select className="hr-in" value={kra} onChange={(e) => setKra(e.target.value)}>
              <option value="">Choose…</option>
              {a.kras.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="hr-f">
          <span>Strategic plan goal it supports</span>
          <input className="hr-in" value={strategic} onChange={(e) => setStrategic(e.target.value)} />
          <small>As written in the strategic plan</small>
        </label>
        {err ? (
          <div className="wide">
            <Banner kind="bad" title="Not added">
              {err}
            </Banner>
          </div>
        ) : null}
        <div className="wide">
          <button type="button" className="btn ghost" disabled={!ready || busy} onClick={() => void add()}>
            {busy ? "Adding…" : "Add objective"}
          </button>
        </div>
      </div>
    </div>
  );
}
