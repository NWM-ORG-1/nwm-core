import Link from "next/link";
import type { getArticlesAdmin } from "@/data/admin";
import { compactKo, dateTimeKST, ymdKST } from "@/lib/format";
import { AI_LABEL } from "@/lib/labels";
import { Badge, btn, cx, table } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { AiLabel, BreakingBadge, SampleBadge, th } from "./bits";
import { fmtRate, rate, shortDateTime, untilLabel } from "./labels";

export type ArticleRow = Awaited<ReturnType<typeof getArticlesAdmin>>[number];

const num = "tabular whitespace-nowrap text-right font-mono text-[12.5px]";

function featuredLabel(until: string | null, now: number) {
  if (!until || new Date(until).getTime() <= now) return null;
  return untilLabel(until, now);
}

function Flags({ a, now }: { a: ArticleRow; now: number }) {
  const top = featuredLabel(a.featuredUntil, now);
  if (a.status === "published" && !a.isSample && !a.isBreaking && !top) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {a.status === "unpublished" && <Badge tone="warn">비공개</Badge>}
      {a.isBreaking && <BreakingBadge />}
      {top && (
        <Badge tone="ice" title={`홈 Top 지정 — ${dateTimeKST(a.featuredUntil!)}까지`}>
          Top · ~{top}
        </Badge>
      )}
      {a.isSample && <SampleBadge />}
    </span>
  );
}

function RowActions({ a, compact = false }: { a: ArticleRow; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {a.status === "published" ? (
        <a
          href={`/a/${a.slug}`}
          target="_blank"
          rel="noreferrer"
          className={cx(btn.base, btn.quiet, "h-7 px-2 text-[12.5px]")}
          aria-label={`독자 화면에서 보기: ${a.title} (새 탭)`}
        >
          보기 <span aria-hidden="true">↗</span>
        </a>
      ) : (
        !compact && (
          <span className="inline-flex h-7 items-center px-2 text-[12px] text-fg-4" title="비공개 기사는 독자 화면에 없습니다">
            보기 —
          </span>
        )
      )}
      <Link href={`/admin/articles/${a.id}`} className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12.5px]")} aria-label={`관리: ${a.title}`}>
        관리
      </Link>
    </span>
  );
}

function Metric({ label, value, tone = "text-fg-2" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt>{label}</dt>
      <dd className={cx("font-mono", tone)}>{value}</dd>
    </div>
  );
}

