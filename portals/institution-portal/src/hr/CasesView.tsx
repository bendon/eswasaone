import { RequireStaff } from "../components/RequireStaff";
import { HR_CASES } from "./overviewMock";

/** Cases — grievances & disciplinary. // TODO: wire real once Orchestrator adds contract. */
export function CasesView() {
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr">
        <div className="hr-head">
          <div>
            <h2>Cases</h2>
            <p>Grievances and disciplinary matters. Visible to the HR Manager and the case owner only.</p>
          </div>
          <div className="hr-head__r">
            <button type="button" className="btn pri" disabled title="Coming soon">
              Open a case
            </button>
          </div>
        </div>

        <div className="hr-box hr-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Kind</th>
                <th>Opened</th>
                <th>Stage</th>
                <th>Owner</th>
                <th>Next step due</th>
              </tr>
            </thead>
            <tbody>
              {HR_CASES.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td>{c.kind}</td>
                  <td>{c.opened}</td>
                  <td>
                    <span className={`hr-st ${c.stageTone}`}>{c.stage}</span>
                  </td>
                  <td>{c.owner}</td>
                  <td>{c.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hr-note" style={{ marginTop: 12 }}>
          Names of the people involved appear only inside the case. Counts by kind and time to close
          go to the Board HR pack; nothing else leaves this page.
        </p>
      </div>
    </RequireStaff>
  );
}
