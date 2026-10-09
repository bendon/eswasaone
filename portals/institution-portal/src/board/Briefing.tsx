/**
 * Assistant briefing (03 P3): "Summarise this pack in one page" and "What changed since last quarter?",
 * built from the frozen snapshot figures. Proposes only — the reader checks it against the pack.
 */
import { Link } from "react-router-dom";
import { CrmDrawer } from "@eswasaone/shared-ui/crm";
import { packBriefing } from "@eswasaone/shared-ui/governance";

export function BriefingDrawer({ packId, v, includeRestricted = false, onClose }: { packId: string; v?: number; includeRestricted?: boolean; onClose: () => void }) {
  const br = packBriefing(packId, v, { includeRestricted });
  return (
    <CrmDrawer open wide title={br ? `Briefing — pack v${br.version}` : "Briefing"} subtitle={br?.meeting} onClose={onClose}>
      {!br ? (
        <p className="crm-muted">Nothing assembled yet. The briefing is built from a frozen pack version.</p>
      ) : (
        <>
          <div className="crm-banner crm-banner--info">
            <div>Assistant draft from the frozen figures in v{br.version}. Check it against the pack before you rely on it.</div>
          </div>
          {br.changes.length ? (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Figure</th>
                  <th className="num">{br.previous ?? "Before"}</th>
                  <th className="num">Now</th>
                </tr>
              </thead>
              <tbody>
                {br.changes.map((c) => (
                  <tr key={`${c.section}|${c.metric}`}>
                    <td>{c.section}</td>
                    <td>{c.metric}</td>
                    <td className="num">{c.before}</td>
                    <td className="num">
                      <b>{c.after}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <pre className="eo-msgprev__body" style={{ whiteSpace: "pre-wrap" }}>
            {br.text}
          </pre>
          <div className="crm-row">
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => void navigator.clipboard?.writeText(br.text)}>
              Copy
            </button>
            <Link className="crm-btn crm-btn--sm" to={`/print/briefing/${packId}?v=${br.version}${includeRestricted ? "&restricted=1" : ""}`} target="_blank">
              Print one page
            </Link>
          </div>
        </>
      )}
    </CrmDrawer>
  );
}
