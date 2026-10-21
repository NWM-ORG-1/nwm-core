import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getExperimentsAdmin } from "@/data/admin";
import { Badge, btn, cx, EmptyState, PageHeader } from "@/components/admin/ui";
import { ExperimentChip, Meter } from "@/components/admin/feeds/bits";
import {
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_STATUS_TONE,
  formatMinutes,
  isExperimentStatus,
  isPrimaryMetric,
  PRIMARY_METRIC,
  ratio,
  type PrimaryMetric,
} from "@/components/admin/feeds/labels";
import { Icon } from "@/components/ui/Icon";
import { dateKST } from "@/lib/format";

export const metadata: Metadata = { title: "실험 · 가설" };

type Exp = Awaited<ReturnType<typeof getExperimentsAdmin>>[number];

export default function ExperimentsPage() {
  return (
    <>
      <PageHeader
        kicker="EXPERIMENTS · H1–H4"
        title="실험 · 가설"
        description="어떤 수집 전략이 실제로 읽히는 기사로 이어지는지 가설 단위로 비교합니다. 퍼널과 완독률은 최근 7일, 정정은 누적 기준입니다."
        actions={
          <Link href="/admin/experiments/new" className={cx(btn.base, btn.primary)}>
            ＋ 가설 추가
          </Link>
        }
      />
      <Suspense fallback={<ExperimentsSkeleton />}>
        <Body />
      </Suspense>
    </>
  );
}

/** Derived numbers for one experiment (null = not computable). */
function metrics(e: Exp) {
  const f = e.funnel;
  return {
    items: f?.items ?? 0,
    promoted: f?.promoted ?? 0,
    candidates: f?.candidates ?? 0,
    published: f?.published ?? 0,
    sources: f?.sources ?? 0,
    promoteRate: f ? ratio(f.promoted, f.items) : null,
    publishRate: f ? ratio(f.published, f.candidates) : null,
    readRate: f ? ratio(f.reads, f.views) : null,
    corrections: f?.corrections ?? 0,
    correctionRate: f ? ratio(f.corrections, f.published) : null,
    median: f?.medianMinutesToPublish ?? null,
    views: f?.views ?? 0,
    reads: f?.reads ?? 0,
  };
}

/** Window counts can make a step exceed the one before it (last week's candidate published this week). */
const pctText = (v: number | null) => (v == null ? "—" : v > 1 ? "100%+" : `${Math.round(v * 100)}%`);
const conv = (n: number, d: number) => pctText(ratio(n, d));

