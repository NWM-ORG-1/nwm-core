"use client";

import { useSyncExternalStore } from "react";
import type { Queue, QueueItem } from "@/lib/client/reading";
import { trafficSource, type TrafficSource } from "@/lib/traffic";

export interface ReaderQueue {
  queue: Queue;
  index: number;
  prev: QueueItem | null;
  next: QueueItem | null;
}

const QUEUE_KEY = "nwm:queue";
const cache = new Map<string, ReaderQueue>();
const noopSubscribe = () => () => {};

function resolve(slug: string, fallback: Queue, raw: string | null): ReaderQueue {
  let q = fallback;
  if (raw) {
    try {
      const stored = JSON.parse(raw) as Queue;
      if (stored?.items?.some((i) => i.s === slug)) q = stored;
    } catch {}
  }
  const index = Math.max(0, q.items.findIndex((i) => i.s === slug));
  return { queue: q, index, prev: q.items[index - 1] ?? null, next: q.items[index + 1] ?? null };
}

function snapshot(slug: string, fallback: Queue, client: boolean): ReaderQueue {
  let raw: string | null = null;
  if (client) {
    try {
      raw = window.sessionStorage.getItem(QUEUE_KEY);
    } catch {}
  }
  const key = `${slug}|${fallback.ctx}|${raw ?? ""}`;
  let v = cache.get(key);
  if (!v) {
    v = resolve(slug, fallback, raw);
    cache.set(key, v);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return v;
}

/**
 * The reading queue for an article: the list the reader came from (session),
 * or — on a direct visit — related + same-story articles from the server.
 * Read synchronously on client navigations (no flash of the fallback queue);
 * on a hard load React hydrates with the server queue, then switches.
 */
export function useReaderQueue(slug: string, fallback: Queue): ReaderQueue {
  return useSyncExternalStore(
    noopSubscribe,
    () => snapshot(slug, fallback, true),
    () => snapshot(slug, fallback, false),
  );
}

let landed = false;
/** The page load's own referrer counts once, for the article the reader landed on; views after that are moves inside the site. */
function viewSource(): TrafficSource {
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    const landing = !landed && nav != null && new URL(nav.name).pathname === location.pathname;
    landed = true;
    return landing ? trafficSource(document.referrer, location.host) : "internal";
  } catch {
    return "other";
  }
}

export function beacon(slug: string, ev: "view" | "read" | "next", dwell?: number) {
  try {
    const body = JSON.stringify({ slug, ev, ...(dwell ? { dwell: Math.round(dwell) } : {}), ...(ev === "view" ? { src: viewSource() } : {}) });
    if (!navigator.sendBeacon?.("/api/beacon", body)) {
      fetch("/api/beacon", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {}
}
