import { ModulePageShell } from "./ModulePageShell";

/** My HR — every employee's self-service. SoT: docs/mocks/eswasaone-hr.html #/me (screens E1–E3). */
export function MyHrPage() {
  return (
    <ModulePageShell
      reason="Sign in to see your leave and HR record"
      tabs={[
        { to: "", label: "Overview", icon: "i-home" },
        { to: "leave", label: "My leave", icon: "i-cal" },
      ]}
    />
  );
}
