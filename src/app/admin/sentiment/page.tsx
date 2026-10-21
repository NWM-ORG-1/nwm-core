import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSentimentAdmin } from "@/data/admin-ingest";
import { Ago } from "@/components/admin/feeds/time";
import { SentimentPublishSwitch } from "@/components/admin/ingest/IngestSwitches";
import { Badge, Card, cx, EmptyState, PageHeader, Stat, table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "센티먼트" };

const INPUT_LABEL: Record<string, string> = {
  funding_rate: "펀딩비",
  long_short_ratio: "롱숏 비율",
  oi_change_24h: "미결제약정 24h 변화",
  kimchi_premium: "김치 프리미엄",
  return_24h: "24h 수익률",
  volatility_24h: "변동성 (공포 방향)",
};

export default function SentimentAdminPage() {
  return (
    <Suspense fallback={<PageHeader kicker="SENTIMENT" title="센티먼트" />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const d = await getSentimentAdmin();
  const index = d.latest.find((r) => r.scopeKey === "index");
  const assets = d.latest.filter((r) => r.scopeKey.startsWith("asset:"));
  const comps = (index?.components ?? {}) as {
    social?: { raw: number; z: number; mature: boolean };
    market?: { z: number; mature: boolean; inputs?: Array<{ name: string; value: number; z: number; mature: boolean }> } | null;
    attention?: { z: number; volume: number } | null;
    Z?: number;
    coverage?: number;
    rawScore?: number;
    llmShare?: number;
  };
  const llmPosts = d.scoring.filter((s) => s.by !== "lexicon-v1" && s.by !== "대기").reduce((a, s) => a + s.n, 0);
  const allPosts = d.scoring.reduce((a, s) => a + s.n, 0);

  return (
    <>
      <PageHeader
        kicker="SENTIMENT · v1"
        title="센티먼트 인덱스"
        description={
          <>
            {d.public ? "공개 중 (베타)" : "그림자 운영 중 — 계산은 하지만 사이트에는 나가지 않습니다."} 출시 전 2주 이상 공포·탐욕 지수와 비교해 보고 공개하세요.{" "}
            <Link href="/sentiment/method" className="text-ice hover:underline" target="_blank">
              공개 산출 방법 ↗
            </Link>
          </>
        }
        actions={<SentimentPublishSwitch isPublic={d.public} />}
      />
      <div className="space-y-5 px-4 py-5 sm:px-6">
        {!index ? (
          <Card>
            <EmptyState title="아직 계산된 값이 없습니다">
              워커가 게시물을 분류하고(10분마다) 매시 5분에 지수를 계산합니다. 커뮤니티·텔레그램·X 소스가 24시간 동안 20건 이상 모아야 첫 값이 나옵니다.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label={index.shadow ? "인덱스 (그림자)" : "인덱스 (공개)"}
                value={index.score.toFixed(1)}
                sub={
                  <>
                    24h {index.change24h > 0 ? "+" : ""}
                    {index.change24h.toFixed(1)} · <Ago iso={index.at} /> 계산
                  </>
                }
              />
              <Stat label="신뢰도" value={`${Math.round((index.confidence ?? 0) * 100)}%`} tone={(index.confidence ?? 0) < 0.4 ? "warn" : undefined} sub={`게시물 ${index.volume}건 · 입력 범위 ${Math.round((comps.coverage ?? 0) * 100)}%`} />
              <Stat label="AI 분류 비중 (24h)" value={allPosts ? `${Math.round((llmPosts / allPosts) * 100)}%` : "—"} sub={d.llm.enabled ? `${d.llm.model} · 대기 ${d.queue}건` : "ANTHROPIC_API_KEY 없음 → 사전만 사용"} />
              <Stat label="AI 분류 비용 (이번 달)" value={`$${d.llm.usd.toFixed(2)}`} tone={d.llm.usd >= d.llm.budgetUsd ? "warn" : undefined} sub={`한도 $${d.llm.budgetUsd} (SENTIMENT_LLM_MONTHLY_USD)`} />
            </div>

            <Card title="14일 추이 — NWM 인덱스와 코인 공포·탐욕 지수">
              <CompareChart series={d.series} fearGreed={d.fearGreed} />
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="최신 값의 구성">
                <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-[13px]">
                  <dt className="text-fg-3">커뮤니티·소셜 (40%)</dt>
                  <dd className="tabular font-mono text-fg-2">
                    z {comps.social?.z ?? "—"} · raw {comps.social?.raw ?? "—"} {comps.social && !comps.social.mature && <Badge tone="warn">기준선 형성 중</Badge>}
                  </dd>
                  <dt className="text-fg-3">시장 지표 (45%)</dt>
                  <dd className="tabular font-mono text-fg-2">{comps.market ? `z ${comps.market.z}` : "없음 (선물·시세 수집 확인)"}</dd>
                  {comps.market?.inputs?.map((i) => (
                    <div key={i.name} className="contents">
                      <dt className="pl-3 text-[12px] text-fg-4">{INPUT_LABEL[i.name] ?? i.name}</dt>
                      <dd className="tabular font-mono text-[12px] text-fg-3">
                        {i.value} → z {i.z}
                        {!i.mature && " (기준값)"}
                      </dd>
                    </div>
                  ))}
                  <dt className="text-fg-3">관심도 (15%)</dt>
                  <dd className="tabular font-mono text-fg-2">{comps.attention ? `z ${comps.attention.z}` : "이력 24시간 미만"}</dd>
                  <dt className="text-fg-3">합계</dt>
                  <dd className="tabular font-mono text-fg-2">
                    Z {comps.Z} → {comps.rawScore} → 평활 {index.score}
                  </dd>
                </dl>
                <p className="mt-3 text-[12px] text-fg-4">
                  낙관 {index.bullish}% · 비관 {index.bearish}% · 키워드 {index.keywords.join(", ") || "—"}
                </p>
              </Card>
              <Card title="24시간 분류 결과">
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
                  {d.scoring
                    .sort((a, b) => b.n - a.n)
                    .map((s) => (
                      <li key={`${s.by}:${s.label}`} className="flex justify-between gap-2">
                        <span className="truncate text-fg-3">
                          {s.by === "lexicon-v1" ? "사전" : s.by === "대기" ? "대기" : "AI"} · {s.label}
                        </span>
                        <span className="tabular font-mono text-fg-2">{s.n}</span>
                      </li>
                    ))}
                </ul>
              </Card>
            </div>

            <Card title="종목별 (최신 시각)" pad={false}>
              <div className={table.wrap}>
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th className={table.th}>대상</th>
                      <th className={cx(table.th, "text-right")}>점수</th>
                      <th className={cx(table.th, "text-right")}>24h</th>
                      <th className={cx(table.th, "text-right")}>게시물</th>
                      <th className={cx(table.th, "text-right")}>신뢰도</th>
                      <th className={table.th}>키워드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.scopeKey} className={table.row}>
                        <td className={table.td}>{a.label}</td>
                        <td className={cx(table.td, "tabular text-right font-mono")}>{a.score.toFixed(1)}</td>
                        <td className={cx(table.td, "tabular text-right font-mono")}>{a.change24h.toFixed(1)}</td>
                        <td className={cx(table.td, "tabular text-right font-mono")}>{a.volume}</td>
                        <td className={cx(table.td, "tabular text-right font-mono")}>{Math.round((a.confidence ?? 0) * 100)}%</td>
                        <td className={cx(table.td, "text-[12px] text-fg-3")}>{a.keywords.slice(0, 4).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {assets.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-fg-3">24시간 동안 20건 이상 언급된 종목이 아직 없습니다.</p>}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

/** Two lines on one −100…100 axis: our index and alternative.me (rescaled from 0–100). */
function CompareChart({ series, fearGreed }: { series: Array<{ at: string; score: number }>; fearGreed: Array<{ at: string; value: number }> }) {
  const W = 720;
  const H = 160;
  const pad = 6;
  // the window ends at the newest point (render stays pure)
  const now = Math.max(0, ...series.map((p) => Date.parse(p.at)), ...fearGreed.map((p) => Date.parse(p.at)));
  const from = now - 14 * 86_400_000;
  const x = (iso: string) => pad + ((Date.parse(iso) - from) / (now - from)) * (W - 2 * pad);
  const y = (v: number) => pad + ((100 - v) / 200) * (H - 2 * pad);
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const ours = path(series.map((p) => [x(p.at), y(p.score)]));
  const fg = path(fearGreed.map((p) => [x(p.at), y((p.value - 50) * 2)]));
  const last = series[series.length - 1];
  const lastFg = fearGreed[fearGreed.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label={`최근 NWM 인덱스 ${last?.score ?? "없음"}, 공포·탐욕 지수 ${lastFg?.value ?? "없음"} (0–100)`}>
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeDasharray="3 4" />
        {fg && <path d={fg} fill="none" stroke="var(--warn)" strokeWidth={1.5} opacity={0.8} />}
        {ours && <path d={ours} fill="none" stroke="var(--ice)" strokeWidth={2} />}
        {/* the latest points, visible even while a series has a single reading */}
        {lastFg && <circle cx={x(lastFg.at)} cy={y((lastFg.value - 50) * 2)} r={3} fill="var(--warn)" />}
        {last && <circle cx={x(last.at)} cy={y(last.score)} r={3.5} fill="var(--ice)" />}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-[12px] text-fg-3">
        <span>
          <span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--ice)" }} />
          NWM 인덱스 {last ? last.score.toFixed(1) : "—"}
        </span>
        <span>
          <span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--warn)" }} />
          공포·탐욕 (alternative.me, 0–100을 −100…100으로) {lastFg ? lastFg.value : "—"}
        </span>
      </figcaption>
    </figure>
  );
}
