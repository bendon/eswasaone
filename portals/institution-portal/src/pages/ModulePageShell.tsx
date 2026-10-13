import { Outlet, useOutletContext } from "react-router-dom";
import { SubTabs, type SubTab } from "@eswasaone/shared-ui";
import { RequireStaff } from "../components/RequireStaff";

/**
 * Shared layout shell for Institution module pages.
 * Forwards the InstitutionLayout outlet context to nested sub-view routes.
 */
export function ModulePageShell({
  reason,
  tabs,
  children,
  nestedTabs = false,
}: {
  reason: string;
  tabs: SubTab[];
  children?: React.ReactNode;
  /** Highlight a tab for routes nested under it, e.g. /hr/recruitment/new. */
  nestedTabs?: boolean;
}) {
  const ctx = useOutletContext();
  return (
    <RequireStaff reason={reason}>
      {children}
      <SubTabs tabs={tabs} nested={nestedTabs} />
      <Outlet context={ctx} />
    </RequireStaff>
  );
}
