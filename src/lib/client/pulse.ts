"use client";

import { useSyncExternalStore } from "react";
import type { Pulse } from "@/data/dto";
import { createStore } from "./store";

/**
 * Live data for static pages: ticker quotes, newest headlines, sentiment index.
 * Polled from /api/pulse (edge-cacheable JSON) while the tab is visible.
 */
const store = createStore<Pulse | null>(() => null);
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
const INTERVAL = 45_000;

async function load() {
  try {
    const res = await fetch("/api/pulse", { cache: "no-store" });
    if (res.ok) store.set((await res.json()) as Pulse);
  } catch {}
}

export function startPulse() {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  load();
  const tick = () => {
    if (document.visibilityState === "visible") load();
  };
  timer = setInterval(tick, INTERVAL);
  const onVis = () => {
    if (document.visibilityState === "visible") load();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onVis);
  return () => {
    started = false;
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onVis);
  };
}

export function usePulse(): Pulse | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

export function refreshPulse() {
  return load();
}
