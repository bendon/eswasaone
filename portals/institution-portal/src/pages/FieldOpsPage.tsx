import { ModulePageShell } from "./ModulePageShell";

/** Field operations (gap 08) — planning board, visit records and sample custody / lab receipt. */
export function FieldOpsPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for field operations"
      tabs={[
        { to: "", label: "Planning board", icon: "i-board" },
        { to: "receipt", label: "Samples & receipt", icon: "i-flask" },
      ]}
    />
  );
}
