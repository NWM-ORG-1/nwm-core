"use client";

import { useEffect, useSyncExternalStore } from "react";
import { startPulse, usePulse } from "@/lib/client/pulse";
import { fmtChange, fmtPrice } from "@/lib/format";

/**
 * Market strip. Fixed height (no layout shift); values arrive from /api/pulse,
 * never from page HTML, so quotes changing never invalidates static pages.
 */
const PAUSE_KEY = "nwm:ticker-paused";
const PAUSE_EVT = "nwm:ticker";
let memPaused = false; // when storage is unavailable

const pauseStore = {
  subscribe(cb: () => void) {
    window.addEventListener(PAUSE_EVT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(PAUSE_EVT, cb);
      window.removeEventListener("storage", cb);
    };
  },
  get() {
    try {
      return localStorage.getItem(PAUSE_KEY) === "1";
    } catch {
      return memPaused;
    }
  },
  set(paused: boolean) {
    memPaused = paused;
    try {
      if (paused) localStorage.setItem(PAUSE_KEY, "1");
      else localStorage.removeItem(PAUSE_KEY);
    } catch {}
    window.dispatchEvent(new Event(PAUSE_EVT));
  },
};

/** Credit line at the end of the strip — data providers by their display names. */
const PROVIDER: Record<string, string> = {
  binance: "Binance",
  upbit: "업비트",
  bithumb: "빗썸",
  ecb: "ECB",
  koreaexim: "한국수출입은행",
  treasury: "美 재무부",
};

export function Ticker() {
  const pulse = usePulse();
  const paused = useSyncExternalStore(pauseStore.subscribe, pauseStore.get, () => false);
  useEffect(() => startPulse(), []);
  const quotes = pulse?.quotes ?? [];
  const credits = [...new Set(quotes.map((q) => PROVIDER[q.src]).filter(Boolean))];
  const toggle = () => pauseStore.set(!paused);

  return (
    <div
      className="relative h-[var(--ticker-h)] overflow-hidden border-b border-line bg-bg"
      style={{ viewTransitionName: "site-ticker" }}
      aria-label="시장 지표"
      role="region"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent" />
      {quotes.length === 0 ? (
        <div className="flex h-full items-center gap-6 px-6" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="skeleton h-3 w-28 opacity-60" />
          ))}
        </div>
      ) : (
        <div
          className="animate-marquee flex h-full w-max items-center"
          data-paused={paused || undefined}
          style={{ ["--marquee-duration" as string]: `${quotes.length * 6}s` }}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 ? true : undefined}>
              {quotes.map((q) => (
                <li key={q.s} className="flex items-center gap-2 px-5 text-[12px]">
                  <span className="font-semibold text-fg-2">{q.n}</span>
                  <span className="tabular font-mono text-fg">{fmtPrice(q.p, q.cur, q.s)}</span>
                  <span className={`tabular font-mono ${q.c > 0 ? "text-up" : q.c < 0 ? "text-down" : "text-flat"}`}>{fmtChange(q.c)}</span>
                  <span className="ml-3 h-3 w-px bg-line-2" aria-hidden="true" />
                </li>
              ))}
              {credits.length > 0 && (
                <li className="px-5 text-[11px] text-fg-4">
                  시세 {credits.join(" · ")} · 지연될 수 있음
                  <span className="ml-3 inline-block h-3 w-px bg-line-2 align-middle" aria-hidden="true" />
                </li>
              )}
            </ul>
          ))}
        </div>
      )}
      {quotes.length > 0 && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={paused}
          aria-label={paused ? "시장 지표 재생" : "시장 지표 일시정지"}
          className="absolute right-1 top-1/2 z-20 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-bg text-fg-3 hover:text-fg"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor">
            {paused ? <path d="M2 1l7 4-7 4z" /> : <path d="M2 1h2v8H2zM6 1h2v8H6z" />}
          </svg>
        </button>
      )}
    </div>
  );
}
