import { useEffect, useSyncExternalStore } from "react";
import { getSchemes, loadSchemes, subscribeSchemes, type Scheme } from "../api/certification";

/** Live scheme list from GET /certification/schemes (built-in templates until it loads). */
export function useSchemes(): Scheme[] {
  const schemes = useSyncExternalStore(subscribeSchemes, getSchemes);
  useEffect(() => {
    void loadSchemes();
  }, []);
  return schemes;
}
