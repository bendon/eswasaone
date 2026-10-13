import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { useInstitution } from "../layout/InstitutionLayout";
import type { HrTeamTraining, HrTrainingEvent, HrTrainingUpcoming } from "../api/types";
import { errorText, hrSend } from "../hr/api";
import { NeedsTable, RaiseNeedDrawer } from "../hr/training/Training";
import { Banner, Crumbs, fmtDay } from "../me/parts";

/**
 * T8 Team training (HR additions plan 05): my team's training needs, "Raise a need", and upcoming training events
 * with "Nominate" (a checkbox list of my team). eswasa_hr refuses anyone outside the manager's team.
 */
function EventRow({ ev, team, onDone }: { ev: HrTrainingUpcoming; team: HrTeamTraining["team"]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = new Map(team.map((t) => [t.name, t.employee_name ?? t.name]));
  const options = team.filter((t) => !ev.nominated.includes(t.name));
  async function nominate() {
    setBusy(true);
    setErr(null);
    try {
      await hrSend<HrTrainingEvent>(`/hr/training/events/${encodeURIComponent(ev.name)}/nominate`, { employees: chosen });
      setOpen(false);
      setChosen([]);
      onDone();
    } catch (e) {
      setErr(errorText(e, "Not nominated."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hr-out__i">
      <div>
        <b>{ev.event_name ?? ev.name}</b>
        <span className="s">
          {fmtDay(ev.start_time, true)}
          {ev.location ? `, ${ev.location}` : ""}
          {ev.nominated.length ? `. Nominated: ${ev.nominated.map((n) => names.get(n) ?? n).join(", ")}` : ""}
        </span>
        {open ? (
          <div>
            {options.map((t) => (
              <label key={t.name} className="hr-f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={chosen.includes(t.name)} onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, t.name] : cur.filter((x) => x !== t.name)))} />
                <span>{t.employee_name ?? t.name}</span>
              </label>
            ))}
            {err ? <p className="hr-note">{err}</p> : null}
            <button type="button" className="btn pri sm" disabled={!chosen.length || busy} onClick={() => void nominate()}>
              {busy ? "Saving…" : "Send nominations"}
            </button>
          </div>
        ) : null}
      </div>
      <span className="r">
        {options.length && !open ? (
          <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
            Nominate
          </button>
        ) : null}
      </span>
    </div>
  );
}

export function TeamTraining() {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<HrTeamTraining>("/hr/team/training", { enabled: Boolean(user), refreshKey: sessionKey });
  const d = res.data;
  const [raising, setRaising] = useState(false);
  return (
    <ResourceGate loading={res.loading} error={res.error} onRetry={res.reload} refreshing={res.refreshing} hasData={Boolean(d)} skeleton="list">
      {d ? (
        <div className="hr-view">
          <Crumbs items={[["My team", "/team"], ["Training"]]} />
          <div className="hr-head">
            <div>
              <h2>Team training</h2>
              <p>What your team needs to learn, and the courses coming up.</p>
            </div>
            {d.team.length ? (
              <div className="hr-head__r">
                <button type="button" className="btn pri" onClick={() => setRaising(true)}>
                  Raise a need
                </button>
              </div>
            ) : null}
          </div>
          {!d.team.length ? (
            <EmptyState title="Nobody reports to you" detail="If that's wrong, ask HR to set the line manager on your team's records." />
          ) : (
            <>
              <h3>Needs</h3>
              {d.needs.length ? (
                <NeedsTable needs={d.needs} />
              ) : (
                <EmptyState title="No training needs" detail="Needs from your reviews, expiring authorisations and the ones you raise appear here." />
              )}
              <h3>Upcoming courses</h3>
              {d.events.length ? (
                <div className="hr-box">
                  <div className="hr-box__b">
                    <div className="hr-out">
                      {d.events.map((ev) => (
                        <EventRow key={ev.name} ev={ev} team={d.team} onDone={res.reload} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Banner kind="info" title="No courses scheduled">
                  HR schedules courses from the approved department training plans. <Link to="/team">Back to my team</Link>
                </Banner>
              )}
            </>
          )}
          <RaiseNeedDrawer
            open={raising}
            people={d.team}
            onClose={() => setRaising(false)}
            onDone={() => {
              setRaising(false);
              res.reload();
            }}
          />
        </div>
      ) : null}
    </ResourceGate>
  );
}
