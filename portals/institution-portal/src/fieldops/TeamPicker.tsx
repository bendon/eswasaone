/**
 * Visit team picker (§5.7; gap 05 C7, 08): ineligible people are greyed out with the reason —
 * competence for the scheme, impartiality (relationship within 2 years, declaration on file),
 * rotation, leave and workload. Assigning runs the visit's "assign" transition.
 */
import { useState } from "react";
import { actOnVisit, eligibleTeam, type FieldVisit } from "@eswasaone/shared-ui/field";
import { ReasonDialog, type Actor } from "@eswasaone/shared-ui/workflow";

export function TeamPicker({ visit, actor, onClose, onDone }: { visit: FieldVisit; actor: Actor; onClose: () => void; onDone: (msg: string) => void }) {
  const people = eligibleTeam(visit.id);
  const [lead, setLead] = useState(visit.lead ?? "");
  const [team, setTeam] = useState<string[]>(visit.team);
  const [date, setDate] = useState(visit.planned_date.slice(0, 10));
  const [days, setDays] = useState(String(visit.auditor_days ?? visit.duration_days));
  const toggle = (n: string) => setTeam((t) => (t.includes(n) ? t.filter((x) => x !== n) : [...t, n]));
  return (
    <ReasonDialog
      title={`Assign team — ${visit.title}`}
      consequence="The lead gets a task to accept. Eligibility is checked now; people who can't take the visit are greyed out with the reason."
      confirmLabel="Assign"
      reasonLabel="Note for the team (optional)"
      canSubmit={Boolean(lead)}
      onClose={onClose}
      onSubmit={async (v) => {
        await actOnVisit(visit.id, "assign", actor, { expected_state: visit.state, note: v.note, payload: { lead, team: team.filter((x) => x !== lead).join(","), planned_date: date, auditor_days: days } });
        onDone(`Assigned ${lead}${team.length ? ` + ${team.filter((x) => x !== lead).length}` : ""}.`);
      }}
    >
      <div className="crm-grid crm-grid--2">
        <label className="crm-field">
          Date
          <input className="crm-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="crm-field">
          Auditor-days
          <input className="crm-input" type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <table className="crm-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Disciplines</th>
            <th>Open visits</th>
            <th>Lead</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name} style={p.ok ? undefined : { opacity: 0.55 }} title={p.why}>
              <td>
                <b>{p.name}</b>
                <span className="crm-small">{p.ok ? p.title : `✕ ${p.why}`}</span>
              </td>
              <td className="crm-small">{p.disciplines.join(", ") || "—"}</td>
              <td>{p.load}</td>
              <td>
                <input type="radio" name="lead" disabled={!p.ok} checked={lead === p.name} onChange={() => setLead(p.name)} aria-label={`Lead ${p.name}`} />
              </td>
              <td>
                <input type="checkbox" disabled={!p.ok || lead === p.name} checked={team.includes(p.name) && lead !== p.name} onChange={() => toggle(p.name)} aria-label={`Team ${p.name}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReasonDialog>
  );
}
