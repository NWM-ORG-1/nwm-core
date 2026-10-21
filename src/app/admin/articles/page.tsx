import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getArticlesAdmin } from "@/data/admin";
import { getArticlesSummary } from "@/data/admin-articles";
import { compactKo } from "@/lib/format";
import { isBeat } from "@/lib/beats";
import { btn, cx, EmptyState, PageHeader, TabLinks } from "@/components/admin/ui";
import { ArticleFilters } from "@/components/admin/articles/ArticleFilters";
import { ArticlesTable, TableSkeleton } from "@/components/admin/articles/ArticlesTable";
import { Tile } from "@/components/admin/articles/bits";
import { articlesHref, fmtRate, rate, requestClock, type ArticleFilterValues } from "@/components/admin/articles/labels";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "발행 기사" };

type SP = Record<string, string | string[] | undefined>;

/** getArticlesAdmin() returns at most this many rows (newest first). */
const LIST_LIMIT = 200;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function parse(sp: SP): ArticleFilterValues {
  const status = one(sp.status);
  const beat = one(sp.beat);
  const flag = one(sp.flag);
  const q = one(sp.q)?.slice(0, 80);
  return {
    status: status === "published" || status === "unpublished" ? status : undefined,
    beat: beat && isBeat(beat) ? beat : undefined,
    flag: flag === "requests" || flag === "corrected" ? flag : undefined,
    q: q || undefined,
  };
}

export default function ArticlesPage({ searchParams }: PageProps<"/admin/articles">) {
  return (
    <>
      <PageHeader
        kicker="PUBLISHING · ARTICLES"
        title="발행 기사"
        description="발행된 기사의 공개 상태와 독자 반응, 정정 이력을 관리합니다. 수정은 모두 버전으로 남고, 정정문은 기사 하단과 공개 정정 페이지에 함께 게시됩니다."
        actions={
          <>
            <a href="/corrections" target="_blank" rel="noreferrer" className={cx(btn.base, btn.ghost)}>
              공개 정정 페이지 <span aria-hidden="true">↗</span>
            </a>
            <Link href="/admin/candidates" className={cx(btn.base, btn.ghost)}>
              후보 보드 <Icon name="arrowRight" size={14} />
            </Link>
          </>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <ArticleList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ArticleList({ searchParams }: { searchParams: Promise<SP> }) {
  const values = parse(await searchParams);
  const [all, s] = await Promise.all([getArticlesAdmin({ status: values.status, beat: values.beat, q: values.q }), getArticlesSummary()]);
  const rows = values.flag === "requests" ? all.filter((a) => a.openRequests > 0) : values.flag === "corrected" ? all.filter((a) => a.corrections > 0) : all;

  const done = rate(s.reads7, s.views7);
  const next = rate(s.nexts7, s.views7);
  const oldest = s.oldestOpenAt ? requestClock(s.oldestOpenAt, s.now) : null;
  const keep = { beat: values.beat, q: values.q, flag: values.flag };
  const tabs = [
    { key: "all", label: "전체", count: s.published + s.unpublished, href: articlesHref(keep) },
    { key: "published", label: "공개", count: s.published, href: articlesHref({ ...keep, status: "published" }) },
    { key: "unpublished", label: "비공개", count: s.unpublished, href: articlesHref({ ...keep, status: "unpublished" }) },
  ];
  const filtered = Boolean(values.beat || values.q || values.flag);

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6">
      <section aria-label="요약" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="공개 기사" value={s.published.toLocaleString("ko-KR")} sub={`비공개 ${s.unpublished}건 · Top 지정 ${s.featuredNow}건`} />
        <Tile label="7일 조회" value={compactKo(s.views7)} sub="공개 기사 합계 · 최근 7일" />
        <Tile label="평균 완독률" value={fmtRate(done)} sub={`다음 기사 이동률 ${fmtRate(next)} · 조회 가중`} />
        <Link
          href={articlesHref({ flag: "requests" })}
          className="group rounded-[var(--radius)] focus-visible:outline-offset-4"
          aria-label={`미처리 정정 요청이 있는 기사 ${s.articlesWithOpen}건 — 목록 보기`}
        >
          <Tile
            className="h-full transition-colors group-hover:border-line-3"
            label="정정 요청 미처리 기사"
            value={`${s.articlesWithOpen}건`}
            tone={oldest ? (oldest.tone === "neutral" ? "warn" : oldest.tone) : undefined}
            sub={oldest ? `요청 ${s.openRequests}건 · 최장 ${oldest.elapsedDays}일 경과 →` : "처리할 요청이 없습니다"}
          />
        </Link>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabLinks tabs={tabs} active={values.status ?? "all"} />
        <p className="text-[12px] text-fg-3">
          <span className="tabular">{rows.length}</span>건 표시{all.length >= LIST_LIMIT ? ` (최근 ${LIST_LIMIT}건 안에서)` : ""} · 최근 발행순 · 조회·비율은 최근 7일
        </p>
      </div>

      <ArticleFilters values={values} />

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState title={filtered ? "조건에 맞는 기사가 없습니다" : values.status === "unpublished" ? "비공개 기사가 없습니다" : "발행된 기사가 없습니다"}>
            {filtered ? (
              <p>
                필터를 줄이거나{" "}
                <Link href={articlesHref({ status: values.status })} className="text-fg-2 underline underline-offset-2">
                  초기화
                </Link>
                해 보세요.
              </p>
            ) : (
              <p>후보 보드에서 검토를 마친 기사를 발행하면 여기에 쌓입니다.</p>
            )}
          </EmptyState>
        </div>
      ) : (
        <ArticlesTable rows={rows} now={s.now} />
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 px-4 py-5 sm:px-6" aria-busy="true" aria-label="불러오는 중">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[92px]" />
        ))}
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-8 w-20" />
        ))}
      </div>
      <div className="skeleton h-8 max-w-3xl" />
      <TableSkeleton />
    </div>
  );
}
