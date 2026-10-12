import { Link } from "react-router-dom";
import { NotConnectedPanel } from "@eswasaone/shared-ui";
import { RequireStaff } from "../components/RequireStaff";

/**
 * Competence — authorisation matrix.
 * Declarations register is live (DeclarationsView). // TODO: wire real — GET /hr/competence/matrix + /expiring
 * once Staff Authorisation is live (brief §6 / §12).
 */
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
        </div>
        <Link className="hr-card" to="declarations" style={{ marginBottom: 16, maxWidth: 420 }}>
          <span className="l">Live</span>
          <span className="v" style={{ fontSize: 17 }}>
            Impartiality and confidentiality declarations
          </span>
          <span className="d">Who has signed this year, and reminders for who hasn't</span>
        </Link>
        <NotConnectedPanel
          what="Competence matrix"
          detail="Staff Authorisation and the Skill catalogue are being installed in eswasa_hr. The matrix and Field Visit guard will both call eswasa_hr.competence.is_authorised — no invented cover numbers until that endpoint is live."
        />
      </div>
    </RequireStaff>
  );
}
