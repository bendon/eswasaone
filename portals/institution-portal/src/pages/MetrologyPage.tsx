import { ModulePageShell } from "./ModulePageShell";

/** Metrology & LIMS — Jobs · Instruments · Results */
export function MetrologyPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for metrology"
      tabs={[
        { to: "", label: "Jobs", icon: "i-gauge" },
        { to: "instruments", label: "Instruments" },
        { to: "results", label: "Results" },
      ]}
    />
  );
}