/** Dense table at md+, stacked list below. Server-rendered; no client JS. */
export function ArticlesTable({ rows, now }: { rows: ArticleRow[]; now: number }) {
  const year = ymdKST(new Date(now)).slice(0, 4);
  return (
    <>
      <div className={cx("panel hidden md:block", table.wrap)}>
        <table className={table.table}>
          <caption className="sr-only">발행 기사 목록 — 조회수와 비율은 최근 7일 기준</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                기사
              </th>
              <th scope="col" className={th}>
                비트 · 표기
              </th>
              <th scope="col" className={th}>
                발행 · 편집
              </th>
              <th scope="col" className={cx(th, "hidden text-right xl:table-cell")}>
                버전
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                7일 조회
              </th>
              <th scope="col" className={cx(th, "text-right")} title="완독 / 조회">
                완독률
              </th>
              <th scope="col" className={cx(th, "hidden text-right xl:table-cell")} title="다음 기사로 이동 / 조회">
                다음 이동률
              </th>
              <th scope="col" className={cx(th, "hidden text-right xl:table-cell")}>
                정정
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                요청
              </th>
              <th scope="col" className={th}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const done = rate(a.reads, a.views);
              const next = rate(a.nexts, a.views);
              const off = a.status === "unpublished";
              return (
                <tr key={a.id} className={cx(table.row, "group")}>
                  <td className={cx(table.td, "min-w-[240px] max-w-[460px]")}>
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className={cx("line-clamp-2 text-[13.5px] font-semibold leading-snug hover:text-ice-2", off ? "text-fg-3" : "text-fg")}
                    >
                      {a.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Flags a={a} now={now} />
                      <span className="font-mono text-[11px] text-fg-4">{a.slug}</span>
                      {a.storyTitle && (
                        <span className="max-w-[220px] truncate text-[11.5px] text-fg-3" title={`스토리 · ${a.storyTitle}`}>
                          스토리 · {a.storyTitle}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={table.td}>
                    <div className="flex flex-col items-start gap-1.5">
                      <BeatChip beat={a.beat} />
                      <AiLabel value={a.aiInvolvement} />
                    </div>
                  </td>
                  <td className={cx(table.td, "whitespace-nowrap")}>
                    <time dateTime={a.publishedAt} title={dateTimeKST(a.publishedAt)} className="tabular block font-mono text-[12px] text-fg-2">
                      {shortDateTime(a.publishedAt, year)}
                    </time>
                    <span className="mt-1 block text-[12px] text-fg-3">{a.editor ?? (a.aiInvolvement === "auto" ? "자동" : "—")}</span>
                  </td>
                  <td className={cx(table.td, num, "hidden text-fg-3 xl:table-cell")}>r{a.revision}</td>
                  <td className={cx(table.td, num, "text-fg")}>{a.views ? compactKo(a.views) : <span className="text-fg-4">0</span>}</td>
                  <td className={cx(table.td, num)}>{done == null ? <span className="text-fg-4">—</span> : fmtRate(done)}</td>
                  <td className={cx(table.td, num, "hidden xl:table-cell")}>{next == null ? <span className="text-fg-4">—</span> : fmtRate(next)}</td>
                  <td className={cx(table.td, num, "hidden xl:table-cell")}>
                    {a.corrections ? <span className="text-warn">{a.corrections}</span> : <span className="text-fg-4">—</span>}
                  </td>
                  <td className={cx(table.td, "text-right")}>
                    {a.openRequests ? (
                      <Badge tone="bad" title="미처리 정정·반론 요청">
                        <span className="tabular">{a.openRequests}건</span>
                      </Badge>
                    ) : (
                      <span className="font-mono text-[12.5px] text-fg-4">—</span>
                    )}
                  </td>
                  <td className={cx(table.td, "whitespace-nowrap text-right")}>
                    <RowActions a={a} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* below md: stacked rows */}
      <ul className="panel divide-y divide-line overflow-hidden md:hidden" aria-label="발행 기사 목록">
        {rows.map((a) => {
          const done = rate(a.reads, a.views);
          const next = rate(a.nexts, a.views);
          return (
            <li key={a.id} className="px-4 py-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <BeatChip beat={a.beat} />
                <span className="text-[11.5px] text-fg-3">{AI_LABEL[a.aiInvolvement].short}</span>
                <time dateTime={a.publishedAt} className="tabular font-mono text-[11.5px] text-fg-3">
                  {shortDateTime(a.publishedAt, year)}
                </time>
                {a.editor && <span className="text-[11.5px] text-fg-3">{a.editor}</span>}
              </div>
              <Link
                href={`/admin/articles/${a.id}`}
                className={cx("block text-[14.5px] font-semibold leading-snug", a.status === "unpublished" ? "text-fg-3" : "text-fg")}
              >
                {a.title}
              </Link>
              <div className="mt-2">
                <Flags a={a} now={now} />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <dl className="tabular flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
                  <Metric label="조회" value={compactKo(a.views)} />
                  <Metric label="완독" value={fmtRate(done)} />
                  <Metric label="다음" value={fmtRate(next)} />
                  <Metric label="버전" value={`r${a.revision}`} />
                  {a.corrections > 0 && <Metric label="정정" value={String(a.corrections)} tone="text-warn" />}
                  {a.openRequests > 0 && <Metric label="요청" value={`${a.openRequests}건`} tone="font-semibold text-bad" />}
                </dl>
                <RowActions a={a} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TableSkeleton() {
  return (
    <div className="panel overflow-hidden" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/3" />
          </div>
          <div className="skeleton hidden h-4 w-16 md:block" />
          <div className="skeleton hidden h-4 w-20 md:block" />
          <div className="skeleton hidden h-4 w-12 lg:block" />
          <div className="skeleton h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
