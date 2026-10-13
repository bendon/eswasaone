import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrMyTraining, HrMyTrainingCourse } from "../api/types";
import { NeedsTable } from "../hr/training/Training";
import { fmtDay, StatusPill } from "./parts";

/**
 * E13 My training (HR additions plan 05): my training needs, the courses I'm nominated for, and what I attended.
 * Live GET /hr/me/training. Attended courses with a result also back my authorisations (My authorisations).
 */
function Courses({ items, past }: { items: HrMyTrainingCourse[]; past?: boolean }) {
  return (
    <div className="hr-box">
      <div className="hr-box__b">
        <div className="hr-out">
          {items.map((c) => (
            <div className="hr-out__i" key={c.event}>
              <div>
                <b>{c.event_name ?? c.event}</b>
                <span className="s">
                  {fmtDay(c.start_time, true)}
                  {c.location ? `, ${c.location}` : ""}
                </span>
              </div>
              <span className="r">
                {past ? (
                  <StatusPill cls={c.attendance === "Present" ? "ok" : c.attendance === "Absent" ? "bad" : "mute"} label={c.attendance === "Present" ? "Attended" : c.attendance === "Absent" ? "Absent" : c.event_status ?? "Not recorded"} />
                ) : (
                  <StatusPill cls="info" label="Nominated" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MyTraining() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrMyTraining>("/hr/me/training", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
      {d ? (
        <div className="hr-view">
          <div className="hr-head">
            <div>
              <h2>My training</h2>
              <p>Courses you're nominated for, what you attended, and the training needs raised for you.</p>
            </div>
          </div>
          <h3>Coming up</h3>
          {d.upcoming.length ? <Courses items={d.upcoming} /> : <EmptyState title="No courses coming up" detail="When your line manager or HR nominates you, the course appears here." />}
          <h3>My training needs</h3>
          {d.needs.length ? <NeedsTable needs={d.needs} person={false} /> : <EmptyState title="No training needs" detail="Needs from your review or an expiring authorisation appear here." />}
          {d.history.length ? (
            <>
              <h3>Past courses</h3>
              <Courses items={d.history} past />
            </>
          ) : null}
        </div>
      ) : null}
    </ResourceGate>
  );
}
