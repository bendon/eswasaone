import { useState } from "react";
import { useApiResource } from "../../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../../components/PageStates";
import { useInstitution } from "../../layout/InstitutionLayout";
import type { components } from "@contracts";
import { Banner, Crumbs, StatusPill } from "../../me/parts";
import { errorText, hrSend } from "../api";
import { useHrSettings } from "../useHrSettings";

type HrExternalPeople = components["schemas"]["HrExternalPeople"];

/**
 * H5d External personnel: contract auditors and experts, with the same competence and declaration checks as staff, no
 * payroll. HR Settings turns the register on or off; while it's off the screen says so and adds nothing.
 * Live GET/POST /hr/external-people.
 */
export function ExternalPeople() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrExternalPeople>("/hr/external-people", { enabled: Boolean(user), refreshKey: sessionKey });
  const ROLES = useHrSettings()?.lists.external_roles ?? [];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const d = res.data;

  async function add() {
    setErr(null);
    setOk(null);
    if (!name.trim()) return setErr("Give the person's full name.");
    if (!role) return setErr("Choose their role.");
    setBusy(true);
    try {
      await hrSend("/hr/external-people", { full_name: name.trim(), role, email: email.trim() || undefined, organisation: org.trim() || undefined, notes: notes.trim() || undefined });
      setOk(`${name.trim()} added. Record their authorisations and ask them to sign a declaration before assigning work.`);
      setName("");
      setEmail("");
      setOrg("");
      setNotes("");
      setOpen(false);
      res.reload();
    } catch (e) {
      setErr(errorText(e, "Not added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-view">
      <Crumbs items={[["Competence", "/hr/competence"], ["External personnel"]]} />
      <div className="hr-head">
        <div>
          <h2>External personnel</h2>
          <p>Contract auditors, technical experts and committee experts. Same competence and declaration checks as staff, no payroll.</p>
        </div>
        {d?.enabled && !open ? (
          <div className="hr-head__r">
            <button type="button" className="btn pri" onClick={() => (setOpen(true), setOk(null))}>
              Add external person
            </button>
          </div>
        ) : null}
      </div>
      <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)}>
        {d && !d.enabled ? (
          <Banner kind="info" title="The external personnel register is off">
            Turn on "External personnel enabled" in HR Settings to record contract auditors and experts.
          </Banner>
        ) : null}
        {ok ? (
          <p className="page-note" role="status">
            {ok}
          </p>
        ) : null}
        {open ? (
          <div className="hr-box">
            <div className="hr-box__h">
              <div>
                <h3>Add external person</h3>
              </div>
            </div>
            <div className="hr-box__b hr-view" style={{ gap: 10 }}>
              <label className="hr-f">
                <span>Full name</span>
                <input className="hr-in" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </label>
              <label className="hr-f">
                <span>Role</span>
                <select className="hr-in" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
                  <option value="">Choose…</option>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="hr-f">
                <span>Email (gives them a portal login for their declaration)</span>
                <input className="hr-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
              </label>
              <label className="hr-f">
                <span>Organisation (optional)</span>
                <input className="hr-in" value={org} onChange={(e) => setOrg(e.target.value)} disabled={busy} />
              </label>
              <label className="hr-f">
                <span>Notes (optional)</span>
                <input className="hr-in" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
              </label>
              {err ? (
                <Banner kind="bad" title="Not added">
                  {err}
                </Banner>
              ) : null}
              <div>
                <button type="button" className="btn pri" disabled={busy} onClick={() => void add()}>
                  {busy ? "Adding…" : "Add"}
                </button>{" "}
                <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
                  Back
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {d?.items.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table" aria-label="External personnel">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Organisation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.full_name}</b>
                      {p.email ? <small style={{ display: "block", color: "var(--muted)" }}>{p.email}</small> : null}
                    </td>
                    <td>{p.role}</td>
                    <td>{p.organisation || "—"}</td>
                    <td>
                      <StatusPill cls={p.status === "Active" ? "ok" : "mute"} label={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : d?.enabled ? (
          <EmptyState title="No external people yet" detail="Add a contract auditor or expert to record their competence and declaration." />
        ) : null}
      </ResourceGate>
    </div>
  );
}
