import { ModulePageShell } from "./ModulePageShell";

/**
 * Certification (gap 05): pipeline by workflow-map state, record pages, planning, register and settings.
 * Sub-views render through <Outlet/> (see router.tsx).
 */
export function CertificationPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for certification"
      tabs={[
        { to: "", label: "Pipeline", icon: "i-board" },
        { to: "quotes", label: "Quotes", icon: "i-dollar" },
        { to: "audits", label: "Audits", icon: "i-clipboard" },
        { to: "findings", label: "Findings", icon: "i-warn" },
        { to: "decisions", label: "Decisions", icon: "i-scroll" },
        { to: "certificates", label: "Register", icon: "i-award" },
        { to: "surveillance", label: "Surveillance", icon: "i-cal" },
        { to: "register", label: "Appeals & complaints", icon: "i-shield-c" },
        { to: "marks", label: "Mark use", icon: "i-badge" },
        { to: "auditors", label: "Auditors", icon: "i-users" },
        { to: "settings", label: "Settings", icon: "i-settings" },
      ]}
    />
  );
}
