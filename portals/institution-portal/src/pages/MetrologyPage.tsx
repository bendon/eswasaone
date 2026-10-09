import { ModulePageShell } from "./ModulePageShell";

/** Metrology & LIMS (gap 07) — request → quote → receipt → worksheet → review → certificate → dispatch, plus LIMS. */
export function MetrologyPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for metrology"
      tabs={[
        { to: "", label: "Overview", icon: "i-chart" },
        { to: "requests", label: "Requests", icon: "i-mail" },
        { to: "receipt", label: "Receipt", icon: "i-clipboard" },
        { to: "jobs", label: "Jobs", icon: "i-gauge" },
        { to: "review", label: "Review", icon: "i-check-c" },
        { to: "items", label: "Customer items" },
        { to: "equipment", label: "Lab equipment", icon: "i-sliders" },
        { to: "tests", label: "LIMS tests", icon: "i-flask" },
        { to: "capacity", label: "Capacity", icon: "i-users" },
        { to: "settings", label: "Settings", icon: "i-settings" },
      ]}
    />
  );
}
