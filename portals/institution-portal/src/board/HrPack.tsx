import type { ReactNode } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrBoardPack } from "../api/types";
import { Banner, fmtDay } from "../me/parts";

/**
 * Board HR pack (H15) for the Council HR & Remuneration Committee. Aggregates only, from the same live
 * numbers as the HR Overview (GET /hr/board-pack): no names, pay or case details ever appear here.
 * Figures that can't be worked out yet show as "—" with the reason, never a sample value.
 */

const KIND = { grievance: "grievances", disciplinary: "disciplinary" } as Record<string, string>;

function Card({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <div className="kpi">
      <span className="l">{label}</span>
      <span className="v">{value}</span>
      <span className="d">{detail}</span>
    </div>
  );
}

export function BoardHrPack() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrBoardPack>("/hr/board-pack", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const est = d?.establishment;
  const cases = d?.cases ?? null;
  const openCases = cases ? cases.reduce((n, c) => n + c.open, 0) : null;
  const days = cases?.map((c) => c.avg_days_to_close).filter((x): x is number => x != null) ?? [];
  const appr = d?.appraisals;
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="dashboard">
      {d ? (
        <div className="hr hr-view">
          <div className="hr-head">
            <div>
              <h2>Board HR pack</h2>
              <p>Council HR & Remuneration Committee. As at {fmtDay(d.as_of, true)}. Aggregates only, no names.</p>
            </div>
          </div>
          {d.establishment_changes.map((c) => (
            <Banner key={`${c.department}:${c.summary}`} kind={c.state === "Waiting for Council" ? "info" : "lock"} title={`${c.state === "Waiting for Council" ? "For decision" : "With the Executive Director"}: ${c.summary}, ${c.department}`}>
              {c.state === "Waiting for Council"
                ? "Approved by the Executive Director. The Board Secretary records the committee's decision in Approvals."
                : "Comes to the committee if the Executive Director approves it."}
            </Banner>
          ))}
          <div className="kpis kpis--4" role="group" aria-label="HR figures">
            <Card
              label="Headcount"
              value={
                <>
                  {d.headcount}
                  {est?.approved ? <small> of {est.approved} posts</small> : null}
                </>
              }
              detail={est?.approved ? `${Math.round((est.filled / est.approved) * 100)}% of the approved establishment` : "No approved establishment loaded yet"}
            />
            <Card
              label="Turnover, 12 months"
              value={d.turnover.pct != null ? `${d.turnover.pct}%` : "—"}
              detail={`${d.turnover.leavers} leavers, ${d.turnover.joiners} joiners`}
            />
            <Card label="Vacancies" value={est ? est.vacant : "—"} detail={est ? `${est.in_recruitment} in recruitment, ${est.frozen} frozen` : "From the approved establishment"} />
            <Card
              label="Competence cover"
              value={d.competence ? <>{d.competence.at_risk ?? 0} <small>at risk</small></> : "—"}
              detail={d.competence ? `Competences with one or no holder, of ${d.competence.catalogue ?? 0}` : "No competence catalogue yet"}
            />
            <Card
              label="Appraisals"
              value={appr && appr.people ? `${Math.round((appr.manager_done / appr.people) * 100)}%` : "—"}
              detail={appr ? `Manager reviews done, ${appr.cycle_name}${appr.end_date ? `, closes ${fmtDay(appr.end_date, true)}` : ""}` : "No appraisal cycle in the last quarter"}
            />
            <Card
              label="Cases"
              value={openCases ?? "—"}
              detail={
                cases
                  ? `${cases.map((c) => `${c.open} ${KIND[c.kind] ?? c.kind}`).join(", ")} open${days.length ? `. ${Math.round(days.reduce((a, b) => a + b, 0) / days.length)} days average to close` : ""}`
                  : "Not recorded yet"
              }
            />
            <Card
              label="Declarations"
              value={d.declarations?.total ? <>{d.declarations.signed} <small>of {d.declarations.total}</small></> : "—"}
              detail={d.declarations ? `Impartiality and confidentiality${d.declarations.year ? `, ${d.declarations.year}` : ""}` : "Not set up yet"}
            />
          </div>
          {!d.headcount ? <EmptyState title="No employee records yet" detail="The pack fills in once HR's employee import is done." /> : null}
          <p className="hr-note">Built from the same numbers as the HR Overview. Names, pay and case details never appear in the pack.</p>
        </div>
      ) : null}
    </ResourceGate>
  );
}
