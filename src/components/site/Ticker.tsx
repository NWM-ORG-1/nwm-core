"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Pulse } from "@/data/dto";
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

type Quote = Pulse["quotes"][number];

/** A list shorter than this sits still in one row; only a strip long enough to loop scrolls. */
const MIN_SCROLL = 5;

function QuoteBody({ q }: { q: Quote }) {
  return (
    <>
      <span className="font-semibold text-fg-2">{q.n}</span>
      <span className="tabular font-mono text-fg">{fmtPrice(q.p, q.cur, q.s)}</span>
      <span className={`tabular font-mono ${q.c > 0 ? "text-up" : q.c < 0 ? "text-down" : "text-flat"}`}>{fmtChange(q.c)}</span>
    </>
  );
}

/** Quotes only — the providers and the delay notice are in the footer (MarketCredit). */
export function Ticker() {
  const pulse = usePulse();
  const paused = useSyncExternalStore(pauseStore.subscribe, pauseStore.get, () => false);
  useEffect(() => startPulse(), []);
  const quotes = pulse?.quotes ?? [];
  const scroll = quotes.length >= MIN_SCROLL;
  const toggle = () => pauseStore.set(!paused);

  return (
    <div
      className="relative h-[var(--ticker-h)] overflow-hidden border-b border-line bg-bg"
      style={{ viewTransitionName: "site-ticker" }}
      aria-label="시장 지표"
      role="region"
    >
      {scroll && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent" />
        </>
      )}
      {pulse == null ? (
        <div className="flex h-full items-center gap-6 px-6" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="skeleton h-3 w-28 opacity-60" />
          ))}
        </div>
      ) : quotes.length === 0 ? null : scroll ? (
        <div
          className="animate-marquee flex h-full w-max items-center"
          data-paused={paused || undefined}
          style={{ ["--marquee-duration" as string]: `${quotes.length * 6}s` }}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 ? true : undefined}>
              {quotes.map((q) => (
                <li key={q.s} className="flex items-center gap-2 px-5 text-[12px]">
                  <QuoteBody q={q} />
                  <span className="ml-3 h-3 w-px bg-line-2" aria-hidden="true" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      ) : (
        <ul className="no-scrollbar mx-auto flex h-full max-w-[1320px] items-center gap-5 overflow-x-auto px-4 sm:px-6">
          {quotes.map((q, i) => (
            <li key={q.s} className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[12px]">
              {i > 0 && <span className="mr-3 h-3 w-px bg-line-2" aria-hidden="true" />}
              <QuoteBody q={q} />
            </li>
          ))}
        </ul>
      )}
      {scroll && (
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
