"use client";

import { useSyncExternalStore } from "react";
import { clockKST, dateTimeKST, relTime } from "@/lib/format";

// One shared 30-second clock. The interval only runs while something is
// subscribed, so a route hidden by <Activity> stops ticking.
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getSnapshot = () => now || (now = Date.now());
const getServerSnapshot = () => 0;

/** Browser clock (0 during SSR and hydration). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** "3시간 전" in the browser; the KST clock until hydrated. */
export function Ago({ iso, className }: { iso: string; className?: string }) {
  const t = useNow();
  return (
    <time dateTime={iso} title={dateTimeKST(iso)} className={className} suppressHydrationWarning>
      {t ? relTime(iso, t) : clockKST(iso)}
    </time>
  );
}
