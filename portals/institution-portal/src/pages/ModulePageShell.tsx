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
}: {
  reason: string;
  tabs: SubTab[];
  children?: React.ReactNode;
}) {
  const ctx = useOutletContext();
  return (
    <RequireStaff reason={reason}>
      {children}
      <SubTabs tabs={tabs} />
      <Outlet context={ctx} />
    </RequireStaff>
  );
}
