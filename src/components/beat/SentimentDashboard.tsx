import Link from "next/link";
import { getSentimentDashboard } from "@/data/public";
import { compactKo } from "@/lib/format";
import { AI_DISCLOSURE, sentimentLabel } from "@/lib/labels";
import { ChartBlock } from "@/components/article/ChartBlock";
import { DivergingBar, Gauge } from "@/components/ui/Gauge";
import { Sparkline } from "@/components/ui/Sparkline";

/** Community investor sentiment — aggregate metrics only, never individual posts. */
export async function SentimentDashboard() {
  const { index, assets } = await getSentimentDashboard();
  if (!index) return null;
  const neutral = Math.max(0, 100 - index.bullish - index.bearish);
  return (
    <section aria-labelledby="dash-h" className="mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2.5">
        <h2 id="dash-h" className="text-[19px] font-bold tracking-[-0.02em] text-fg">
          NWM 투자심리지수
        </h2>
        <p className="text-[12px] text-fg-4">
          {index.live ? "국내 커뮤니티 · 텔레그램 · X 게시물과 시장 지표 · 1시간 단위 · 베타" : "샘플 데이터 · 커뮤니티 언급 집계 예시"} ·{" "}
          <Link href="/sentiment/method" className="underline decoration-line-2 underline-offset-2 hover:text-fg-2">
            산출 방법
          </Link>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="panel brackets flex flex-col items-center justify-center p-6">
          <Gauge score={index.score} size={240} />
          <p className={`tabular mt-1 font-mono text-[13px] ${index.change24h > 0 ? "text-up" : index.change24h < 0 ? "text-down" : "text-flat"}`}>
            24h {index.change24h > 0 ? "▲" : index.change24h < 0 ? "▼" : ""}
            {Math.abs(Math.round(index.change24h))} · 언급 {compactKo(index.volume)}건
          </p>
          <div className="mt-5 w-full">
            <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={`낙관 ${Math.round(index.bullish)}%, 중립 ${Math.round(neutral)}%, 비관 ${Math.round(index.bearish)}%`}>
              <span style={{ width: `${index.bullish}%`, background: "var(--up)" }} />
              <span style={{ width: `${neutral}%`, background: "var(--bg-3)" }} />
              <span style={{ width: `${index.bearish}%`, background: "var(--down)" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-fg-3">
              <span>낙관 {Math.round(index.bullish)}%</span>
              <span>비관 {Math.round(index.bearish)}%</span>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          <ChartBlock
            title="지수 24시간 추이"
            unit=""
            points={index.history.map((p) => p.score)}
            source={index.live ? `NWM 투자심리지수 v1${index.confidence !== null ? ` · 신뢰도 ${Math.round(index.confidence * 100)}%` : ""}` : "NWM 투자심리 집계 (샘플)"}
          />
          <div className="panel p-4">
            <p className="kicker mb-3 text-fg-3">소스별 심리</p>
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {index.sources.map((s) => (
                <li key={s.name} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-[13px]">
                  <span className="truncate text-fg-2">
                    {s.name} <span className="text-fg-4">{Math.round(s.share * 100)}%</span>
                  </span>
                  <DivergingBar score={s.score} />
                  <span className="tabular text-right font-mono text-fg-3">
                    {s.score > 0 ? "+" : ""}
                    {Math.round(s.score)}
                  </span>
                </li>
              ))}
            </ul>
            {index.keywords.length > 0 && (
              <p className="mt-4 flex flex-wrap gap-1.5">
                {index.keywords.map((k) => (
                  <span key={k} className="rounded-md bg-bg-2 px-2 py-0.5 text-[12px] text-fg-3">
                    #{k}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="panel mt-4 overflow-x-auto" data-noswipe>
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="kicker px-4 pb-1 pt-4 text-left text-fg-3">종목·자산별 커뮤니티 심리 (−100 공포 ~ +100 탐욕)</caption>
          <thead>
            <tr className="text-[11.5px] text-fg-4">
              <th className="px-4 py-2 text-left font-semibold">대상</th>
              <th className="px-4 py-2 text-right font-semibold">점수</th>
              <th className="hidden px-4 py-2 text-left font-semibold sm:table-cell">분포</th>
              <th className="px-4 py-2 text-right font-semibold">24h</th>
              <th className="hidden px-4 py-2 text-left font-semibold md:table-cell">24시간</th>
              <th className="hidden px-4 py-2 text-right font-semibold sm:table-cell">언급</th>
              <th className="hidden px-4 py-2 text-left font-semibold lg:table-cell">화제</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.scopeKey} className="border-t border-line">
                <td className="px-4 py-3 font-semibold text-fg">{a.label}</td>
                <td className="tabular px-4 py-3 text-right font-mono text-fg">
                  {Math.round(a.score)} <span className="ml-1 font-sans text-[11.5px] text-fg-3">{sentimentLabel(a.score)}</span>
                </td>
                <td className="hidden w-40 px-4 py-3 sm:table-cell">
                  <DivergingBar score={a.score} />
                </td>
                <td className={`tabular px-4 py-3 text-right font-mono ${a.change24h > 0 ? "text-up" : a.change24h < 0 ? "text-down" : "text-flat"}`}>
                  {a.change24h > 0 ? "▲" : a.change24h < 0 ? "▼" : ""}
                  {Math.abs(Math.round(a.change24h))}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <Sparkline points={a.history.map((p) => p.score)} width={110} height={26} label={`${a.label} 24시간 심리 추이`} />
                </td>
                <td className="tabular hidden px-4 py-3 text-right font-mono text-fg-3 sm:table-cell">{compactKo(a.volume)}</td>
                <td className="hidden px-4 py-3 text-[12px] text-fg-3 lg:table-cell">{a.keywords.slice(0, 3).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-4">
        게시물 원문·작성자는 저장하거나 공개하지 않고 집계 수치만 씁니다. {AI_DISCLOSURE ? "글의 낙관·비관 분류에는 AI(Claude)와 규칙 기반 사전을 함께 씁니다." : "글의 낙관·비관은 자동 분류와 규칙 기반 사전으로 판정합니다."} 이 지표는 투자 권유가 아닙니다.
      </p>
    </section>
  );
}
