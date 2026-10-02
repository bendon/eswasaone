/** Updates hook — fetches latest updates from Core /api/content/updates.
 * TODO: wire real — add MSW handler + SWR-style caching when Core is live. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./client";

export type UpdateItem = {
  id: string;
  title: string;
  summary: string;
  tag: string; // "new" | "review" | "published" | "notice"
  date: string; // ISO date
  href: string;
  foot_icon: string;
  foot_label: string;
};

type UseUpdatesResult = {
  data: UpdateItem[] | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: () => void;
};

/** Fetch the latest published updates for the landing page. */
export function useUpdates(limit = 6): UseUpdatesResult {
  const [data, setData] = useState<UpdateItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<UpdateItem[]>(`/content/updates?limit=${limit}`)
      .then((items) => {
        if (!cancelled) {
          setData(items);
          setError(undefined);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, nonce]);

  return { data, loading, error, refetch };
}