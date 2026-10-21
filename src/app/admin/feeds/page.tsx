import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getInbox, type InboxFilters as Filters } from "@/data/admin";
import { btn, cx, EmptyState, PageHeader, TabLinks } from "@/components/admin/ui";
import { InboxFilters, type InboxFilterValues } from "@/components/admin/feeds/InboxFilters";
import { InboxTable } from "@/components/admin/feeds/InboxTable";
import { INBOX_STATUS_LABEL, inboxHref, type InboxStatus } from "@/components/admin/feeds/labels";
import { Icon } from "@/components/ui/Icon";
import { isBeat } from "@/lib/beats";

export const metadata: Metadata = { title: "피드 인박스" };

type SP = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function parse(sp: SP): { values: InboxFilterValues; filters: Filters; status: InboxStatus } {
  const rawStatus = one(sp.status);
  const status: InboxStatus = rawStatus === "promoted" || rawStatus === "dismissed" || rawStatus === "all" ? rawStatus : "new";
  const source = one(sp.source)?.slice(0, 64);
  const experiment = one(sp.experiment)?.toUpperCase();
  const beat = one(sp.beat);
  const minScoreRaw = Number(one(sp.minScore));
  const minScore = Number.isFinite(minScoreRaw) && minScoreRaw > 0 ? Math.min(100, Math.round(minScoreRaw)) : undefined;
  const q = one(sp.q)?.slice(0, 80);
  const values: InboxFilterValues = {
    status,
    source: source && /^[a-z0-9-]+$/.test(source) ? source : undefined,
    experiment: experiment && /^H\d{1,2}$/.test(experiment) ? experiment : undefined,
    beat: beat && isBeat(beat) ? beat : undefined,
    minScore: minScore ? String(minScore) : undefined,
    q: q || undefined,
  };
  return {
    values,
    status,
    filters: { status, source: values.source, experiment: values.experiment, beat: values.beat, minScore, q: values.q },
  };
}

export default function FeedsPage({ searchParams }: PageProps<"/admin/feeds">) {
  return (
    <>
      <PageHeader
        kicker="INTAKE · INBOX"
        title="피드 인박스"
        description="소스가 수집한 정보 항목을 훑어보고 기사 후보로 승격하거나 기각합니다. 여러 항목을 묶으면 첫 항목을 주 자료로 한 1건의 후보가 됩니다."
        actions={
          <>
            <Link href="/admin/sources" className={cx(btn.base, btn.ghost)}>
              소스 관리
            </Link>
            <Link href="/admin/candidates" className={cx(btn.base, btn.ghost)}>
              후보 보드 <Icon name="arrowRight" size={14} />
            </Link>
          </>
        }
      />
      <Suspense fallback={<InboxSkeleton />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const { values, filters, status } = parse(await searchParams);
  const data = await getInbox(filters);
  const total = (data.counts.new ?? 0) + (data.counts.promoted ?? 0) + (data.counts.dismissed ?? 0);
  const keep = { source: values.source, experiment: values.experiment, beat: values.beat, minScore: values.minScore, q: values.q };
  const tabs = (["new", "promoted", "dismissed", "all"] as const).map((k) => ({
    key: k,
    label: INBOX_STATUS_LABEL[k],
    count: k === "all" ? total : (data.counts[k] ?? 0),
    href: inboxHref(keep, { status: k === "new" ? undefined : k }),
  }));
  const filtered = Boolean(values.source || values.experiment || values.beat || values.minScore || values.q);

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabLinks tabs={tabs} active={status} />
        <p className="text-[12px] text-fg-3">탭 숫자는 필터와 무관한 전체 건수입니다.</p>
      </div>
      <InboxFilters values={values} sources={data.facets.sources} experiments={data.facets.experiments} />
      {data.items.length === 0 ? (
        <div className="panel">
          <EmptyState title={filtered ? "조건에 맞는 항목이 없습니다" : status === "new" ? "새로 들어온 항목이 없습니다" : "표시할 항목이 없습니다"}>
            {filtered ? (
              <p>
                필터를 줄이거나{" "}
                <Link href={inboxHref({}, { status: status === "new" ? undefined : status })} className="text-fg-2 underline underline-offset-2">
                  초기화
                </Link>
                해 보세요.
              </p>
            ) : status === "new" ? (
              <p>소스가 다음 수집 주기에 항목을 가져오면 여기에 쌓입니다. 수집이 멈춘 소스가 있는지 소스 화면에서 확인하세요.</p>
            ) : null}
          </EmptyState>
        </div>
      ) : (
        <InboxTable key={status} items={data.items} tab={status} />
      )}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="space-y-4 px-4 py-5 sm:px-6" aria-busy="true" aria-label="불러오는 중">
      <div className="flex gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-8 w-20" />
        ))}
      </div>
      <div className="skeleton h-8" />
      <div className="panel space-y-px overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4">
            <div className="skeleton size-4" />
            <div className="skeleton hidden h-4 w-16 lg:block" />
            <div className="skeleton hidden h-4 w-40 md:block" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
