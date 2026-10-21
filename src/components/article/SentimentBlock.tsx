import type { SentimentSnapshot } from "@/lib/content/blocks";
import { sentimentLabel } from "@/lib/labels";
import { compactKo } from "@/lib/format";
import { DivergingBar } from "@/components/ui/Gauge";

/** Crowd sentiment snapshot at publication time (aggregate metrics only). */
export function SentimentBlock({ s, title = "투자자 심리" }: { s: SentimentSnapshot; title?: string }) {
  const neutral = Math.max(0, 100 - s.bullish - s.bearish);
  return (
    <section className="panel brackets p-4" aria-label={title} data-noswipe>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker text-fg-3">{title} · 발행 시점</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="tabular text-[30px] font-bold leading-none tracking-[-0.03em] text-fg">{Math.round(s.score)}</span>
            <span className="text-[13px] font-semibold text-fg-2">{sentimentLabel(s.score)}</span>
            <span className={`tabular font-mono text-[12px] ${s.change24h > 0 ? "text-up" : s.change24h < 0 ? "text-down" : "text-flat"}`}>
              24h {s.change24h > 0 ? "▲" : s.change24h < 0 ? "▼" : ""}
              {Math.abs(Math.round(s.change24h))}
            </span>
          </p>
        </div>
        <p className="text-[12px] text-fg-3">언급 {compactKo(s.volume)}건</p>
      </div>
      <div className="mt-4">
        <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={`낙관 ${s.bullish}%, 중립 ${neutral}%, 비관 ${s.bearish}%`}>
          <span style={{ width: `${s.bullish}%`, background: "var(--up)" }} />
          <span style={{ width: `${neutral}%`, background: "var(--bg-3)" }} />
          <span style={{ width: `${s.bearish}%`, background: "var(--down)" }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-fg-3">
          <span>낙관 {s.bullish}%</span>
          <span>비관 {s.bearish}%</span>
        </div>
      </div>
      {s.sources.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {s.sources.map((src) => (
            <li key={src.name} className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-[12px]">
              <span className="truncate text-fg-2">
                {src.name} <span className="text-fg-4">{Math.round(src.share * 100)}%</span>
              </span>
              <DivergingBar score={src.score} />
              <span className="tabular text-right font-mono text-fg-3">{src.score > 0 ? "+" : ""}{Math.round(src.score)}</span>
            </li>
          ))}
        </ul>
      )}
      {s.keywords && s.keywords.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {s.keywords.map((k) => (
            <span key={k} className="rounded-md bg-bg-2 px-2 py-0.5 text-[11.5px] text-fg-3">
              #{k}
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 text-[11px] text-fg-4">커뮤니티·소셜 언급을 집계한 지표입니다. 개별 게시물은 인용하지 않습니다.</p>
    </section>
  );
}
