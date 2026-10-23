import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getIngestOverview } from "@/data/admin-ingest";
import { Ago, Until } from "@/components/admin/feeds/time";
import { IngestPauseButton } from "@/components/admin/ingest/IngestSwitches";
import { RunNowButton } from "@/components/admin/ingest/RunNowButton";
import { Badge, Card, cx, PageHeader, Stat, table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "수집 현황" };

const JOB_LABEL: Record<string, string> = {
  "sentiment.score": "게시물 분류 (10분)",
  "sentiment.index": "투자심리지수 계산 (매시 5분)",
  "market.derived": "김치 프리미엄 (10분)",
  retention: "보관 기한 정리 (매일 04:30)",
};

export default function IngestPage() {
  return (
    <Suspense fallback={<PageHeader kicker="INGEST" title="수집 현황" />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const o = await getIngestOverview();
  const workerOk = o.worker && o.worker.ageSec < 120;
  return (
    <>
      <PageHeader
        kicker="INGEST"
        title="수집 현황"
        description="워커가 소스를 언제, 얼마나 가져왔는지와 오류·키 누락·비용을 한눈에 봅니다. 소스 설정은 ‘소스’ 화면에서 바꿉니다."
        actions={<IngestPauseButton paused={o.paused} />}
      />
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="워커"
            value={o.worker ? (workerOk ? (o.paused ? "멈춤" : "정상") : "응답 없음") : "기록 없음"}
            tone={!o.worker || !workerOk ? "bad" : o.paused ? "warn" : undefined}
            sub={
              o.worker ? (
                <>
                  마지막 신호 <Ago iso={o.worker.at} /> · {o.worker.version} · 동시 {o.worker.running ?? 0}/{o.worker.concurrency ?? "?"}
                </>
              ) : (
                "npm run worker 또는 워커 서비스를 띄우세요"
              )
            }
          />
          <Stat label="수집 중 소스" value={o.counts.active} sub={`일시정지 ${o.counts.paused}`} />
          <Stat label="오류·재시도" value={o.counts.error} tone={o.counts.error ? "warn" : undefined} sub={o.counts.needsKey ? `키 필요 ${o.counts.needsKey}` : "키 누락 없음"} />
          <Stat label="24시간 새로 저장" value={o.counts.new24h.toLocaleString("ko-KR")} sub="인박스 항목·게시물·시세·지표" />
          <Stat
            label="이번 달 비용"
            value={`$${o.spend.llmUsd.toFixed(2)}`}
            tone={o.spend.llmUsd >= o.spend.llmBudgetUsd ? "warn" : undefined}
            sub={
              <>
                AI 분류 한도 ${o.spend.llmBudgetUsd}
                {o.spend.llmEnabled ? "" : " (키 없음 → 사전만 사용)"} · X 읽기 {o.spend.xPosts.toLocaleString("ko-KR")}건 ≈ ${(o.spend.xPosts * 0.005).toFixed(2)}
              </>
            }
          />
        </div>

        <Card title="소스별 상태" pad={false}>
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>소스</th>
                  <th className={table.th}>상태</th>
                  <th className={table.th}>마지막 성공</th>
                  <th className={table.th}>다음</th>
                  <th className={cx(table.th, "text-right")}>24h 실행</th>
                  <th className={cx(table.th, "text-right")}>24h 새로</th>
                  <th className={table.th}>최근 오류</th>
                  <th className={table.th}>
                    <span className="sr-only">동작</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {o.sources.map((s) => (
                  <tr key={s.id} className={table.row}>
                    <td className={table.td}>
                      <Link href={`/admin/sources/${s.id}`} className="font-semibold text-fg hover:text-ice">
                        {s.name}
                      </Link>
                      <span className="block font-mono text-[11px] text-fg-4">{s.adapterLabel}</span>
                    </td>
                    <td className={table.td}>
                      {s.status === "paused" ? (
                        <Badge>일시정지</Badge>
                      ) : s.needsKey ? (
                        <Badge tone="warn">키 필요</Badge>
                      ) : s.status === "error" ? (
                        <Badge tone="bad">오류</Badge>
                      ) : s.failCount ? (
                        <Badge tone="warn">재시도 {s.failCount}</Badge>
                      ) : (
                        <Badge tone="good">정상</Badge>
                      )}
                    </td>
                    <td className={table.td}>{s.lastSuccessAt ? <Ago iso={s.lastSuccessAt} /> : <span className="text-fg-4">없음</span>}</td>
                    <td className={table.td}>{s.status === "paused" ? "—" : <Until iso={s.nextRunAt} />}</td>
                    <td className={cx(table.td, "tabular text-right font-mono")}>
                      {s.runs24h}
                      {s.errors24h ? <span className="text-bad"> ({s.errors24h})</span> : null}
                    </td>
                    <td className={cx(table.td, "tabular text-right font-mono")}>{s.new24h}</td>
                    <td className={cx(table.td, "max-w-[340px]")}>
                      {s.lastError ? <span className="line-clamp-2 text-[12px] text-bad">{s.lastError}</span> : <span className="text-fg-4">—</span>}
                    </td>
                    <td className={table.td}>{s.status !== "paused" && <RunNowButton id={s.id} compact />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {o.sources.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px] text-fg-3">수집 소스가 없습니다. 워커를 처음 띄우면 기본 소스 목록이 추가됩니다 (npm run sources:sync).</p>
            )}
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="주기 작업">
            <ul className="space-y-2.5 text-[13px]">
              {Object.entries(JOB_LABEL).map(([job, label]) => {
                const j = o.jobs.find((x) => x.job === job);
                return (
                  <li key={job} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-fg-2">{label}</span>
                    {j ? (
                      <>
                        <Badge tone={j.outcome === "ok" ? "good" : "bad"}>{j.outcome === "ok" ? "성공" : "실패"}</Badge>
                        <span className="text-[12px] text-fg-3">
                          <Ago iso={j.at} />
                        </span>
                        <span className="w-full truncate text-[12px] text-fg-3" title={j.error ?? j.note ?? ""}>
                          {j.error ?? j.note}
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-fg-4">아직 실행 전</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="최근 24시간 오류">
            {o.recentErrors.length ? (
              <ul className="space-y-2 text-[12.5px]">
                {o.recentErrors.map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold text-fg-2">{e.source}</span>{" "}
                    <span className="text-fg-4">
                      · <Ago iso={e.at} />
                    </span>
                    <span className="block text-bad">{e.error}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">오류가 없습니다.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
