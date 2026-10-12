import { useMemo } from "react";
import { useStoreResource } from "@eswasaone/shared-ui/store";
import { isManager, listTasks, taskStore } from "@eswasaone/shared-ui/tasks";
import { actorFrom } from "../approvals/live";
import { useInstitution } from "../layout/InstitutionLayout";
import { ModulePageShell } from "./ModulePageShell";
import { useApiResource } from "../hooks/useApiResource";
import type { ApprovalsResponse } from "../api/types";

/** Approvals — the staff queue for everything (workflow map invariant 6; gap 02). */
export function ApprovalsPage() {
  const { user, sessionKey } = useInstitution();
  const actor = useMemo(() => actorFrom(user), [user]);
  const mine = useStoreResource([taskStore], () => listTasks(actor, { queue: "mine" }).length, [actor.name]);
  const live = useApiResource<ApprovalsResponse>("/approvals?limit=100", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  // Inbox badge = local mine count + live pending count
  const inboxCount = (mine.data ?? 0) + (live.data?.items?.length ?? 0);
  // Team badge = total live items (visible to managers)
  const teamCount = live.data?.items?.length ?? 0;

  return (
    <ModulePageShell
      reason="Staff sign-in required for approvals"
      tabs={[
        { to: "", label: "Inbox", icon: "i-check-c", badge: inboxCount || undefined },
        ...(isManager(actor)
          ? [{ to: "team" as const, label: "Team", icon: "i-users" as const, badge: teamCount || undefined }]
          : []),
        { to: "delegations", label: "Delegations", icon: "i-swap" },
        { to: "done", label: "Done", icon: "i-done" },
      ]}
    />
  );
}