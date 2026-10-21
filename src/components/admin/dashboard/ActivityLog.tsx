import Link from "next/link";
import { getActivity } from "@/data/admin";
import { getActivityKindCounts, getDashboardClock, getRequestArticleIds } from "@/data/admin-dashboard";
import { clockKST, dateKST, dateTimeKST, ymdKST } from "@/lib/format";
import { Badge, EmptyState, TabLinks } from "../ui";
import { ACTIVITY_TAB_ORDER, activityHref, activityKind, ENTITY_LABEL } from "./labels";

type Entry = Awaited<ReturnType<typeof getActivity>>[number];

const LIMIT = 200;

export async function ActivityBody({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = typeof sp.kind === "string" ? sp.kind : undefined;
  const kind = raw && /^[a-z_]{1,32}$/.test(raw) ? raw : undefined;

  const [entries, counts, clock] = await Promise.all([getActivity({ kind }), getActivityKindCounts(), getDashboardClock()]);
  const requestIds = entries.filter((e) => e.entityType === "correction_request").map((e) => e.entityId);
  const requestArticles = requestIds.length ? await getRequestArticleIds(requestIds) : {};

  const ordered = [
    ...ACTIVITY_TAB_ORDER,
    ...Object.keys(counts.byKind)
      .filter((k) => !(ACTIVITY_TAB_ORDER as readonly string[]).includes(k))
      .sort(),
  ];
  if (kind && !ordered.includes(kind)) ordered.push(kind);
  const tabs = [
    { key: "all", href: "/admin/activity", label: "전체", count: counts.total },
    ...ordered.map((k) => ({ key: k, href: `/admin/activity?kind=${k}`, label: activityKind(k).label, count: counts.byKind[k] ?? 0 })),
  ];

  const today = ymdKST(new Date(clock.nowMs));
  const yesterday = ymdKST(new Date(clock.nowMs - 86_400_000));
  const days: Array<{ day: string; items: Entry[] }> = [];
  for (const e of entries) {
    const day = ymdKST(e.at);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  return (
    <div className="px-6 py-5">
      <div className="no-scrollbar -mx-6 overflow-x-auto px-6">
        <div className="w-max min-w-full lg:w-auto">
          <TabLinks tabs={tabs} active={kind ?? "all"} />
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="panel mt-5">
          <EmptyState title={kind ? `‘${activityKind(kind).label}’ 활동이 아직 없습니다` : "아직 기록된 활동이 없습니다"}>
            발행·승격·정정 같은 편집 결정은 실행되는 순간 여기에 기록됩니다.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {days.map((g) => (
            <section key={g.day} aria-labelledby={`day-${g.day}`} className="panel overflow-hidden">
              <h2 id={`day-${g.day}`} className="flex items-baseline gap-2 border-b border-line bg-bg-1/60 px-4 py-2.5">
                <span className="kicker text-fg-2">{dateKST(g.items[0].at)}</span>
                {g.day === today && <Badge tone="ice">오늘</Badge>}
                {g.day === yesterday && <Badge>어제</Badge>}
                <span className="tabular ml-auto font-mono text-[11.5px] text-fg-3">{g.items.length}건</span>
              </h2>
              <ol className="divide-y divide-line">
                {g.items.map((e) => (
                  <ActivityRow key={e.id} e={e} requestArticleId={requestArticles[e.entityId]} />
                ))}
              </ol>
            </section>
          ))}
          <p className="text-center text-[12px] text-fg-3">
            {entries.length >= LIMIT ? `최근 ${LIMIT}건까지 표시합니다. 이전 기록은 데이터베이스 activity_log에 보관됩니다.` : `총 ${entries.length}건 · 모든 기록을 표시했습니다.`}
          </p>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ e, requestArticleId }: { e: Entry; requestArticleId?: string }) {
  const k = activityKind(e.kind);
  const href = activityHref(e.entityType, e.entityId, requestArticleId);
  const entity = ENTITY_LABEL[e.entityType] ?? e.entityType;
  const shortId = /^[0-9a-f-]{36}$/i.test(e.entityId) ? e.entityId.slice(0, 8) : e.entityId;
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-bg-2/50 md:grid-cols-[3rem_6rem_minmax(0,1fr)_8.5rem_6rem] md:items-baseline">
      <time dateTime={e.at} title={dateTimeKST(e.at)} className="tabular font-mono text-[12px] text-fg-3">
        {clockKST(e.at)}
      </time>
      <span className="hidden md:block">
        <Badge tone={k.tone}>{k.label}</Badge>
      </span>
      <p className="min-w-0 text-[13px] leading-snug text-fg-2">
        {href ? (
          <Link href={href} className="hover:text-fg hover:underline">
            {e.summary}
          </Link>
        ) : (
          e.summary
        )}
      </p>
      <p className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3 md:col-start-auto md:block md:truncate">
        <span className="md:hidden">
          <Badge tone={k.tone}>{k.label}</Badge>
        </span>
        <span title={e.entityId}>
          {entity} <span className="font-mono text-fg-4">{shortId}</span>
        </span>
        <span className="md:hidden">· {e.actor}</span>
      </p>
      <span className="hidden truncate text-right text-[12px] text-fg-3 md:block">{e.actor}</span>
    </li>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-5 px-6 py-5" aria-busy="true" aria-label="활동 로그 불러오는 중">
      <div className="flex gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-8 w-16" />
        ))}
      </div>
      <div className="skeleton h-96" />
    </div>
  );
}
