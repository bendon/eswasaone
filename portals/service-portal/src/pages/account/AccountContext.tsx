import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AccountEntity, AccountStats } from "@eswasaone/shared-ui";
import { getOverview, listEntities } from "../../api/account";
import { useToast } from "../../ui/Toast";

export type EntityKind = "personal" | "business";

type AccountCtx = {
  entity: EntityKind;
  entities: AccountEntity[];
  activeEntity: AccountEntity | null;
  stats: AccountStats | null;
  setEntity: (id: EntityKind) => void;
  loading: boolean;
};

const Ctx = createContext<AccountCtx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<AccountEntity[]>([]);
  const [entity, setEntityState] = useState<EntityKind>("personal");
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void listEntities()
      .then((res) => {
        if (cancelled) return;
        setEntities(res.items);
        setEntityState((res.active as EntityKind) || "personal");
      })
      .catch(() => {
        /* IdleLockGate / AuthProvider handle 401 session_locked | expired */
        if (!cancelled) setEntities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch KPI strip whenever the active entity changes
  useEffect(() => {
    let cancelled = false;
    void getOverview(entity)
      .then((ov) => {
        if (!cancelled) setStats(ov.stats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  // Sync body data-context for CSS visibility rules
  useEffect(() => {
    document.body.dataset.context = entity;
  }, [entity]);

  const setEntity = useCallback(
    (id: EntityKind) => {
      setEntityState(id);
      const ent = entities.find((e) => e.id === id);
      showToast(`Switched to ${ent?.short_name || id}`);
    },
    [entities, showToast],
  );

  const activeEntity = useMemo(
    () => entities.find((e) => e.id === entity) ?? null,
    [entities, entity],
  );

  const value = useMemo(
    () => ({ entity, entities, activeEntity, stats, setEntity, loading }),
    [entity, entities, activeEntity, stats, setEntity, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount outside AccountProvider");
  return ctx;
}
