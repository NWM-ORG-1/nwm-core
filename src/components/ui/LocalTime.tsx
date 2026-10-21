"use client";

import { useSyncExternalStore } from "react";
import { clockKST, dateTimeKST, relTime } from "@/lib/format";

// One shared minute ticker for every timestamp on the page.
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

/**
 * Absolute KST time on the server ("14:05"), relative in the browser
 * ("3분 전") for recent items. Width is reserved by the caller's layout.
 */
export function LocalTime({ iso, mode = "clock", within = 24 }: { iso: string; mode?: "clock" | "full"; within?: number }) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const absolute = mode === "full" ? dateTimeKST(iso) : clockKST(iso);
  const recent = t > 0 && t - new Date(iso).getTime() < within * 3_600_000;
  return (
    <time dateTime={iso} title={dateTimeKST(iso)} suppressHydrationWarning>
      {recent ? relTime(iso, t) : absolute}
    </time>
  );
}
