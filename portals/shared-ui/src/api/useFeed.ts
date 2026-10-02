import { useEffect, useRef, useState } from "react";
import type { components } from "../types";
import { wsBase } from "./client";

type FeedItem = components["schemas"]["FeedItem"];

export type UseFeedOptions = {
  enabled?: boolean;
  /** Max items retained client-side */
  limit?: number;
  /** Called whenever a new live event arrives (after history seed). */
  onEvent?: (item: FeedItem) => void;
};

/**
 * Subscribe to Core `/ws/feed` with reconnect backoff.
 * Prefer this over polling for approvals, dashboards, and docks.
 */
export function useFeed(enabledOrOpts: boolean | UseFeedOptions = true): FeedItem[] {
  const opts: UseFeedOptions =
    typeof enabledOrOpts === "boolean" ? { enabled: enabledOrOpts } : enabledOrOpts;
  const enabled = opts.enabled !== false;
  const limit = opts.limit ?? 40;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  const [items, setItems] = useState<FeedItem[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(`${wsBase()}/feed`);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        seeded.current = false;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as FeedItem | { items: FeedItem[] };
          if ("items" in data && Array.isArray(data.items)) {
            setItems(data.items.slice(0, limit));
            seeded.current = true;
            return;
          }
          if (data && typeof data === "object" && "id" in data) {
            const item = data as FeedItem;
            setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)].slice(0, limit));
            if (seeded.current) onEventRef.current?.(item);
            else seeded.current = true;
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onerror = () => {
        /* Core offline / MSW — reconnect handles recovery */
      };

      ws.onclose = () => {
        if (!closed) scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (closed) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      attempt += 1;
      timer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [enabled, limit]);

  return items;
}
