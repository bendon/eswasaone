import { ModulePageShell } from "./ModulePageShell";

/** HR & People — SoT: docs/mocks/eswasaone-hr.html (9 tabs). */
export function HrPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for HR"
      tabs={[
        { to: "", label: "Overview", icon: "i-home" },
        { to: "directory", label: "Directory", icon: "i-users" },
        { to: "structure", label: "Structure", icon: "i-grid" },
        { to: "time-off", label: "Time off", icon: "i-clock" },
        { to: "competence", label: "Competence", icon: "i-award", badge: 4 },
        { to: "recruitment", label: "Recruitment", icon: "i-briefcase" },
        { to: "performance", label: "Performance", icon: "i-gauge" },
        { to: "payroll", label: "Payroll", icon: "i-dollar", badge: 3 },
        { to: "cases", label: "Cases", icon: "i-case" },
      ]}
    />
  );
}
