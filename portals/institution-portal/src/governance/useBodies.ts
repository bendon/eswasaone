import { useMemo } from "react";
import type { GovernanceBodiesResponse, GovernanceBody } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { useInstitution } from "../layout/InstitutionLayout";
import { STUB_BODIES } from "./stubs";

/**
 * Governance bodies for meeting forms and filters — live GET /governance/bodies, stub fallback.
 * Always includes the Full Board.
 */
export function useBodies(): { bodies: GovernanceBody[]; options: { value: string; label: string }[] } {
  const { user, sessionKey } = useInstitution();
  const res = useApiResource<GovernanceBodiesResponse>("/governance/bodies", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  return useMemo(() => {
    const live = res.data?.items ?? [];
    const bodies = live.length ? live : STUB_BODIES;
    const names = ["Full Board", ...bodies.filter((b) => b.type === "Committee").map((b) => b.name)];
    return {
      bodies,
      options: Array.from(new Set(names)).map((n) => ({ value: n, label: n })),
    };
  }, [res.data]);
}