async function Body() {
  const exps = await getExperimentsAdmin();
  if (!exps.length) {
    return (
      <div className="px-4 py-5 sm:px-6">
        <div className="panel">
          <EmptyState title="아직 등록한 가설이 없습니다">
            <p>
              첫 가설을 등록하고 소스를 연결하면 수집 → 승격 → 발행 퍼널이 여기서 비교됩니다.{" "}
              <Link href="/admin/experiments/new" className="text-fg-2 underline underline-offset-2">
                가설 추가
              </Link>
            </p>
          </EmptyState>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-8 px-4 py-5 sm:px-6">
      <div className="grid gap-4 2xl:grid-cols-2">
        {exps.map((e) => (
          <ExperimentCard key={e.id} e={e} />
        ))}
      </div>
      <Comparison exps={exps} />
    </div>
  );
}

function ExperimentCard({ e }: { e: Exp }) {
  const m = metrics(e);
  const color = `var(--c-${e.colorSlot})`;
  const status = isExperimentStatus(e.status) ? e.status : "running";
  const primary: PrimaryMetric = isPrimaryMetric(e.primaryMetric) ? e.primaryMetric : "publish_rate";
  const max = Math.max(1, m.items, m.promoted, m.candidates, m.published);
  const steps = [
    { label: "수집 항목", n: m.items, conv: null as string | null, convTitle: "" },
    { label: "승격 항목", n: m.promoted, conv: conv(m.promoted, m.items), convTitle: "수집 대비 승격" },
    { label: "기사 후보", n: m.candidates, conv: conv(m.candidates, m.promoted), convTitle: "승격 항목 대비 후보 (묶음 승격은 1건)" },
    { label: "발행", n: m.published, conv: conv(m.published, m.candidates), convTitle: "후보 대비 발행 (이전 기간 후보 포함 시 100%+)" },
  ];
  const tiles: Array<{ key: PrimaryMetric | "corrections"; label: string; value: string; sub: string }> = [
    { key: "promote_rate", label: "승격률", value: pctText(m.promoteRate), sub: `${m.promoted}/${m.items}` },
    { key: "publish_rate", label: "발행률", value: pctText(m.publishRate), sub: `${m.published}/${m.candidates}` },
    { key: "read_rate", label: "완독률", value: pctText(m.readRate), sub: `${m.reads.toLocaleString("ko-KR")}/${m.views.toLocaleString("ko-KR")}` },
    { key: "correction_rate", label: "정정", value: `${m.corrections}건`, sub: "누적" },
    { key: "time_to_publish", label: "발행 소요", value: formatMinutes(m.median), sub: "중앙값" },
  ];
  return (
    <article
      aria-labelledby={`exp-${e.id}`}
      className="panel relative flex flex-col overflow-hidden"
      style={{ borderTop: `2px solid color-mix(in srgb, ${color} 75%, transparent)` }}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pt-4">
        <ExperimentChip code={e.code} colorSlot={e.colorSlot} size="md" />
        <div className="min-w-0 flex-1">
          <h2 id={`exp-${e.id}`} className="text-[16px] font-bold leading-snug tracking-[-0.01em] text-fg">
            {e.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
            <Badge tone={EXPERIMENT_STATUS_TONE[status]}>{EXPERIMENT_STATUS_LABEL[status]}</Badge>
            <span>
              주 지표 <span className="font-semibold text-fg-2">{PRIMARY_METRIC[primary].label}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{e.startedAt ? `${dateKST(e.startedAt)} 시작` : "시작 전"}</span>
            {e.endedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>{dateKST(e.endedAt)} 종료</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <Link href={`/admin/sources#exp-${e.code}`} className="underline-offset-2 hover:text-fg hover:underline">
              소스 {m.sources}개
            </Link>
          </p>
        </div>
        <Link href={`/admin/experiments/${e.id}`} className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12px]")} aria-label={`${e.code} 가설 편집`}>
          편집
        </Link>
      </header>

      <blockquote className="mx-5 mt-3.5 border-l-2 pl-3 text-[13.5px] leading-relaxed text-fg-2" style={{ borderColor: `color-mix(in srgb, ${color} 70%, transparent)` }}>
        {e.hypothesis || <span className="text-fg-4">가설 문장이 비어 있습니다.</span>}
      </blockquote>

      <div className="mt-4 grid gap-5 px-5 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="퍼널 (최근 7일)">
          <h3 className="kicker mb-2.5 flex items-center justify-between text-fg-3">
            퍼널 <span className="hud text-fg-4">7D</span>
          </h3>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.label} className="grid grid-cols-[64px_minmax(0,1fr)_40px_44px] items-center gap-2.5">
                <span className="text-[12px] text-fg-3">{s.label}</span>
                <span className="relative h-2.5 overflow-hidden rounded-[3px] bg-bg-3" aria-hidden="true">
                  {s.n > 0 && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-[3px]"
                      style={{ width: `${Math.max(1.5, (s.n / max) * 100)}%`, background: color, opacity: 1 - i * 0.14 }}
                    />
                  )}
                </span>
                <span className="tabular text-right font-mono text-[13px] font-semibold text-fg">{s.n}</span>
                <span className="tabular text-right font-mono text-[11px] text-fg-3" title={s.convTitle}>
                  {s.conv ? `${s.conv}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="결과 지표">
          <h3 className="kicker mb-2.5 text-fg-3">결과 지표</h3>
          <dl className="grid grid-cols-3 gap-1.5">
            {tiles.map((t) => {
              const isPrimary = t.key === primary;
              return (
                <div
                  key={t.key}
                  className={cx("rounded-lg px-2.5 py-2", isPrimary ? "bg-ice/[0.07] ring-1 ring-ice/40" : "bg-bg-2/60")}
                >
                  <dt className="flex items-center gap-1 text-[11.5px] text-fg-3">
                    {t.label}
                    {isPrimary && <span className="rounded bg-ice/15 px-1 text-[10px] font-bold text-fg-2">주</span>}
                  </dt>
                  <dd className="tabular mt-1 text-[16px] font-bold leading-none text-fg">{t.value}</dd>
                  <dd className="tabular mt-1 font-mono text-[10.5px] text-fg-4">{t.sub}</dd>
                </div>
              );
            })}
            <div className="flex items-center justify-center rounded-lg border border-dashed border-line-2 px-2 py-2 text-center">
              <Link
                href={`/admin/feeds?status=all&experiment=${e.code}`}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-fg-3 hover:text-fg"
              >
                인박스 <Icon name="arrowRight" size={12} />
              </Link>
            </div>
          </dl>
        </section>
      </div>

      {e.notes && (
        <p className="mt-auto border-t border-line px-5 py-3 text-[12px] leading-relaxed text-fg-3">
          <span className="font-semibold text-fg-2">메모 </span>
          <span className="line-clamp-2">{e.notes}</span>
        </p>
      )}
    </article>
  );
}

type Col = {
  key: string;
  label: string;
  title: string;
  better: "higher" | "lower" | null;
  value: (m: ReturnType<typeof metrics>) => number | null;
  fmt: (v: number | null, m: ReturnType<typeof metrics>) => string;
  bar?: boolean;
  metric?: PrimaryMetric;
};

const COLS: Col[] = [
  { key: "sources", label: "소스", title: "연결된 소스 수", better: null, value: (m) => m.sources, fmt: (v) => String(v ?? 0) },
  { key: "items", label: "수집", title: "최근 7일 수집 항목", better: null, value: (m) => m.items, fmt: (v) => String(v ?? 0) },
  { key: "promote", label: "승격률", title: "승격 항목 / 수집 항목", better: "higher", value: (m) => m.promoteRate, fmt: (v) => pctText(v), bar: true, metric: "promote_rate" },
  { key: "candidates", label: "후보", title: "최근 7일 생성된 후보", better: null, value: (m) => m.candidates, fmt: (v) => String(v ?? 0) },
  { key: "published", label: "발행", title: "최근 7일 발행", better: null, value: (m) => m.published, fmt: (v) => String(v ?? 0) },
  { key: "publish", label: "발행률", title: "발행 / 후보", better: "higher", value: (m) => m.publishRate, fmt: (v) => pctText(v), bar: true, metric: "publish_rate" },
  { key: "read", label: "완독률", title: "끝까지 읽음 / 조회", better: "higher", value: (m) => m.readRate, fmt: (v) => pctText(v), bar: true, metric: "read_rate" },
  { key: "corr", label: "정정", title: "정정이 붙은 기사 수 (누적)", better: "lower", value: (m) => m.corrections, fmt: (v) => `${v ?? 0}건`, metric: "correction_rate" },
  { key: "ttp", label: "발행 소요", title: "첫 수집 → 발행, 중앙값", better: "lower", value: (m) => m.median, fmt: (v) => formatMinutes(v), metric: "time_to_publish" },
];

function Comparison({ exps }: { exps: Exp[] }) {
  const rows = exps.map((e) => ({ e, m: metrics(e) }));
  const best = Object.fromEntries(
    COLS.filter((c) => c.better).map((c) => {
      // rates above 100% are window artefacts, not "better"
      const vals = rows.map((r) => c.value(r.m)).filter((v): v is number => v != null).map((v) => (c.bar ? Math.min(1, v) : v));
      if (vals.length < 2) return [c.key, null];
      const b = c.better === "higher" ? Math.max(...vals) : Math.min(...vals);
      // no winner when everyone ties
      return [c.key, vals.every((v) => v === b) ? null : b];
    }),
  ) as Record<string, number | null>;

  return (
    <section aria-labelledby="cmp-h">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 id="cmp-h" className="text-[15px] font-bold tracking-[-0.01em] text-fg">
            가설 비교
          </h2>
          <p className="mt-0.5 text-[12.5px] text-fg-3">
            같은 기준(최근 7일)으로 나란히 봅니다. 비율 막대는 모두 0–100% 한 축입니다. <span className="font-semibold text-fg-2">굵은 값</span>이 열에서 가장 좋은 값, 테두리 칸은 그 가설의 주
            지표입니다.
          </p>
        </div>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-[13px]">
          <caption className="sr-only">가설별 퍼널·결과 지표 비교 (최근 7일, 정정은 누적)</caption>
          <thead>
            <tr>
              <th scope="col" className="kicker sticky left-0 z-[1] whitespace-nowrap border-b border-line bg-bg-1 px-3 py-2.5 font-semibold text-fg-3">
                가설
              </th>
              <th scope="col" className="kicker whitespace-nowrap border-b border-line px-3 py-2.5 font-semibold text-fg-3">
                상태
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  title={c.title}
                  className={cx("kicker whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-semibold text-fg-3", c.bar && "w-[120px]")}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, m }) => {
              const status = isExperimentStatus(e.status) ? e.status : "running";
              const color = `var(--c-${e.colorSlot})`;
              return (
                <tr key={e.id} className="transition-colors hover:bg-bg-2/50">
                  <th scope="row" className="sticky left-0 z-[1] border-b border-line bg-bg-1 px-3 py-2.5 text-left font-normal">
                    <Link href={`/admin/experiments/${e.id}`} className="flex items-center gap-2 hover:text-fg">
                      <ExperimentChip code={e.code} colorSlot={e.colorSlot} />
                      <span className="max-w-[200px] truncate text-[12.5px] font-semibold text-fg-2" title={e.name}>
                        {e.name}
                      </span>
                    </Link>
                  </th>
                  <td className="border-b border-line px-3 py-2.5">
                    <Badge tone={EXPERIMENT_STATUS_TONE[status]}>{EXPERIMENT_STATUS_LABEL[status]}</Badge>
                  </td>
                  {COLS.map((c) => {
                    const v = c.value(m);
                    const cmp = v != null && c.bar ? Math.min(1, v) : v;
                    const isBest = best[c.key] != null && cmp === best[c.key];
                    const isPrimary = c.metric != null && c.metric === e.primaryMetric;
                    return (
                      <td key={c.key} className={cx("border-b border-line px-3 py-2.5 text-right align-middle", isPrimary && "bg-ice/[0.05] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ice)_35%,transparent)]")}>
                        <span className={cx("tabular font-mono text-[13px]", isBest ? "font-bold text-fg" : "text-fg-2")}>
                          {c.fmt(v, m)}
                          {isBest && <span className="sr-only"> (가장 좋음)</span>}
                          {isPrimary && <span className="sr-only"> (주 지표)</span>}
                        </span>
                        {c.bar && (
                          <span className="mt-1.5 block">
                            <Meter value={v} color={color} label={`${e.code} ${c.label} ${pctText(v)}`} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-fg-4">
        후보·발행은 각각 해당 기간에 생성·발행된 건수입니다. 이전 기간 후보가 이번 기간에 발행되면 비율이 100%를 넘어 ‘100%+’로 표시합니다. 색은 가설 구분용이며 항상
        코드와 함께 표시합니다.
      </p>
    </section>
  );
}

function ExperimentsSkeleton() {
  return (
    <div className="space-y-8 px-4 py-5 sm:px-6" aria-busy="true" aria-label="불러오는 중">
      <div className="grid gap-4 2xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[300px]" />
        ))}
      </div>
      <div className="skeleton h-64" />
    </div>
  );
}
