import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrLeavePolicy } from "../api/types";
import { Banner, Crumbs, fmtDay } from "../me/parts";

/** H4b Leave policy: the leave types and entitlements in force, read-only. Live GET /hr/leave/policy (H14). */

type PolicyType = HrLeavePolicy["leave_types"][number] & Record<string, unknown>;

const RULES: Array<[string, string, (v: unknown) => string | null]> = [
  ["max_leaves_allowed", "Most days a year", (v) => (num(v) ? `${v} days` : null)],
  ["applicable_after", "Can be taken after", (v) => (num(v) ? `${v} working days in post` : null)],
  ["max_continuous_days_allowed", "Longest single stretch", (v) => (num(v) ? `${v} days` : null)],
  ["is_carry_forward", "Carry-over", (v) => (v ? "Allowed" : null)],
  ["maximum_carry_forwarded_leaves", "Most days carried over", (v) => (num(v) ? `${v} days` : null)],
  ["expire_carry_forwarded_leaves_after_days", "Carried days expire after", (v) => (num(v) ? `${v} days` : null)],
  ["allow_encashment", "Encashment", (v) => (v ? "Allowed" : null)],
  ["is_earned_leave", "Earned", (v) => (v ? "Accrues over the year" : null)],
  ["earned_leave_frequency", "Accrues", (v) => (typeof v === "string" && v ? v : null)],
  ["is_lwp", "Without pay", (v) => (v ? "Yes" : null)],
  ["is_optional_leave", "Optional holiday", (v) => (v ? "Yes" : null)],
  ["allow_negative", "Can go below zero", (v) => (v ? "Yes" : null)],
];

function num(v: unknown): boolean {
  return typeof v === "number" && v > 0;
}

export function LeavePolicyView() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrLeavePolicy>("/hr/leave/policy", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const types = (d?.leave_types ?? []) as PolicyType[];

  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)}>
      <div className="hr-view">
        <Crumbs items={[["Time off", "/hr/time-off"], ["Leave policy"]]} />
        <div className="hr-head">
          <div>
            <h2>Leave policy</h2>
            <p>
              {d?.leave_period
                ? `Leave period ${d.leave_period.name}: ${fmtDay(d.leave_period.from_date, true)} to ${fmtDay(d.leave_period.to_date, true)}.`
                : "No active leave period."}{" "}
              Changes are made in HR setup, not here.
            </p>
          </div>
        </div>

        {!d?.configured ? (
          <Banner kind="warn" title={`Awaiting ESWASA${d?.awaiting ? ` (${d.awaiting})` : ""}`}>
            ESWASA HR hasn't confirmed its leave types, entitlements and carry-over yet. Nothing is assumed until it does.
          </Banner>
        ) : null}

        {types.length ? (
          <div className="hr-box hr-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Entitlement</th>
                  <th>Rules</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const rules = RULES.map(([k, l, f]) => {
                    const v = f(t[k]);
                    return v ? `${l}: ${v}` : null;
                  }).filter(Boolean);
                  return (
                    <tr key={t.name}>
                      <td>
                        <b>{t.name}</b>
                      </td>
                      <td>
                        {t.allocations.length
                          ? t.allocations.map((a) => `${a.annual_allocation ?? "—"} days${a.policy ? ` (${a.policy})` : ""}`).join(", ")
                          : "Not in a leave policy"}
                      </td>
                      <td>{rules.length ? rules.join(" · ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No leave types set up" detail="Leave types appear here once HR setup records ESWASA's leave policy." />
        )}
      </div>
    </ResourceGate>
  );
}
