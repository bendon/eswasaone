import { Link } from "react-router-dom";
import { EmptyState } from "../../components/PageStates";
import type { HrWarnings } from "../../api/types";
import { fmtDay, StatusPill } from "../../me/parts";

/**
 * H1b Warnings (HR additions plan 01), HR Managers only: the person's disciplinary warnings with their status and
 * a link to the case. Never the allegation; the case holds that. A lapsed or withdrawn warning doesn't count.
 */

const CLS: Record<string, string> = { Active: "bad", Expired: "info", Withdrawn: "mute" };

/** The small header flag: shown only while a warning still counts. */
export function warningFlag(w: HrWarnings | null | undefined): string | null {
  if (!w?.active) return null;
  return w.active_until ? `Active warning until ${fmtDay(w.active_until, true)}` : "Active warning (expiry not set, A1)";
}

export function WarningsSection({ w }: { w: HrWarnings | null | undefined }) {
  if (!w) return <p className="hr-note">Loading warnings…</p>;
  if (!w.items.length) return <EmptyState title="No warnings on file" detail="Warnings appear here when a disciplinary outcome issues one." />;
  return (
    <div className="hr-box hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Sanction</th>
            <th>Offence</th>
            <th>Issued</th>
            <th>Expires</th>
            <th>Status</th>
            <th>Case</th>
          </tr>
        </thead>
        <tbody>
          {w.items.map((i) => (
            <tr key={i.case}>
              <td>{i.sanction ?? "—"}</td>
              <td>{i.offence_title ?? i.offence ?? "—"}</td>
              <td>{fmtDay(i.issued_on, true)}</td>
              <td>{i.expires_on ? fmtDay(i.expires_on, true) : i.status === "Active" ? "Not set (A1)" : "—"}</td>
              <td>{i.status ? <StatusPill cls={CLS[i.status] ?? "info"} label={i.status} /> : "—"}</td>
              <td>
                <Link className="hr-lnk mono" to={`/hr/cases/disciplinary/${encodeURIComponent(i.case)}`}>
                  {i.case}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
