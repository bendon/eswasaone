import { ModulePageShell } from "./ModulePageShell";

/** Standards development — Catalogue · Drafts · Work items · Ballots · Comments */
export function StandardsPage() {
  return (
    <ModulePageShell
      reason="Staff sign-in required for standards"
      tabs={[
        { to: "", label: "Catalogue", icon: "i-book" },
        { to: "drafts", label: "Drafts" },
        { to: "workitems", label: "Work items" },
        { to: "ballots", label: "Ballots" },
        { to: "comments", label: "Comments" },
      ]}
    />
  );
}
