import { ModulePageShell } from "./ModulePageShell";

/** My HR — every employee's self-service. SoT: docs/mocks/eswasaone-hr.html #/me (screens E1–E3). */
export function MyHrPage() {
  return (
    <ModulePageShell
      reason="Sign in to see your leave and HR record"
      tabs={[
        { to: "", label: "Overview", icon: "i-home" },
        { to: "leave", label: "My leave", icon: "i-cal" },
        { to: "profile", label: "My profile", icon: "i-clipboard" },
        { to: "expenses", label: "Expense claims", icon: "i-dollar" },
        { to: "competence", label: "My authorisations", icon: "i-award" },
        { to: "interviews", label: "Interviews to score", icon: "i-users" },
      ]}
    />
  );
}
