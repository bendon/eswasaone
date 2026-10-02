import { ModulePageShell } from "./ModulePageShell";

/** Finance — Dashboard · Invoices · Budget · Revenue · Settings */
export function FinancePage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for finance"
      tabs={[
        { to: "", label: "Dashboard", icon: "i-chart" },
        { to: "invoices", label: "Invoices" },
        { to: "budget", label: "Budget" },
        { to: "revenue", label: "Revenue" },
        { to: "settings", label: "Settings", icon: "i-sliders" },
      ]}
    />
  );
}
