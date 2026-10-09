import { RequireStaff } from "../components/RequireStaff";
import {
  COMP_COVER,
  COMP_HEADERS,
  COMP_ROWS,
  type CompCell,
} from "./overviewMock";

/** Competence — authorisation matrix. // TODO: wire real once Orchestrator adds contract. */

function cellNode(v: CompCell) {
  if (v === "Y") return <span className="hr-st ok">Current</span>;
  if (v === "T") return <span className="hr-st info">In training</span>;
  if (v.startsWith("E:")) return <span className="hr-st leave">To {v.slice(2)}</span>;
  return <span className="none">–</span>;
}

export function CompetenceView() {
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr">
        <div className="hr-head">
          <div>
            <h2>Competence</h2>
            <p>
              Who is authorised to do what. Certification and Metrology only offer people who are
              authorised here on the day of the work.
            </p>
          </div>
          <div className="hr-head__r">
            <button type="button" className="btn ghost" disabled title="Coming soon">
              Record an authorisation
            </button>
          </div>
        </div>

        <div className="hr-stack">
          <div className="hr-box hr-scroll">
            <table className="hr-table hr-mx">
              <thead>
                <tr>
                  <th>Person</th>
                  {COMP_HEADERS.map((h) => (
                    <th key={h} className="c">
                      {h.split("\n").map((line) => (
                        <span key={line} style={{ display: "block" }}>
                          {line}
                        </span>
                      ))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMP_ROWS.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <b>{r.name}</b>
                      <div className="sub">{r.role}</div>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="c">
                        {cellNode(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Cover</td>
                  {COMP_COVER.map((c, i) => (
                    <td key={i} className="c">
                      {typeof c === "string" ? (
                        c
                      ) : (
                        <span className={`hr-st ${c.tone}`}>{c.text}</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="hr-grid c2">
            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Expiring in 60 days</h3>
                  <p>Renew before the date or the person drops out of assignment</p>
                </div>
              </div>
              <div className="hr-box__b hr-out">
                <div className="hr-out__i">
                  <div>
                    <b>Sipho Magagula, EMS auditor</b>
                    <span className="s">Needs 2 witnessed audits. 1 done.</span>
                  </div>
                  <span className="r">15 Nov</span>
                </div>
                <div className="hr-out__i">
                  <div>
                    <b>Gcina Mavuso, mass calibration</b>
                    <span className="s">Proficiency test booked 3 Nov</span>
                  </div>
                  <span className="r">20 Nov</span>
                </div>
                <div className="hr-out__i">
                  <div>
                    <b>Thandi Mamba, FSMS lead auditor</b>
                    <span className="s">Refresher course not yet booked</span>
                  </div>
                  <span className="r">30 Nov</span>
                </div>
                <div className="hr-out__i">
                  <div>
                    <b>Sifiso Hlophe, volume calibration</b>
                    <span className="s">Only person authorised. Nothing booked.</span>
                  </div>
                  <span className="r">2 Dec</span>
                </div>
              </div>
            </div>

            <div className="hr-box">
              <div className="hr-box__h">
                <div>
                  <h3>Impartiality declarations, 2026/27</h3>
                  <p>80 of 86 signed</p>
                </div>
                <span className="hr-st info">6 outstanding</span>
              </div>
              <div className="hr-box__b">
                <div className="hr-prog" aria-hidden>
                  <i style={{ width: "93%" }} />
                </div>
                <p className="hr-note" style={{ marginTop: 12 }}>
                  Each declaration lists the organisations a person has worked for or consulted to in
                  the last two years. The audit planner uses that list to keep them off those
                  clients&apos; audits and decisions.
                </p>
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn ghost sm" disabled title="Coming soon">
                    Remind the 6
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RequireStaff>
  );
}
