import Link from "next/link";
import { getDashboard } from "@/data/admin";
import { getDashboardClock, getRequestArticleIds } from "@/data/admin-dashboard";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/ui/LocalTime";
import { clockKST, compactKo, dateKST, ymdKST } from "@/lib/format";
import { DATA_TEMPLATES, type DataTemplateId } from "@/server/generator/data-templates";
import { Badge, Card, cx } from "../ui";
import { AiMixBar, ExperimentFunnels, Throughput, throughputSummary } from "./charts";
import { DataAutoPanel, type DataTemplateOption } from "./DashboardClient";
import { activityHref, activityKind, presentSummary } from "./labels";
import { CardTitle, Kpi, SubHead } from "./parts";

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

const DAY = 86_400_000;

/** Calendar days (KST) from `iso` to `nowMs` — 언론중재법 deadlines count days from receipt, not 24h periods. */
function kstDaysSince(iso: string, nowMs: number) {
  const day = (d: Date) => Date.parse(`${ymdKST(d)}T00:00:00Z`);
  return Math.max(0, Math.round((day(new Date(nowMs)) - day(new Date(iso))) / DAY));
}

export async function DashboardBody() {
  const [d, clock] = await Promise.all([getDashboard(), getDashboardClock()]);
  const requestIds = d.activity.filter((a) => a.entityType === "correction_request").map((a) => a.entityId);
  const requestArticles = requestIds.length ? await getRequestArticleIds(requestIds) : {};
  const templates: DataTemplateOption[] = (Object.keys(DATA_TEMPLATES) as DataTemplateId[]).map((id) => ({
    id,
    label: DATA_TEMPLATES[id].label,
    description: DATA_TEMPLATES[id].description,
    beat: DATA_TEMPLATES[id].beat,
  }));
  const k = d.kpis;
  const tp = throughputSummary(d.throughput, clock.hourStartMs);
  const namedPct = Math.floor(k.namedEditorPct * 1000) / 10;

  return (
    <div className="space-y-4 px-6 py-6">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-good" aria-hidden="true" />
        <span>
          {dateKST(new Date(clock.nowMs))} <span className="tabular font-mono">{clockKST(new Date(clock.nowMs))}</span> KST 기준
        </span>
        <span className="text-fg-4" aria-hidden="true">
          ·
        </span>
        <span>KPI는 최근 24시간, 비율·퍼널은 최근 7일</span>
      </p>

      {/* ── KPI row ── */}
      <section aria-label="핵심 지표" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="수집"
          code="24H"
          value={k.ingested24h.toLocaleString("ko-KR")}
          unit="건"
          tone={k.ingested24h === 0 ? "warn" : undefined}
          sub={k.ingested24h === 0 ? "수집 없음 · 소스 상태 확인" : "정보 피드 신규 항목"}
        />
        <Kpi
          label="후보 생성"
          code="24H"
          value={k.candidates24h.toLocaleString("ko-KR")}
          unit="건"
          sub="승격·기획·데이터 자동 포함"
        />
        <Kpi
          label="발행"
          code="24H"
          value={k.published24h.toLocaleString("ko-KR")}
          unit="건"
          tone={k.published24h === 0 ? "warn" : undefined}
          sub={k.published24h === 0 ? "24시간 동안 발행 없음" : `48시간 합계 ${tp.total}건`}
        />
        <Kpi
          label="오늘 조회"
          code="KST"
          value={k.viewsToday >= 10_000 ? compactKo(k.viewsToday) : k.viewsToday.toLocaleString("ko-KR")}
          sub="자정(KST) 이후 누적"
          title={`오늘(KST) 전체 기사 조회 ${k.viewsToday.toLocaleString("ko-KR")}회`}
        />
        <Kpi
          label="수집→발행 중앙값"
          code="7D"
          value={k.medianMinutesToPublish == null ? "—" : k.medianMinutesToPublish.toLocaleString("ko-KR")}
          unit={k.medianMinutesToPublish == null ? undefined : "분"}
          tone={k.medianMinutesToPublish != null && k.medianMinutesToPublish > 180 ? "warn" : undefined}
          sub={k.medianMinutesToPublish != null && k.medianMinutesToPublish > 180 ? "3시간 초과 · 병목 확인" : "첫 수집 시각부터 발행까지"}
          title="최근 7일 발행 기사의 원천 자료 첫 수집 → 발행 시간 중앙값"
        />
        <Kpi
          label="책임 편집자 명시율"
          code="7D"
          value={namedPct.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
          unit="%"
          tone={k.namedEditorPct < 1 ? "bad" : undefined}
          sub={k.namedEditorPct < 1 ? "AI 관여 기사에 편집자 미표기" : "AI 관여 기사 전원 표기"}
          title="AI 초안·AI 보조 기사는 검수한 편집자 이름을 반드시 표기해야 합니다"
        />
      </section>

      {/* ── mix + throughput | alerts ── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card
            title={<CardTitle code="7D">AI 라벨 비율</CardTitle>}
            actions={
              <span className="tabular text-[12px] text-fg-3">
                발행 <span className="font-mono text-fg-2">{Object.values(k.aiMix).reduce((a, b) => a + b, 0)}</span>건
              </span>
            }
          >
            <AiMixBar mix={k.aiMix} />
            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-fg-3">
              모든 공개 기사에는 독자용 AI 관여 라벨이 붙습니다. AI 초안·AI 보조 기사는 검수한 편집자 이름을 함께 표기합니다.
            </p>
          </Card>

          <Card
            title={<CardTitle code="48H">시간대별 발행</CardTitle>}
            actions={
              <span className="tabular text-right text-[12px] text-fg-3">
                합계 <span className="font-mono text-fg-2">{tp.total}</span>건
                {tp.peak && (
                  <>
                    <span className="mx-1.5 text-fg-4" aria-hidden="true">
                      ·
                    </span>
                    최다 {tp.peak.month}/{tp.peak.day} {String(tp.peak.hour).padStart(2, "0")}시{" "}
                    <span className="font-mono text-fg-2">{tp.max}</span>건
                  </>
                )}
              </span>
            }
          >
            <Throughput values={d.throughput} hourStartMs={clock.hourStartMs} />
            <p className="mt-2 text-[12px] text-fg-3">
              {tp.total === 0
                ? "최근 48시간 동안 발행된 기사가 없습니다."
                : `한 칸이 1시간(KST)입니다. 시간당 평균 ${(tp.total / d.throughput.length).toFixed(1)}건, 가장 오른쪽은 진행 중인 현재 시간대.`}
            </p>
          </Card>
        </div>

        <Alerts alerts={d.alerts} nowMs={clock.nowMs} />
      </div>

      {/* ── hypotheses ── */}
      <Card
        pad={false}
        title={<CardTitle code="7D">가설별 퍼널</CardTitle>}
        actions={
          <Link href="/admin/experiments" className="text-[12px] font-semibold text-fg-3 hover:text-fg">
            실험 관리 →
          </Link>
        }
      >
        <p className="border-b border-line px-4 py-2.5 text-[12px] leading-relaxed text-fg-3">
          H1–H4는 ‘어떤 소스 묶음이 더 빠르고 정확한 기사를 만드는가’를 검증하는 편집 가설입니다. 막대는 가설별 수집 건수를 100%로 둔 길이이며, 가설끼리는
          비율 지표로 비교합니다.
        </p>
        <ExperimentFunnels funnels={d.funnels} />
      </Card>

      {/* ── activity | data auto ── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="min-w-0 xl:col-span-2"
          pad={false}
          title={<CardTitle>최근 활동</CardTitle>}
          actions={
            <Link href="/admin/activity" className="text-[12px] font-semibold text-fg-3 hover:text-fg">
              활동 로그 전체 →
            </Link>
          }
        >
          <RecentActivity entries={d.activity} requestArticles={requestArticles} />
        </Card>

        <Card className="self-start" title={<CardTitle>데이터 자동 기사</CardTitle>} actions={<Badge tone="good">B · 자동</Badge>}>
          <p className="mb-3 text-[12.5px] leading-relaxed text-fg-3">
            시세·심리 데이터로 코드 템플릿이 기사를 씁니다. 숫자는 원천 데이터 그대로이며, 만든 뒤 후보 편집기에서 검토하고 발행합니다.
          </p>
          <DataAutoPanel templates={templates} />
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────────── alerts ───────────────────────────── */

function Alerts({ alerts, nowMs }: { alerts: DashboardData["alerts"]; nowMs: number }) {
  const errors = alerts.sources.filter((s) => s.kind === "error");
  const unlicensed = alerts.sources.filter((s) => s.kind === "unlicensed");
  const total = alerts.sources.length + alerts.requests.length + alerts.due.length;
  const row = "group -mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-2";

  return (
    <Card
      className="order-first min-w-0 self-start xl:order-last"
      pad={false}
      title={<CardTitle>경보</CardTitle>}
      actions={total > 0 ? <Badge tone="bad">처리 필요 {total}</Badge> : <Badge tone="good">정상</Badge>}
    >
      {total === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-8 text-[13px] text-fg-2">
          <span className="grid size-7 place-items-center rounded-full border border-good/40 text-good">
            <Icon name="check" size={14} />
          </span>
          처리할 경보가 없습니다.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {alerts.requests.length > 0 && (
            <section className="px-4 py-3">
              <SubHead count={alerts.requests.length} tone="bad">
                정정·반론 요청
              </SubHead>
              <ul>
                {alerts.requests.map((r) => {
                  const days = kstDaysSince(r.receivedAt, nowMs);
                  const left = 7 - days;
                  return (
                    <li key={r.id}>
                      <Link href={`/admin/articles/${r.articleId}`} className={row}>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-fg-2 group-hover:text-fg">{r.title}</span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-fg-3">
                            {r.requester} · {dateKST(r.receivedAt)} 접수 · <span className="tabular font-mono">D+{days}</span>
                          </span>
                        </span>
                        {left < 0 ? (
                          <Badge tone="bad" title={`게재 기한(접수 후 7일)을 ${-left}일 넘겼습니다`}>
                            법정 기한 경과
                          </Badge>
                        ) : days >= 5 ? (
                          <Badge tone="bad" title={left === 0 ? "오늘이 게재 기한(접수 후 7일)입니다" : `게재 기한까지 ${left}일`}>
                            법정 기한 임박 · {left === 0 ? "오늘" : `D-${left}`}
                          </Badge>
                        ) : (
                          <Badge tone="warn" title={days >= 3 ? "수용 여부 통지 기한(3일)이 지났습니다 — 통지했는지 확인하세요" : `게재 기한까지 ${left}일`}>
                            {`기한 D-${left}`}
                          </Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[11px] leading-snug text-fg-4">언론중재법 제15조 — 청구를 받은 날부터 3일 안에 수용 여부를 통지하고, 수용하면 7일 안에 정정보도를 게재합니다. D+n은 접수일 기준 경과 일수(KST).</p>
            </section>
          )}

          {alerts.due.length > 0 && (
            <section className="px-4 py-3">
              <SubHead count={alerts.due.length} tone="warn">
                60분 내 예약 발행
              </SubHead>
              <ul>
                {alerts.due.map((c) => {
                  const mins = Math.round((new Date(c.scheduledAt).getTime() - nowMs) / 60_000);
                  return (
                    <li key={c.id}>
                      <Link href={`/admin/candidates/${c.id}`} className={row}>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-fg-2 group-hover:text-fg">{c.title || "(제목 없음)"}</span>
                          <span className="tabular mt-0.5 block font-mono text-[11.5px] text-fg-3">{clockKST(c.scheduledAt)} KST 예약</span>
                        </span>
                        {mins < 0 ? (
                          <Badge tone="bad">{`지연 ${-mins}분`}</Badge>
                        ) : (
                          <Badge tone="ice">{mins === 0 ? "곧 발행" : `${mins}분 후`}</Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {errors.length > 0 && (
            <section className="px-4 py-3">
              <SubHead count={errors.length} tone="bad">
                수집 오류
              </SubHead>
              <ul>
                {errors.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/sources/${s.id}`} className={row}>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-fg-2 group-hover:text-fg">{s.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-3" title={s.message}>
                          {s.message}
                        </span>
                      </span>
                      <Badge tone="bad">오류</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {unlicensed.length > 0 && (
            <section className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <SubHead count={unlicensed.length} tone="warn">
                  라이선스 미검토 소스
                </SubHead>
                <Link href="/admin/sources" className="mb-1.5 text-[11.5px] font-semibold text-fg-3 hover:text-fg">
                  소스 관리 →
                </Link>
              </div>
              <ul>
                {unlicensed.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/sources/${s.id}`} className={row}>
                      <span className="min-w-0 truncate text-[13px] font-medium text-fg-2 group-hover:text-fg">{s.name}</span>
                      <Badge tone="warn" title="검토 전에는 이 소스의 자료로 발행할 수 없습니다">
                        발행 차단
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────────── recent activity ───────────────────────────── */

function RecentActivity({ entries, requestArticles }: { entries: DashboardData["activity"]; requestArticles: Record<string, string> }) {
  if (!entries.length) {
    return <p className="px-4 py-10 text-center text-[13px] text-fg-3">아직 기록된 활동이 없습니다.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {entries.map((e) => {
        const kind = activityKind(e.kind);
        const href = activityHref(e.entityType, e.entityId, requestArticles[e.entityId]);
        const body = <span className="line-clamp-2 sm:line-clamp-1">{presentSummary(e.kind, e.summary)}</span>;
        return (
          <li key={e.id} className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2.5 sm:grid-cols-[3.75rem_5.5rem_minmax(0,1fr)_auto]">
            <span className="tabular whitespace-nowrap text-[12px] text-fg-3">
              <LocalTime iso={e.at} />
            </span>
            <span className="hidden sm:block">
              <Badge tone={kind.tone}>{kind.label}</Badge>
            </span>
            <span className="min-w-0 text-[13px] leading-snug text-fg-2">
              {href ? (
                <Link href={href} className="block hover:text-fg hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
              <span className="mt-1 flex items-center gap-2 text-[11.5px] text-fg-3 sm:hidden">
                <Badge tone={kind.tone}>{kind.label}</Badge>
                {e.actor}
              </span>
            </span>
            <span className={cx("hidden whitespace-nowrap text-[12px] text-fg-3 sm:block")}>{e.actor}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────────── skeleton ───────────────────────────── */

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 px-6 py-6" aria-busy="true" aria-label="대시보드 불러오는 중">
      <div className="skeleton h-4 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-[104px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
        </div>
        <div className="skeleton h-72" />
      </div>
      <div className="skeleton h-80" />
    </div>
  );
}
