import { useEffect, useMemo, useState } from "react";
import { Icon } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { components } from "@contracts";
import { deskAvailable, openDeskOrExplain } from "./desk";
import { initialsFromName } from "./helpers";
import { PAYROLL_STEPS } from "./overviewMock";

type HrPayslip = components["schemas"]["HrPayslip"];
type HrPayrollStatus = components["schemas"]["HrPayrollStatus"];

/** Payroll — live slips + run status; processing stays desk-linked when Desk is available. */
export function PayrollView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const statusRes = useApiResource<HrPayrollStatus>("/hr/payroll/status", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const slipsRes = useApiResource<{ items: HrPayslip[] }>("/hr/slips?limit=20", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (statusRes.authRequired || slipsRes.authRequired) openAuth("Staff sign-in required");
  }, [statusRes.authRequired, slipsRes.authRequired, openAuth]);

  const status = statusRes.data;
  const slips = useMemo(() => slipsRes.data?.items ?? [], [slipsRes.data]);

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={statusRes.loading && slipsRes.loading}
        refreshing={statusRes.refreshing || slipsRes.refreshing}
        error={statusRes.error || slipsRes.error}
        onRetry={() => {
          statusRes.reload();
          slipsRes.reload();
        }}
        hasData={statusRes.data != null || slipsRes.data != null}
        skeleton="dashboard"
        label="Loading payroll…"
      >
        <div className="hr">
          {flash ? (
            <p style={{ fontSize: 12.5, color: "var(--navy)", margin: "0 0 12px", fontWeight: 600 }}>
              {flash}
            </p>
          ) : null}

          <div className="hr-head">
            <div>
              <h2>Payroll</h2>
              <p>
                {status?.period || "October 2026"} run
                {status?.message ? `. ${status.message}` : ". Cut-off Tue 20 Oct, pays Fri 23 Oct."}
              </p>
            </div>
            <div className="hr-head__r">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => openDeskOrExplain("payroll-entry", setFlash)}
              >
                <Icon name="i-eye" />
                {deskAvailable() ? "Open in Desk" : "Desk unavailable"}
              </button>
            </div>
          </div>

          {/* // TODO: wire real — payroll run steps from HRMS workflow */}
          <div className="hr-stack">
            <ol className="hr-steps">
              {PAYROLL_STEPS.map((s) => (
                <li key={s.em} className={s.state || undefined}>
                  <em>{s.em}</em>
                  <b>{s.title}</b>
                  <span>{s.detail}</span>
                </li>
              ))}
            </ol>

            <div className="hr-grid c2">
              <div className="hr-box hr-scroll">
                <div className="hr-box__h">
                  <div>
                    <h3>Changes this month</h3>
                    <p>Each needs approval before the cut-off</p>
                  </div>
                </div>
                <table className="hr-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>From</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>Sandile Ndwandwe joins</b>
                        <div className="sub">Laboratory Technician, band B. Bank details not yet on file.</div>
                      </td>
                      <td>1 Oct</td>
                      <td>
                        <span className="hr-st bad">Blocked</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>Phindile Motsa promoted</b>
                        <div className="sub">Band B to band C</div>
                      </td>
                      <td>1 Oct</td>
                      <td>
                        <span className="hr-st leave">Waiting for Finance</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>Mandla Zwane leaves</b>
                        <div className="sub">Final pay with 6 leave days paid out</div>
                      </td>
                      <td>31 Oct</td>
                      <td>
                        <span className="hr-st leave">Waiting for Finance</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>Acting allowance ends</b>
                        <div className="sub">Thandi Mamba, acting Certification Manager cover ended</div>
                      </td>
                      <td>1 Oct</td>
                      <td>
                        <span className="hr-st ok">Approved</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="hr-box hr-scroll">
                <div className="hr-box__h">
                  <div>
                    <h3>October estimate against September</h3>
                    <p>In emalangeni. Final figures after step 3.</p>
                  </div>
                  {status?.status ? (
                    <span className="hr-st probation">
                      <span className="d" />
                      {status.status}
                    </span>
                  ) : null}
                </div>
                <table className="hr-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>September</th>
                      <th>October est.</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Employees paid</td>
                      <td className="num">85</td>
                      <td className="num">{status?.employees_processed ?? 86}</td>
                      <td className="num">+1</td>
                    </tr>
                    <tr>
                      <td>Gross pay</td>
                      <td className="num">2,371,900</td>
                      <td className="num">2,412,600</td>
                      <td className="num">+1.7%</td>
                    </tr>
                    <tr>
                      <td>Statutory deductions</td>
                      <td className="num">561,400</td>
                      <td className="num">573,000</td>
                      <td className="num">+2.1%</td>
                    </tr>
                    <tr>
                      <td>Other deductions</td>
                      <td className="num">142,300</td>
                      <td className="num">142,300</td>
                      <td className="num">0%</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Net pay</td>
                      <td className="num">1,668,200</td>
                      <td className="num">1,697,300</td>
                      <td className="num">+1.7%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p className="hr-note">
              Individual pay is not shown on this page. It opens per employee, for the HR Manager and
              Finance only, and each view is logged.
            </p>
          </div>

          <div className="hr-box" style={{ marginTop: 16 }}>
            <div className="hr-box__h">
              <div>
                <h3>Recent salary slips</h3>
                <p>From HRMS via Core</p>
              </div>
            </div>
            <div className="hr-box__b" style={{ paddingTop: 0, overflowX: "auto" }}>
              {slips.length === 0 ? (
                <EmptyState
                  title="No salary slips"
                  detail="Slips appear once Payroll Entry has been processed in HRMS (or your role can read Salary Slip)."
                />
              ) : (
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Period</th>
                      <th className="mono" style={{ textAlign: "right" }}>
                        Net (SZL)
                      </th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slips.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="hr-who">
                            <span className="hr-av">{initialsFromName(s.employee)}</span>
                            <div>
                              <b>{s.employee}</b>
                              <span className="id">{s.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>{s.period || "—"}</td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                          {s.net_pay != null ? s.net_pay.toLocaleString() : "—"}
                        </td>
                        <td>
                          <span className="hr-st ok">
                            <span className="d" />
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </ResourceGate>
    </RequireStaff>
  );
}
