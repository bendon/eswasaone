import { NotConnectedPanel } from "@eswasaone/shared-ui";
import { RequireStaff } from "../components/RequireStaff";

/**
 * Cases — grievances & disciplinary.
 * // TODO: wire real — GET /hr/cases (HR Manager + owner only) once Disciplinary Case
 * and Employee Grievance are registered (brief §10 / §12).
 */
export function CasesView() {
  return (
    <RequireStaff reason="Staff sign-in required">
      <div className="hr">
        <div className="hr-head">
          <div>
            <h2>Cases</h2>
            <p>Grievances and disciplinary matters. Visible to the HR Manager and the case owner only.</p>
          </div>
        </div>
        <NotConnectedPanel
          what="Cases"
          detail="Disciplinary Case DocType is scaffolded in eswasa_hr; the list API must never return involved names and must stay off global search. Until GET /hr/cases is wired this tab stays closed."
        />
      </div>
    </RequireStaff>
  );
}
