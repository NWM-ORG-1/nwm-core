import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSourcesAdmin } from "@/data/admin";
import { getExperimentOptions } from "@/data/admin-feeds";
import { Badge, btn, cx, LicenseIcons, PageHeader, TrustBadge } from "@/components/admin/ui";
import { ExperimentChip, Meter, Tile } from "@/components/admin/feeds/bits";
import { EXPERIMENT_STATUS_LABEL, EXPERIMENT_STATUS_TONE, formatInterval, isExperimentStatus, LANG_LABEL, rate, ratio } from "@/components/admin/feeds/labels";
import { SourceStatusToggle } from "@/components/admin/feeds/SourceStatusToggle";
import { Ago } from "@/components/admin/feeds/time";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { isBeat } from "@/lib/beats";
import { SOURCE_KIND_LABEL } from "@/lib/labels";
import type { SourceKind } from "@/db/schema";

export const metadata: Metadata = { title: "소스" };

type Source = Awaited<ReturnType<typeof getSourcesAdmin>>[number];

export default function SourcesPage() {
  return (
    <>
      <PageHeader
        kicker="INTAKE · SOURCES"
        title="소스"
        description="정보 피드를 공급하는 소스와 이용 조건을 관리합니다. 소스는 실험(가설)별로 묶여 있어 어떤 수집 전략이 실제 발행으로 이어지는지 비교할 수 있습니다."
        actions={
          <Link href="/admin/sources/new" className={cx(btn.base, btn.primary)}>
            ＋ 소스 추가
          </Link>
        }
      />
      <Suspense fallback={<SourcesSkeleton />}>
        <SourcesBody />
      </Suspense>
    </>
  );
}

async function SourcesBody() {
  const [sources, exps] = await Promise.all([getSourcesAdmin(), getExperimentOptions()]);

  const count = (s: string) => sources.filter((x) => x.status === s).length;
  const items24h = sources.reduce((a, s) => a + s.stats.items24h, 0);
  const items7d = sources.reduce((a, s) => a + s.stats.items7d, 0);
  const promoted7d = sources.reduce((a, s) => a + s.stats.promoted7d, 0);
  const unreviewed = sources.filter((s) => !s.license.reviewedAt).length;
  const signalOnly = sources.filter((s) => s.signalOnly).length;
  const errors = count("error");

  const groups = [
    ...exps.map((e) => ({ key: e.code, exp: e, rows: sources.filter((s) => s.experiment?.code === e.code) })),
    { key: "none", exp: null, rows: sources.filter((s) => !s.experiment || !exps.some((e) => e.code === s.experiment?.code)) },
  ];

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          label="등록 소스"
          value={sources.length}
          sub={
            <>
              수집중 {count("active")} · 일시정지 {count("paused")}
            </>
          }
        />
        <Tile label="수집 오류" value={errors} tone={errors ? "bad" : undefined} sub={errors ? "아래 목록에서 원인을 확인하세요" : "모든 소스 정상"} />
        <Tile label="24시간 수집" value={`${items24h.toLocaleString("ko-KR")}건`} sub={`7일 ${items7d.toLocaleString("ko-KR")}건`} />
        <Tile label="7일 승격률" value={rate(promoted7d, items7d)} sub={`${promoted7d}건 승격 / ${items7d}건 수집`} />
        <div className="max-md:col-span-2 [&>*]:h-full">
          <Tile
            label="라이선스 미검토"
            value={unreviewed}
            tone={unreviewed ? "warn" : undefined}
            sub={signalOnly ? `신호 전용 소스 ${signalOnly}개 별도` : "신호 전용 소스 없음"}
          />
        </div>
      </div>

      <aside className="flex gap-3 rounded-xl border border-line bg-bg-1/50 px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-fg-2" />
        <p>
          지금 보이는 소스는 1단계용 <strong className="font-semibold text-fg-2">모의 소스</strong>입니다. 2단계에서 수집 어댑터(DART·KOSIS·EDGAR·RSS 등)가 연결되면 어댑터
          레지스트리가 이 목록을 자동으로 채우고, 수집 상태와 마지막 오류도 실시간으로 갱신합니다. 직접 추가한 소스는 <span className="font-mono text-fg-2">manual</span> 어댑터로 등록됩니다.
        </p>
      </aside>

      {groups.map((g) =>
        g.exp || g.rows.length ? (
          <section key={g.key} id={g.exp ? `exp-${g.exp.code}` : "exp-none"} aria-labelledby={`h-${g.key}`} className="scroll-mt-6">
            <header className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
              {g.exp ? <ExperimentChip code={g.exp.code} colorSlot={g.exp.colorSlot} size="md" /> : <span className="kicker rounded-md border border-line-2 px-2 py-1 text-fg-3">미지정</span>}
              <h2 id={`h-${g.key}`} className="text-[15px] font-bold tracking-[-0.01em] text-fg">
                {g.exp ? g.exp.name : "가설에 연결되지 않은 소스"}
              </h2>
              {g.exp && isExperimentStatus(g.exp.status) && <Badge tone={EXPERIMENT_STATUS_TONE[g.exp.status]}>{EXPERIMENT_STATUS_LABEL[g.exp.status]}</Badge>}
              <p className="text-[12px] text-fg-3 sm:ml-auto">
                소스 <span className="tabular text-fg-2">{g.rows.length}</span> · 24시간{" "}
                <span className="tabular text-fg-2">{g.rows.reduce((a, s) => a + s.stats.items24h, 0)}</span>건 · 7일 승격률{" "}
                <span className="tabular text-fg-2">
                  {rate(
                    g.rows.reduce((a, s) => a + s.stats.promoted7d, 0),
                    g.rows.reduce((a, s) => a + s.stats.items7d, 0),
                  )}
                </span>
              </p>
              {g.exp && (
                <Link href={`/admin/experiments/${g.exp.id}`} className="text-[12px] font-medium text-fg-3 underline-offset-2 hover:text-fg hover:underline">
                  가설 보기
                </Link>
              )}
            </header>
            {g.rows.length ? (
              <SourceTable rows={g.rows} accent={g.exp ? `var(--c-${g.exp.colorSlot})` : "var(--fg-4)"} />
            ) : (
              <p className="panel px-4 py-5 text-[13px] text-fg-3">이 가설에 연결된 소스가 없습니다. 소스 편집 화면에서 가설을 지정하세요.</p>
            )}
          </section>
        ) : null,
      )}
    </div>
  );
}

