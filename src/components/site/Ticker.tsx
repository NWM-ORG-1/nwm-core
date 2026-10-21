"use client";

import { useEffect } from "react";
import { startPulse, usePulse } from "@/lib/client/pulse";
import { fmtChange, fmtPrice } from "@/lib/format";

/**
 * Market strip. Fixed height (no layout shift); values arrive from /api/pulse,
 * never from page HTML, so quotes changing never invalidates static pages.
 */
export function Ticker() {
  const pulse = usePulse();
  useEffect(() => startPulse(), []);
  const quotes = pulse?.quotes ?? [];

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
        <div className="animate-marquee flex h-full w-max items-center" style={{ ["--marquee-duration" as string]: `${quotes.length * 6}s` }}>
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
            </ul>
          ))}
        </div>
      )}
    </div>
  );
}
