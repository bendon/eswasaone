import { ModulePageShell } from "./ModulePageShell";

/** Standards development (gap 06) — proposal → drafts → public review → ballot → publication → review. */
export function StandardsPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for standards"
      tabs={[
        { to: "", label: "Programme", icon: "i-chart" },
        { to: "proposals", label: "Proposals", icon: "i-mail" },
        { to: "workitems", label: "Work items", icon: "i-file" },
        { to: "comments", label: "Public review" },
        { to: "ballots", label: "Ballots", icon: "i-check-c" },
        { to: "catalogue", label: "Catalogue", icon: "i-book" },
        { to: "committees", label: "Committees", icon: "i-users" },
        { to: "reviews", label: "Periodic review", icon: "i-refresh" },
        { to: "settings", label: "Settings", icon: "i-settings" },
      ]}
    />
  );
}
