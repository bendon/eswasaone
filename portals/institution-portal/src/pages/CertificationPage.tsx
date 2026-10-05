import { ModulePageShell } from "./ModulePageShell";

/**
 * Certification: Pipeline · Quotes · Audits · Findings · Decisions · Certificates · Register.
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
        { to: "certificates", label: "Certificates", icon: "i-award" },
        { to: "register", label: "Register & appeals", icon: "i-shield-c" },
      ]}
    />
  );
}
