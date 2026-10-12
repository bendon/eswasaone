import { useState } from "react";
import { apiFetch } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrDeclarationRegister, HrRemindResult } from "../api/types";
import { Banner, Crumbs, NextStep, StatusPill } from "../me/parts";

/**
 * H5c Impartiality and confidentiality declarations register (journey J5, HR side).
 * Live GET /hr/impartiality; HR roles only (enforced in eswasa_hr). Signing happens in My HR.
 */
export function DeclarationsView() {
  const { user, sessionKey } = useInstitution();
  const reg = useApiResource<HrDeclarationRegister>("/hr/impartiality", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = reg.data;
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<HrRemindResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function remind() {
    setBusy(true);
    setErr(null);
    try {
      setSent(await apiFetch<HrRemindResult>("/hr/impartiality/remind", { method: "POST", body: JSON.stringify({ confirm: true }) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reminders weren't sent.");
    } finally {
      setBusy(false);
    }
  }

  const pct = d && d.total ? Math.round((d.signed / d.total) * 100) : 0;

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate loading={reg.loading} error={reg.error} onRetry={reg.reload} refreshing={reg.refreshing} hasData={Boolean(d)}>
        {d ? (
          <div className="hr hr-view">
            <Crumbs items={[["Competence", ".."], ["Declarations"]]} />
            <div className="hr-head">
              <div>
                <h2>Impartiality and confidentiality declarations, {d.year_label}</h2>
                <p>
                  {d.signed} of {d.total} signed. Unsigned staff are excluded from audit and decision work.
                </p>
              </div>
              {d.outstanding.length ? (
                <div className="hr-head__r">
                  <button type="button" className="btn pri" disabled={busy} onClick={() => void remind()}>
                    {busy ? "Sending…" : `Remind the ${d.outstanding.length}`}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="hr-prog" style={{ height: 10 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Signed">
              <i style={{ width: `${pct}%` }} />
            </div>

            {sent ? (
              <Banner kind="ok" title={`${sent.created} reminder${sent.created === 1 ? "" : "s"} sent`}>
                Each person has a task in Approvals until they sign.
                {sent.without_login ? ` ${sent.without_login} people have no portal login, so HR must collect theirs on paper or link a login first.` : ""}
              </Banner>
            ) : null}
            {err ? (
              <Banner kind="bad" title="Reminders weren't sent">
                {err}
              </Banner>
            ) : null}

            {d.outstanding.length ? (
              <div className="hr-box hr-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Effect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.outstanding.map((o) => (
                      <tr key={o.employee}>
                        <td>
                          <b>{o.employee_name ?? o.employee}</b>
                          {o.designation ? <div className="sub">{o.designation}</div> : null}
                        </td>
                        <td>{o.department ?? "—"}</td>
                        <td>
                          <StatusPill cls="bad" label="Outstanding" />
                        </td>
                        <td className="sub">{o.has_login ? "Excluded from audits and decisions" : "No portal login: can't sign online"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Everyone has signed" detail={`All ${d.total} declarations for ${d.year_label} are on file.`} />
            )}

            <p className="hr-note">
              Each declaration lists the organisations a person worked for or consulted to in the last two years, and
              includes the confidentiality undertaking. The audit planner keeps people off those clients' audits and
              decisions.
            </p>
            <NextStep
              title="People sign from their own My HR"
              body="A reminder puts a task in their Approvals; it closes itself when they sign."
            />
          </div>
        ) : null}
      </ResourceGate>
    </RequireStaff>
  );
}
