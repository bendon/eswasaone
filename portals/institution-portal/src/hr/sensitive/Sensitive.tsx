import { useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { RequireStaff } from "../../components/RequireStaff";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { HrAccessLog, HrSensitive } from "../../api/types";
import { Banner, Crumbs, fmtDay, NextStep } from "../../me/parts";

/**
 * Sensitive data (journey J12; brief §11). Personal details (level 1: HR User and HR Manager) and pay and bank
 * details (level 2: HR Manager only) stay hidden until you give a reason. Every view is recorded against your
 * name before anything is shown, and the person can see who looked.
 */

const LEVELS = [
  { level: 1 as const, title: "Personal", detail: "Date of birth, contacts, addresses, emergency contact, passport" },
  { level: 2 as const, title: "Pay and bank", detail: "Cost to company, salary mode, bank and account. HR Managers only." },
];

function when(iso?: string | null): string {
  if (!iso) return "—";
  return `${fmtDay(iso, true)}${iso.length > 10 ? `, ${iso.slice(11, 16)}` : ""}`;
}

/** "Show details": choose the level, say why, then see the fields. */
export function SensitivePanel({ employee, onViewed }: { employee: string; onViewed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<HrSensitive | null>(null);

  async function show() {
    setBusy(true);
    setErr(null);
    try {
      const out = await apiFetch<HrSensitive>(`/hr/employees/${encodeURIComponent(employee)}/sensitive`, {
        method: "POST",
        body: JSON.stringify({ level, reason: reason.trim(), confirm: true }),
      });
      setShown(out);
      onViewed?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Not opened.");
    } finally {
      setBusy(false);
    }
  }

  function hide() {
    setShown(null);
    setReason("");
    setOpen(false);
  }

  if (shown) {
    return (
      <div className="hr-view" style={{ gap: 10 }}>
        <p className="hr-note" style={{ margin: 0 }}>
          {shown.level_label} details. This view is recorded against your name.
        </p>
        <dl className="hr-kv">
          {shown.fields.map((f) => (
            <div key={f.field}>
              <dt>{f.label}</dt>
              <dd>{f.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <div>
          <button type="button" className="btn ghost sm" onClick={hide}>
            Hide details
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="hr-lock">
        <span>Hidden. Opening these is recorded against your name.</span>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
          Show details
        </button>
      </div>
    );
  }

  const ready = reason.trim().length >= 10;
  return (
    <div className="hr-view" style={{ gap: 10 }}>
      <div className="hr-radios" role="radiogroup" aria-label="Which details">
        {LEVELS.map((l) => (
          <label className="hr-radio" key={l.level}>
            <input type="radio" name={`sensitive_level_${employee}`} checked={level === l.level} onChange={() => setLevel(l.level)} />
            <span>
              <b>{l.title}</b>
              <small>{l.detail}</small>
            </span>
          </label>
        ))}
      </div>
      <label className="hr-f">
        <span>Why do you need them?</span>
        <textarea className="hr-in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <small>Recorded with your name and the time. The person can see who looked.</small>
      </label>
      {err ? (
        <Banner kind="bad" title="Not opened">
          {err}
        </Banner>
      ) : null}
      <div className="hr-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="btn pri sm" disabled={!ready || busy} onClick={() => void show()}>
          {busy ? "Opening…" : "Show and record"}
        </button>
      </div>
    </div>
  );
}

function LogTable({ items }: { items: HrAccessLog["items"] }) {
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>What</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{when(r.viewed_on)}</td>
              <td>{r.viewer_name ?? r.viewer ?? "—"}</td>
              <td>{r.level ?? "—"}</td>
              <td>{r.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Access log on a person's record. HR Users can't see it; the API refuses and this says so. */
export function AccessLogSection({ employee, refreshKey }: { employee: string; refreshKey?: number }) {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrAccessLog>(`/hr/employees/${encodeURIComponent(employee)}/access-log`, {
    enabled: Boolean(user),
    refreshKey: `${sessionKey}:${refreshKey ?? 0}`,
  });
  return (
    <section className="hr-sec" aria-label="Access log">
      <h3 className="hr-sub">Access log</h3>
      {res.error ? (
        <p className="hr-note">{res.error}</p>
      ) : res.data ? (
        res.data.items.length ? (
          <LogTable items={res.data.items} />
        ) : (
          <p className="hr-note">No one has opened this person's personal or pay details.</p>
        )
      ) : (
        <p className="hr-note">Loading…</p>
      )}
    </section>
  );
}

/** My HR — who has looked at my record. */
export function MyAccessLog() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrAccessLog>("/hr/me/access-log", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["My HR", "/me"], ["Who looked at my record"]]} />
            <div className="hr-head">
              <div>
                <h2>Who looked at my record</h2>
                <p>Your personal and pay details are hidden from HR until someone gives a reason. Each time, it's recorded here.</p>
              </div>
            </div>
            {d.items.length ? <LogTable items={d.items} /> : <EmptyState title="No one has opened your personal or pay details" />}
            <NextStep title="Something here you don't recognise?" body="Raise it in confidence; it goes to an HR Manager you choose." to="/me/concern" label="Raise a concern" />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
