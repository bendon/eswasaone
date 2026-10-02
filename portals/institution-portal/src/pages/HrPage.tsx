import { ModulePageShell } from "./ModulePageShell";

/** HR & People — Overview · Directory · Structure · Time off · Recruitment · Performance · Payroll */
export function HrPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for HR"
      tabs={[
        { to: "", label: "Overview", icon: "i-home" },
        { to: "directory", label: "Directory", icon: "i-users" },
        { to: "structure", label: "Structure", icon: "i-grid" },
        { to: "time-off", label: "Time off", icon: "i-clock" },
        { to: "recruitment", label: "Recruitment", icon: "i-briefcase" },
        { to: "performance", label: "Performance", icon: "i-gauge" },
        { to: "payroll", label: "Payroll", icon: "i-dollar" },
      ]}
    />
  );
}
