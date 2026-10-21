"use client";

import { useSyncExternalStore } from "react";
import type { ReadHistory, ReadRecord } from "@/lib/recommend";
import { createStore, readJSON, writeJSON } from "./store";

/* ───────────────────────── read history (on-device) ───────────────────────── */

const READ_KEY = "nwm:read";
const MAX_READ = 400;
const EMPTY: ReadHistory = {};

const readStore = createStore<ReadHistory>(() => (typeof window === "undefined" ? EMPTY : readJSON("local", READ_KEY, EMPTY)));

export function useReadHistory(): ReadHistory {
  return useSyncExternalStore(readStore.subscribe, readStore.get, () => EMPTY);
}

export function markRead(slug: string, rec: Omit<ReadRecord, "t"> & { t?: number }) {
  const cur = readStore.get();
  const prev = cur[slug];
  const next: ReadHistory = {
    ...cur,
    [slug]: {
      t: rec.t ?? Date.now(),
      beat: rec.beat,
      tags: rec.tags.slice(0, 6),
      dwell: Math.max(prev?.dwell ?? 0, Math.round(rec.dwell)),
      expect: rec.expect,
      done: Boolean(prev?.done || rec.done),
    },
  };
  const keys = Object.keys(next);
  if (keys.length > MAX_READ) {
    keys
      .sort((a, b) => next[a].t - next[b].t)
      .slice(0, keys.length - MAX_READ)
      .forEach((k) => delete next[k]);
  }
  writeJSON("local", READ_KEY, next);
  readStore.set(next);
}

/* ───────────────────────── last visit ───────────────────────── */

const VISIT_KEY = "nwm:visit";
const SESSION_FLAG = "nwm:session";
interface Visit {
  prev: number; // previous session start (0 = first visit)
  current: number;
}

const visitStore = createStore<Visit>(() => {
  if (typeof window === "undefined") return { prev: 0, current: 0 };
  const stored = readJSON<Visit>("local", VISIT_KEY, { prev: 0, current: 0 });
  // Roll the window once per browser session.
  if (!readJSON("session", SESSION_FLAG, false)) {
    const now = Date.now();
    const next = { prev: stored.current || 0, current: now };
    writeJSON("local", VISIT_KEY, next);
    writeJSON("session", SESSION_FLAG, true);
    return next;
  }
  return stored;
});

const NO_VISIT: Visit = { prev: 0, current: 0 };
/** Start of the reader's previous session (epoch ms; 0 on first visit or during SSR). */
export function useLastVisit(): number {
  return useSyncExternalStore(visitStore.subscribe, () => visitStore.get().prev, () => NO_VISIT.prev);
}

/* ───────────────────────── reading queue ───────────────────────── */

export interface QueueItem {
  s: string; // slug
  t: string; // title
  b: string; // beat
  r?: number; // read seconds
}
export interface Queue {
  ctx: string; // e.g. "home:river", "beat:ai", "story:…"
  label: string; // "라이브", "AI", "스토리 · …"
  items: QueueItem[];
}

const QUEUE_KEY = "nwm:queue";

/** Remember the list the reader is navigating, so next/prev follow it. */
export function setQueue(q: Queue, focus?: string) {
  // Keep a window around the opened item so a click deep in a long list still has a queue.
  const at = focus ? Math.max(0, q.items.findIndex((x) => x.s === focus)) : 0;
  const start = Math.max(0, Math.min(at - 20, q.items.length - 120));
  writeJSON("session", QUEUE_KEY, { ...q, items: q.items.slice(start, start + 120) });
}

export function getQueue(): Queue | null {
  if (typeof window === "undefined") return null;
  return readJSON<Queue | null>("session", QUEUE_KEY, null);
}

/** Cross-tab sync for read history. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === READ_KEY) readStore.refresh();
  });
}
