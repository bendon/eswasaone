import { useMemo } from "react";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { isManager, listTasks, taskStore } from "@eswasaone/shared-ui/tasks";
import { actorFrom } from "../approvals/live";
import { useInstitution } from "../layout/InstitutionLayout";
import { ModulePageShell } from "./ModulePageShell";

/** Approvals — the staff queue for everything (workflow map invariant 6; gap 02). */
export function ApprovalsPage() {
  const { user } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const mine = useStoreResource([taskStore], () => listTasks(actor, { queue: "mine" }).length, [actor.name]);
  return (
    <ModulePageShell
      reason="Staff sign-in required for approvals"
      tabs={[
        { to: "", label: "Inbox", icon: "i-check-c", badge: mine.data || undefined },
        ...(isManager(actor) ? [{ to: "team", label: "Team", icon: "i-users" as const }] : []),
        { to: "delegations", label: "Delegations" },
        { to: "done", label: "Done" },
      ]}
    />
  );
}
