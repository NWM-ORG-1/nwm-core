"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { compactKo } from "@/lib/format";
import { cx } from "@/components/admin/ui";
import { fmtDwell, fmtRate, rate, shortDay } from "./labels";

export interface DayStat {
  day: string;
  views: number;
  reads: number;
  nexts: number;
  dwellMs: number;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const weekday = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()];

/**
 * 14-day daily views, one series (ice). Each column is a hover/focus target;
 * the chart itself takes focus and ←/→ walk the days. A table view sits
 * underneath for readers who don't hover.
 */
export function DailyViews({ series }: { series: DayStat[] }) {
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const max = Math.max(0, ...series.map((d) => d.views));
  const total = series.reduce((a, d) => a + d.views, 0);
  const peak = series.findIndex((d) => d.views === max && max > 0);
  const last = series.length - 1;

  // Hidden by Activity → drop the transient hover state.
  useLayoutEffect(() => () => setActive(null), []);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r || !series.length) return;
    const i = Math.floor(((e.clientX - r.left) / r.width) * series.length);
    setActive(Math.max(0, Math.min(last, i)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setActive((h) => Math.min(last, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((h) => Math.max(0, (h ?? series.length) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const a = active != null ? series[active] : null;
  const H = 104;

  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-fg-2">일별 조회수</span>
        <span className="tabular text-[11.5px] text-fg-3">
          {series.length ? `${shortDay(series[0].day)}–${shortDay(series[last].day)}` : ""} · 합계 {total.toLocaleString("ko-KR")}
        </span>
      </figcaption>

      <div className="relative">
        {/* max gridline + label (recessive) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-line" aria-hidden="true" />
        <span className="tabular pointer-events-none absolute -top-[7px] right-0 bg-bg-1 pl-1 font-mono text-[10.5px] leading-none text-fg-4" aria-hidden="true">
          {max ? compactKo(max) : "0"}
        </span>

        <div
          ref={plotRef}
          tabIndex={0}
          role="group"
          aria-label={`일별 조회수 막대 차트, ${series.length}일. 좌우 화살표로 날짜를 이동합니다. 합계 ${total}, 최대 ${max}${peak >= 0 ? ` (${shortDay(series[peak].day)})` : ""}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="relative flex touch-none items-end gap-[2px] rounded-sm pt-2"
          style={{ height: H }}
        >
          {series.map((d, i) => {
            const h = max ? (d.views / max) * (H - 12) : 0;
            return (
              <div key={d.day} className="flex h-full flex-1 items-end justify-center" aria-hidden="true">
                <div
                  className={cx(
                    "w-full max-w-[24px] rounded-t-[4px] transition-colors",
                    d.views ? (active === i ? "bg-ice" : active == null && i === last ? "bg-ice/90" : "bg-ice/55") : "bg-fg-4/40",
                  )}
                  style={{ height: d.views ? Math.max(3, h) : 2 }}
                />
              </div>
            );
          })}
        </div>
        <div className="border-t border-line-2" aria-hidden="true" />

        {a && active != null && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-[calc(100%+6px)] z-10 w-max min-w-[132px] -translate-x-1/2 rounded-lg border border-line-2 bg-bg-1 px-2.5 py-2 text-[12px] shadow-[var(--shadow-pop)]"
            style={{ left: `clamp(66px, ${((active + 0.5) / series.length) * 100}%, calc(100% - 66px))` }}
          >
            <p className="tabular text-[11px] text-fg-3">
              {shortDay(a.day)} ({weekday(a.day)}){active === last ? " · 오늘" : ""}
            </p>
            <p className="tabular mt-0.5 text-[15px] font-bold text-fg">
              {a.views.toLocaleString("ko-KR")}
              <span className="ml-1 text-[11px] font-normal text-fg-3">조회</span>
            </p>
            <p className="tabular mt-0.5 text-[11.5px] text-fg-2">
              완독 {a.reads.toLocaleString("ko-KR")} <span className="text-fg-3">· {fmtRate(rate(a.reads, a.views))}</span>
            </p>
            <p className="tabular text-[11.5px] text-fg-2">
              다음 이동 {a.nexts.toLocaleString("ko-KR")} <span className="text-fg-3">· {fmtRate(rate(a.nexts, a.views))}</span>
            </p>
          </div>
        )}
      </div>

      <div className="tabular mt-1.5 flex justify-between font-mono text-[10.5px] text-fg-4" aria-hidden="true">
        <span>{series.length ? shortDay(series[0].day) : ""}</span>
        <span>{series.length > 7 ? shortDay(series[Math.floor(last / 2)].day) : ""}</span>
        <span>오늘</span>
      </div>

      <details className="group mt-3">
        <summary className="kicker inline-flex cursor-pointer list-none items-center gap-1 rounded text-fg-3 hover:text-fg-2">
          <span className="transition-transform group-open:rotate-90" aria-hidden="true">
            ›
          </span>
          표로 보기
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="text-fg-3">
                <th scope="col" className="kicker px-2.5 py-1.5 text-left font-semibold">
                  날짜
                </th>
                <th scope="col" className="kicker px-2.5 py-1.5 text-right font-semibold">
                  조회
                </th>
                <th scope="col" className="kicker px-2.5 py-1.5 text-right font-semibold">
                  완독
                </th>
                <th scope="col" className="kicker px-2.5 py-1.5 text-right font-semibold">
                  다음
                </th>
                <th scope="col" className="kicker px-2.5 py-1.5 text-right font-semibold">
                  체류
                </th>
              </tr>
            </thead>
            <tbody className="tabular font-mono text-fg-2">
              {[...series].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="px-2.5 py-1.5 text-fg-3">
                    {shortDay(d.day)} <span className="font-sans">{weekday(d.day)}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right">{d.views.toLocaleString("ko-KR")}</td>
                  <td className="px-2.5 py-1.5 text-right">{d.reads.toLocaleString("ko-KR")}</td>
                  <td className="px-2.5 py-1.5 text-right">{d.nexts.toLocaleString("ko-KR")}</td>
                  <td className="px-2.5 py-1.5 text-right font-sans">{fmtDwell(d.reads ? d.dwellMs / d.reads : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
