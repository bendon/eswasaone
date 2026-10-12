import { ModulePageShell } from "./ModulePageShell";

/** My team — a line manager's reports. SoT: docs/mocks/eswasaone-hr.html #/team (screens T1–T4). */
export function TeamPage() {
  return (
    <ModulePageShell
      reason="Sign in to see your team"
      tabs={[
        { to: "", label: "Overview", icon: "i-home" },
        { to: "calendar", label: "Calendar", icon: "i-cal" },
      ]}
    />
  );
}
