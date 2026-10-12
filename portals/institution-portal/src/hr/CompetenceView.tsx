import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrAuthorisationRow, HrCompetenceMatrix } from "../api/types";
import { fmtDay, NextStep } from "../me/parts";
import { AuthPill, coverLabel } from "./competence/shared";

/**
 * H5 Competence — who is authorised to do what (journey J4). Live GET /hr/competence/matrix and
 * /hr/competence/expiring. Certification and Metrology assign through the same records
 * (eswasa_hr.competence.is_authorised), so this matrix and the audit planner always agree.
 */
export function CompetenceView() {
  const { user, sessionKey } = useInstitution();
  const mx = useApiResource<HrCompetenceMatrix>("/hr/competence/matrix", { enabled: Boolean(user), refreshKey: sessionKey });
  const ex = useApiResource<{ items: HrAuthorisationRow[] }>("/hr/competence/expiring", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = mx.data;
  const thin = (d?.skills ?? []).filter((s) => s.holders <= 1);

  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr hr-view">
        <div className="hr-head">
          <div>
            <h2>Competence</h2>
            <p>Who is authorised to do what. Certification and Metrology only offer people who are authorised here on the day of the work.</p>
          </div>
          <div className="hr-head__r">
            <Link className="btn ghost" to="/hr/competence/declarations">
              Declarations
            </Link>
            <Link className="btn ghost" to="/hr/competence/external">
              External personnel
            </Link>
            <Link className="btn ghost" to="/hr/competence/pack">
              Evidence pack
            </Link>
            <Link className="btn pri" to="/hr/competence/new">
              <Icon name="i-plus" />
              Record an authorisation
            </Link>
          </div>
        </div>

        <ResourceGate loading={mx.loading} error={mx.error} onRetry={mx.reload} refreshing={mx.refreshing} hasData={Boolean(d)} skeleton="panel">
          {d && !d.skills.length ? (
            <EmptyState
              title="No competences set up yet"
              detail="Add the competence catalogue (Skills with a kind, scheme and validity) in HR setup. ESWASA supplies the list per scheme and discipline."
            />
          ) : null}

          {d && d.skills.length ? (
            <>
              {thin.length ? (
                <div className="hr-banner warn" role="alert">
                  <Icon name="i-warn" />
                  <div>
                    <b>
                      {thin.length} competence{thin.length === 1 ? " depends" : "s depend"} on one person or nobody
                    </b>
                    <p>{thin.map((s) => s.name).join(", ")}. Heads of department are alerted (R-H4).</p>
                  </div>
                </div>
              ) : null}
              <div className="hr-box hr-scroll">
                <table className="hr-table hr-mx">
                  <thead>
                    <tr>
                      <th>Person</th>
                      {d.skills.map((s) => (
                        <th key={s.name} className="c">
                          {s.name}
                          {s.scheme ? <div className="sub">{s.scheme}</div> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.people.map((p) => (
                      <tr key={p.employee}>
                        <td>
                          <b>{p.employee_name ?? p.employee}</b>
                        </td>
                        {d.skills.map((s) => {
                          const c = p.cells[s.name];
                          return (
                            <td key={s.name} className="c">
                              {c ? (
                                <Link to={`/hr/competence/authorisations/${encodeURIComponent(c.id)}`} aria-label={`${p.employee_name}, ${s.name}: ${c.status}`}>
                                  <AuthPill status={c.status} validTo={c.valid_to} />
                                </Link>
                              ) : (
                                <span className="none" aria-label="Not held">
                                  –
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Cover</td>
                      {d.skills.map((s) => {
                        const c = coverLabel(s.holders, s.expiring);
                        return (
                          <td key={s.name} className="c">
                            <span className={`hr-st ${c.cls}`}>{c.label}</span>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : null}
        </ResourceGate>

        <div className="hr-box">
          <div className="hr-box__h">
            <div>
              <h3>Expiring in 60 days</h3>
              <p>Renew before the date or the person drops out of assignment</p>
            </div>
          </div>
          <div className="hr-box__b">
            {ex.data?.items.length ? (
              <div className="hr-out">
                {ex.data.items.map((r) => (
                  <div className="hr-out__i" key={r.id}>
                    <div>
                      <b>
                        {r.employee_name ?? r.employee}, {r.skill}
                      </b>
                      <span className="s">Ends {fmtDay(r.valid_to, true)}</span>
                    </div>
                    <Link className="hr-lnk" to={`/hr/competence/new?employee=${encodeURIComponent(r.employee)}&skill=${encodeURIComponent(r.skill)}`}>
                      Renew
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hr-note">{ex.loading ? "Loading…" : "Nothing ends in the next 60 days."}</p>
            )}
          </div>
        </div>

        <NextStep
          title="Renewals start with evidence"
          body="Staff can ask for a renewal from My HR. You record it here; the head of their department approves it in Approvals."
        />
      </div>
    </RequireStaff>
  );
}
