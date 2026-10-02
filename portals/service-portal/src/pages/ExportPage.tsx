import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTbtAlerts, type TbtAlert } from "../api/misc";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function ExportPage() {
  const [alerts, setAlerts] = useState<TbtAlert[]>([]);

  useEffect(() => {
    void listTbtAlerts().then(setAlerts);
  }, []);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Export" }]} />
      <h1 className="page-h">Export guidance</h1>
      <p className="page-lead">Market access requirements and live WTO/TBT alerts.</p>
      <div className="btn-row">
        <Link className="btn-primary" to="/applicability">
          Check applicability
        </Link>
        <Link className="btn-ghost" to="/goals/export-honey-eu">
          Build an export guide
        </Link>
      </div>
      <h2 className="sec-h">WTO / TBT alerts</h2>
      <ul className="card-list">
        {alerts.map((a) => (
          <li key={a.id}>
            <div>
              <b>{safeText(a.title)}</b>
              <span>
                {safeText(a.market)} · {safeText(a.published)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
