import { ModulePageShell } from "./ModulePageShell";

/** TBT — Alerts · Subscriptions */
export function TbtPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for TBT alerts"
      tabs={[
        { to: "", label: "Alerts", icon: "i-bell" },
        { to: "outgoing", label: "Our notifications", icon: "i-globe" },
        { to: "subscriptions", label: "Subscriptions", icon: "i-mail" },
      ]}
    />
  );
}
