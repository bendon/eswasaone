/**
 * Our TBT notifications (06 P3): draft technical regulations ESWASA notified to the WTO, the comment
 * deadline and how many member comments came back into the Standards comment workspace.
 */
import { Link } from "react-router-dom";
import { listTbtOutgoing } from "@eswasaone/shared-ui/standards";
import { Empty, Gate, PageHead, useDomain } from "../domain/ui";
import { fmtDate } from "@eswasaone/shared-ui/record";

export function TbtOutgoingView() {
  const res = useDomain(() => listTbtOutgoing(), []);
  return (
    <Gate res={res} what="TBT notifications">
      {(rows) => (
        <div className="crm-stack">
          <PageHead title="Our notifications to the WTO" sub="Draft technical regulations notified from Standards Development. Member comments are imported into the work item for the TC to resolve." />
          {!rows.length ? (
            <Empty icon="i-globe" title="Nothing notified yet">
              Notify a draft from its work item (Standards → Work items → TBT tab).
            </Empty>
          ) : (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Work item</th>
                  <th>Products</th>
                  <th>Notified</th>
                  <th>Comments until</th>
                  <th className="num">Comments in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="crm-mono">{r.symbol}</td>
                    <td>
                      <Link className="crm-link" to={`/standards/workitems/${r.wi_id}`}>
                        {r.ref}
                      </Link>
                      <span className="crm-small">
                        {r.title} · {r.state}
                      </span>
                    </td>
                    <td className="crm-small">{r.products}</td>
                    <td>{fmtDate(r.notified_at)}</td>
                    <td>
                      {fmtDate(r.comment_until)}
                      {new Date(r.comment_until) < new Date() ? <span className="crm-pill">Closed</span> : <span className="crm-pill crm-pill--green">Open</span>}
                    </td>
                    <td className="num">{r.imported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Gate>
  );
}
