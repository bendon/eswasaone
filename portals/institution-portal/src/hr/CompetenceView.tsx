import { NotConnectedPanel } from "@eswasaone/shared-ui";
import { RequireStaff } from "../components/RequireStaff";

/**
 * Competence — authorisation matrix.
 * // TODO: wire real — GET /hr/competence/matrix + /expiring + /impartiality
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
        <NotConnectedPanel
          what="Competence"
          detail="Staff Authorisation, the Skill catalogue and Impartiality Declaration are being installed in eswasa_hr. The matrix and Field Visit guard will both call eswasa_hr.competence.is_authorised — no invented cover numbers until that endpoint is live."
        />
      </div>
    </RequireStaff>
  );
}
