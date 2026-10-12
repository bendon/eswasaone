import { useEffect, useMemo, useState } from "react";
import { Icon, NotConnectedPanel } from "@eswasaone/shared-ui";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import type { components } from "@contracts";
import { deskAvailable, openDeskOrExplain } from "./desk";
import { initialsFromName } from "./helpers";

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

          <div style={{ marginBottom: 16 }}>
            <NotConnectedPanel
              what="Payroll run tracker"
              detail={
                status?.period
                  ? `Live status: ${status.period} · ${status.status || "—"}. The six-step change feed and month comparison need GET /hr/payroll/run (and §0.5 payroll-scope decision).`
                  : "Six-step run tracker and change feed need GET /hr/payroll/run once Finance confirms payroll stays in HRMS (§0.5 #6)."
              }
            />
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
