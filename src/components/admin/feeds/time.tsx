"use client";

import { useSyncExternalStore } from "react";
import { clockKST, dateTimeKST, relTime, ymdKST } from "@/lib/format";

// One shared 30-second clock for every timestamp in these screens. The interval
// only runs while something is subscribed, so routes hidden by Activity stop it.
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

/** Browser clock (0 during SSR / hydration). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** "3분 전" — empty until hydrated so server and client markup agree. */
export function Ago({ iso, className }: { iso: string | null; className?: string }) {
  const t = useNow();
  if (!iso) return <span className={className}>—</span>;
  return (
    <time dateTime={iso} title={dateTimeKST(iso)} className={className} suppressHydrationWarning>
      {t ? relTime(iso, t) : clockKST(iso)}
    </time>
  );
}

/** "14:05 · 3분 전" for today (KST); "10.19 14:05 · 2일 전" otherwise. */
export function Stamp({ iso }: { iso: string }) {
  const t = useNow();
  const today = t ? ymdKST(new Date(t)) : null;
  const day = ymdKST(iso);
  const clock = clockKST(iso);
  const abs = today && day !== today ? `${day.slice(5).replace("-", ".")} ${clock}` : clock;
  return (
    <time dateTime={iso} title={dateTimeKST(iso)} className="flex flex-col leading-tight" suppressHydrationWarning>
      <span className="tabular font-mono text-[12px] text-fg-2">{abs}</span>
      <span className="tabular text-[11px] text-fg-3">{t ? relTime(iso, t) : " "}</span>
    </time>
  );
}
