import Link from "next/link";
import type { AiInvolvement } from "@/db/schema";
import type { ExperimentFunnel } from "@/data/admin";
import { AI_LABEL } from "@/lib/labels";
import { Badge, Bars, ExperimentDot, cx } from "../ui";
import { EXPERIMENT_STATUS } from "./labels";

/* ───────────────────────────── helpers ───────────────────────────── */

/** Integer percentages that always sum to 100 (largest remainder). */
function sharesOf(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    if (values[i] > 0) {
      floor[i] += 1;
      rest -= 1;
    }
  }
  return floor;
}

export function ratio(n: number, d: number): string {
  if (!d) return "—";
  const p = (n / d) * 100;
  // Stages are windowed independently, so a numerator can include work that
  // started before the window. Never print an impossible conversion rate.
  if (p > 100) return "100%+";
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

export function minutes(m: number | null): string {
  return m == null ? "—" : `${m.toLocaleString("ko-KR")}분`;
}

const HOUR = 3_600_000;
function kst(ms: number) {
  const d = new Date(ms + 9 * HOUR);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}

/* ───────────────────────────── AI label mix ───────────────────────────── */

const AI_ORDER: AiInvolvement[] = ["auto", "ai_draft_edited", "ai_assisted", "human"];

/** One 100% stacked bar. Chart slots c-1..c-4 in fixed order; legend doubles as the table view. */
export function AiMixBar({ mix }: { mix: Record<AiInvolvement, number> }) {
  const values = AI_ORDER.map((k) => mix[k] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const shares = sharesOf(values);
  const segs = AI_ORDER.map((k, i) => ({
    key: k,
    label: AI_LABEL[k].short,
    explain: AI_LABEL[k].explain,
    n: values[i],
    pct: shares[i],
    color: `var(--c-${i + 1})`,
  }));
  const shown = segs.filter((s) => s.n > 0);
  const summary = segs.map((s) => `${s.label} ${s.n}건(${s.pct}%)`).join(", ");

  return (
    <div>
      {total === 0 ? (
        <div className="flex h-[52px] items-center rounded-lg border border-dashed border-line-2 px-4 text-[13px] text-fg-3">
          최근 7일 동안 발행된 기사가 없습니다.
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* direct labels — share of each segment, aligned to its start */}
          <div className="flex gap-[2px]" aria-hidden="true">
            {shown.map((s) => (
              <div key={s.key} className="min-w-[3px] whitespace-nowrap text-[11.5px] leading-none" style={{ flexGrow: s.n, flexBasis: 0 }}>
                {s.pct >= 8 && (
                  <>
                    {s.pct >= 18 && <span className="mr-1 hidden text-fg-3 sm:inline">{s.label}</span>}
                    <span className="tabular font-mono font-semibold text-fg">{s.pct}%</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex h-4 gap-[2px]" role="img" aria-label={`최근 7일 발행 ${total}건의 AI 관여 라벨 비율: ${summary}`}>
            {shown.map((s, i) => (
              <div
                key={s.key}
                className={cx(
                  "group relative min-w-[3px] transition-[filter] hover:brightness-110",
                  i === 0 && "rounded-l-[4px]",
                  i === shown.length - 1 && "rounded-r-[4px]",
                )}
                style={{ flexGrow: s.n, flexBasis: 0, background: s.color }}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "pointer-events-none absolute top-full z-10 mt-2 whitespace-nowrap rounded-md border border-line-2 bg-bg-2 px-2 py-1 text-[11.5px] text-fg opacity-0 shadow-[var(--shadow-pop)] transition-opacity group-hover:opacity-100",
                    i === 0 ? "left-0" : i === shown.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  {s.label}{" "}
                  <span className="tabular font-mono">
                    {s.n}건 · {s.pct}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" aria-label="범례">
        {segs.map((s) => (
          <li key={s.key} className="min-w-0" title={s.explain}>
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
              <span className="truncate">{s.label}</span>
            </p>
            <p className="tabular mt-0.5 pl-4 font-mono text-[12px] text-fg-3">
              <span className="text-fg-2">{s.n}</span>건 · {s.pct}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────────── 48h throughput ───────────────────────────── */

export function throughputSummary(values: number[], hourStartMs: number) {
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...values);
  const peakIndex = max > 0 ? values.lastIndexOf(max) : -1;
  const startOf = (i: number) => hourStartMs - (values.length - 1 - i) * HOUR;
  const peak = peakIndex >= 0 ? kst(startOf(peakIndex)) : null;
  return { total, max, peak, startOf };
}

/** Hourly publish counts (oldest → current hour) on the shared Bars primitive, with a KST time axis. */
export function Throughput({ values, hourStartMs }: { values: number[]; hourStartMs: number }) {
  const n = values.length;
  const { startOf } = throughputSummary(values, hourStartMs);
  const ticks = values.map((_, i) => ({ i, t: kst(startOf(i)) })).filter(({ t }) => t.hour % 6 === 0);
  const lastTick = ticks.at(-1)?.i ?? 0;

  return (
    <div>
      <div className="relative">
        {/* recessive gridline at half height */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-line" aria-hidden="true" />
        <Bars values={values} height={76} label="시간대별 발행 건수, 최근 48시간" />
      </div>
      <div className="relative h-6 border-t border-line-2" aria-hidden="true">
        {ticks.map(({ i, t }) => (
          <span key={i} className="absolute top-0 flex flex-col items-start" style={{ left: `${(i / n) * 100}%` }}>
            <span className={cx("h-1.5 w-px", t.hour === 0 ? "bg-line-3" : "bg-line-2")} />
            <span className={cx("tabular mt-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px]", t.hour === 0 ? "text-fg-2" : "text-fg-3")}>
              {t.hour === 0 ? `${t.month}/${t.day}` : `${String(t.hour).padStart(2, "0")}시`}
            </span>
          </span>
        ))}
        {lastTick < n - 4 && <span className="absolute right-0 top-2 font-mono text-[10.5px] text-fg-3">현재</span>}
      </div>
    </div>
  );
}

/* ───────────────────────────── experiment funnels ───────────────────────────── */

const STAGES = [
  { key: "items", label: "수집" },
  { key: "promoted", label: "승격" },
  { key: "candidates", label: "후보" },
  { key: "published", label: "발행" },
] as const;

/**
 * Small multiples: one row per hypothesis, each funnel on its own single axis —
 * that hypothesis's 수집 count is 100%. Stages are counted independently within
 * the window, so a later stage can exceed it (work on items collected earlier);
 * such a bar is drawn full with an axis break rather than silently rescaled.
 */
export function ExperimentFunnels({ funnels }: { funnels: ExperimentFunnel[] }) {
  if (!funnels.length) {
    return <p className="px-4 py-10 text-center text-[13px] text-fg-3">등록된 가설이 없습니다. 실험 화면에서 H1–H4를 만들고 소스를 배정하세요.</p>;
  }
  const broken = funnels.some((f) => f.items > 0 && Math.max(f.promoted, f.candidates, f.published) > f.items);
  return (
    <>
      <ul className="divide-y divide-line">
        {funnels.map((f) => {
          // No intake in the window: fall back to the largest stage so the bars stay readable.
          const axis = f.items > 0 ? f.items : Math.max(1, f.promoted, f.candidates, f.published);
          const st = EXPERIMENT_STATUS[f.status] ?? { label: f.status, tone: "neutral" as const };
          const metrics = [
            { label: "승격률", value: ratio(f.promoted, f.items), title: "승격 ÷ 수집" },
            { label: "발행률", value: ratio(f.published, f.candidates), title: "발행 ÷ 후보 (100%+는 기간 이전에 만든 후보의 발행 포함)" },
            { label: "완독률", value: ratio(f.reads, f.views), title: `완독 ${f.reads.toLocaleString("ko-KR")} ÷ 조회 ${f.views.toLocaleString("ko-KR")}` },
            { label: "정정", value: `${f.corrections}건`, title: "정정·보완이 붙은 기사 수 (누적)", warn: f.corrections > 0 },
            { label: "수집→발행", value: minutes(f.medianMinutesToPublish), title: "첫 수집부터 발행까지 걸린 시간의 중앙값" },
          ];
          return (
            <li
              key={f.id}
              className="grid gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,22rem)] xl:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ExperimentDot code={f.code} colorSlot={f.colorSlot} />
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <Link href="/admin/experiments" className="mt-1.5 block text-[13.5px] font-semibold leading-snug text-fg hover:underline">
                  {f.name}
                </Link>
                <p className="tabular mt-1 text-[12px] text-fg-3">소스 {f.sources}개 배정</p>
              </div>

              <dl className="min-w-0 space-y-1.5" aria-label={`${f.code} 퍼널: 수집 ${f.items}, 승격 ${f.promoted}, 후보 ${f.candidates}, 발행 ${f.published}`}>
                {STAGES.map((s) => {
                  const v = f[s.key];
                  const over = v > axis;
                  const color = `var(--c-${f.colorSlot})`;
                  return (
                    <div
                      key={s.key}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] items-center gap-2"
                      title={over ? `${s.label} ${v}건 — 수집 ${f.items}건 기준을 넘음 (7일 이전에 수집된 자료 포함)` : undefined}
                    >
                      <dt className="text-[11.5px] font-semibold text-fg-3">{s.label}</dt>
                      <dd className="relative h-2 rounded-r-[4px] bg-bg-2" aria-hidden="true">
                        {v > 0 &&
                          (over ? (
                            <>
                              {/* axis break: the value runs past this row's scale */}
                              <span className="absolute inset-y-0 left-0 right-[9px]" style={{ background: color }} />
                              <span className="absolute inset-y-0 right-0 w-[5px] rounded-r-[4px]" style={{ background: color }} />
                            </>
                          ) : (
                            <span
                              className="absolute inset-y-0 left-0 min-w-[2px] rounded-r-[4px]"
                              style={{ width: `${(v / axis) * 100}%`, background: color }}
                            />
                          ))}
                      </dd>
                      <dd className="tabular text-right font-mono text-[12px] text-fg-2">
                        {v.toLocaleString("ko-KR")}
                        {over && <span className="sr-only"> (수집 기준 초과)</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-5 md:col-span-2 xl:col-span-1">
                {metrics.map((m) => (
                  <div key={m.label} className="min-w-0" title={m.title}>
                    <dt className="truncate text-[11px] font-semibold text-fg-3">{m.label}</dt>
                    <dd className={cx("tabular mt-1 text-[15px] font-semibold leading-none", m.warn ? "text-warn" : "text-fg")}>{m.value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      {broken && (
        <p className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-fg-3">
          <span className="relative inline-block h-2 w-6 shrink-0" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 right-[9px] bg-fg-4" />
            <span className="absolute inset-y-0 right-0 w-[5px] rounded-r-[3px] bg-fg-4" />
          </span>
          끊긴 막대는 수집 기준(100%)을 넘은 단계입니다. 단계마다 최근 7일 건수를 따로 세므로, 그 전에 수집된 자료가 이번 기간에 발행되면 생깁니다.
        </p>
      )}
    </>
  );
}