const cell = "border-b border-line px-3 py-3 align-top xl:table-cell max-xl:border-0 max-xl:p-0";
const statCol = "max-xl:col-span-2 sm:max-xl:col-span-4 xl:text-right";
const label = "max-xl:before:mb-1 max-xl:before:block max-xl:before:text-[11.5px] max-xl:before:font-semibold max-xl:before:text-fg-3 max-xl:before:content-[attr(data-label)]";

function SourceTable({ rows, accent }: { rows: Source[]; accent: string }) {
  return (
    <div className="panel relative overflow-hidden" style={{ borderTop: `2px solid color-mix(in srgb, ${accent} 70%, transparent)` }}>
      <table className="w-full border-collapse text-left text-[13px] max-xl:block xl:table-fixed">
        <thead className="max-xl:hidden">
          <tr>
            {[
              ["소스", ""],
              ["수집", "w-[150px]"],
              ["주기 · 최근", "w-[112px]"],
              ["신뢰 · 이용 조건", "w-[214px]"],
              ["24시간", "w-[64px] text-right"],
              ["7일 승격률", "w-[92px] text-right"],
              ["7일 발행", "w-[68px] text-right"],
              ["", "w-[52px]"],
            ].map(([t, w], i) => (
              <th key={i} scope="col" className={cx("kicker whitespace-nowrap border-b border-line px-3 py-2.5 font-semibold text-fg-3", w)}>
                {t || <span className="sr-only">편집</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-xl:block">
          {rows.map((s) => {
            const promo = ratio(s.stats.promoted7d, s.stats.items7d);
            return (
              <tr
                key={s.id}
                className={cx(
                  "transition-colors max-xl:grid max-xl:grid-cols-6 max-xl:gap-x-4 max-xl:gap-y-3.5 max-xl:border-b max-xl:border-line max-xl:px-4 max-xl:py-4 max-xl:last:border-b-0 sm:max-xl:grid-cols-12",
                  s.status === "error" ? "bg-bad/[0.035]" : "hover:bg-bg-2/50",
                )}
              >
                <td className={cx(cell, "max-xl:col-span-6 sm:max-xl:col-span-12")}>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <Link href={`/admin/sources/${s.id}`} className="truncate text-[14px] font-semibold text-fg hover:text-ice-2">
                      {s.name}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-fg-4">{s.slug}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
                    <span className="font-medium text-fg-2">{SOURCE_KIND_LABEL[s.kind as SourceKind] ?? s.kind}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11.5px]">{s.adapter}</span>
                    <span aria-hidden="true">·</span>
                    <span>{LANG_LABEL[s.lang] ?? s.lang}</span>
                    {s.beats.filter(isBeat).map((b) => (
                      <BeatChip key={b} beat={b} />
                    ))}
                  </p>
                  {s.status === "error" && s.lastError && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-bad/10 px-2 py-1.5 text-[12px] leading-snug text-bad" role="note">
                      <Icon name="alert" size={13} className="mt-[2px] shrink-0" />
                      <span>
                        <span className="font-semibold">마지막 오류</span> · {s.lastError}
                      </span>
                    </p>
                  )}
                </td>
                <td className={cx(cell, label, "max-xl:col-span-3")} data-label="수집">
                  <SourceStatusToggle id={s.id} name={s.name} status={s.status as "active" | "paused" | "error"} />
                </td>
                <td className={cx(cell, label, "max-xl:col-span-3")} data-label="주기 · 최근 수집">
                  <p className="tabular text-[12.5px] text-fg-2">{formatInterval(s.pollIntervalSec)}마다</p>
                  <p className="mt-0.5 text-[11.5px] text-fg-3">
                    <Ago iso={s.lastFetchedAt} />
                  </p>
                </td>
                <td className={cx(cell, label, "max-xl:col-span-6")} data-label="신뢰 · 이용 조건">
                  <div className="flex flex-col items-start gap-1.5">
                    <TrustBadge tier={s.trustTier} />
                    <LicenseIcons
                      commercialOk={s.license.commercialOk}
                      redistributionOk={s.license.redistributionOk}
                      verbatimOk={s.license.verbatimOk}
                      reviewed={s.license.reviewedAt != null}
                      signalOnly={s.signalOnly}
                    />
                    {(s.license.attribution || s.license.retentionDays != null) && (
                      <p className="w-full text-[11.5px] leading-snug text-fg-3">
                        {s.license.attribution && (
                          <span className="block truncate" title={s.license.attribution}>
                            표기 “{s.license.attribution}”
                          </span>
                        )}
                        {s.license.retentionDays != null && <span className="block">원문 보관 {s.license.retentionDays}일</span>}
                      </p>
                    )}
                  </div>
                </td>
                <td className={cx(cell, label, statCol)} data-label="24시간 수집">
                  <span className="tabular font-mono text-[13px] text-fg">{s.stats.items24h}</span>
                </td>
                <td className={cx(cell, label, statCol)} data-label="7일 승격률">
                  <span className="tabular font-mono text-[13px] text-fg" title={`${s.stats.promoted7d}건 승격 / ${s.stats.items7d}건 수집`}>
                    {rate(s.stats.promoted7d, s.stats.items7d)}
                  </span>
                  <span className="mt-1.5 block w-full max-w-[120px] xl:ml-auto xl:w-14">
                    <Meter value={promo} label={`승격률 ${rate(s.stats.promoted7d, s.stats.items7d)}`} />
                  </span>
                  <span className="tabular mt-1 block font-mono text-[10.5px] text-fg-4">
                    {s.stats.promoted7d}/{s.stats.items7d}
                  </span>
                </td>
                <td className={cx(cell, label, statCol)} data-label="7일 발행 기여">
                  <span className="tabular font-mono text-[13px] text-fg">{s.stats.published7d}</span>
                  <span className="text-[11.5px] text-fg-3">건</span>
                </td>
                <td className={cx(cell, "max-xl:hidden xl:text-right")}>
                  <Link
                    href={`/admin/sources/${s.id}`}
                    aria-label={`${s.name} 편집`}
                    title="편집"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
                  >
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourcesSkeleton() {
  return (
    <div className="space-y-6 px-4 py-5 sm:px-6" aria-busy="true" aria-label="불러오는 중">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-[88px]" />
        ))}
      </div>
      <div className="skeleton h-14" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2.5">
          <div className="skeleton h-7 w-72" />
          <div className="skeleton h-40" />
        </div>
      ))}
    </div>
  );
}
