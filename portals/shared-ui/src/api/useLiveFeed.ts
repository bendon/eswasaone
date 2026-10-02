/**
 * useLiveFeed — topic-aware alias over useFeed (/ws/feed).
 * Topic filtering is client-side until Core supports subscribe-by-topic.
 */
import { useMemo } from "react";
import { useFeed, type UseFeedOptions } from "../api/useFeed";
import type { components } from "../types";

type FeedItem = components["schemas"]["FeedItem"];

export type UseLiveFeedOptions = UseFeedOptions & {
  /** Optional type/topic substring filter (e.g. "approvals", "sla") */
  topic?: string;
};

export function useLiveFeed(topicOrOpts?: string | UseLiveFeedOptions): FeedItem[] {
  const opts: UseLiveFeedOptions =
    typeof topicOrOpts === "string" ? { topic: topicOrOpts } : topicOrOpts ?? {};
  const items = useFeed({
    enabled: opts.enabled,
    limit: opts.limit,
    onEvent: opts.onEvent,
  });
  const topic = opts.topic?.toLowerCase();
  return useMemo(() => {
    if (!topic) return items;
    return items.filter((it) => {
      const hay = `${it.type ?? ""} ${it.title ?? ""} ${it.href ?? ""}`.toLowerCase();
      return hay.includes(topic);
    });
  }, [items, topic]);
}

export type { FeedItem };
