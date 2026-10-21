import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { getActivityKindCounts, getActivityPage, getDashboardClock, getRequestArticleIds, type ActivityEntry } from "@/data/admin-dashboard";
import { clockKST, dateKST, dateTimeKST, ymdKST } from "@/lib/format";
import { Badge, btn, cx, EmptyState } from "../ui";
import { ScrollActiveIntoView } from "./DashboardClient";
import { ACTIVITY_TAB_ORDER, activityHref, activityKind, ENTITY_LABEL, presentSummary } from "./labels";

const PAGE = 200;

function activityUrl(kind?: string, before?: number) {
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (before != null) q.set("before", String(before));
  const s = q.toString();
  return s ? `/admin/activity?${s}` : "/admin/activity";
}

export async function ActivityBody({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawKind = typeof sp.kind === "string" ? sp.kind : undefined;
  const kind = rawKind && /^[a-z_]{1,32}$/.test(rawKind) ? rawKind : undefined;
  const rawBefore = typeof sp.before === "string" ? sp.before : undefined;
  const before = rawBefore && /^\d{1,15}$/.test(rawBefore) ? Number(rawBefore) : undefined;

  const [{ entries, hasMore }, counts, clock] = await Promise.all([
    getActivityPage({ kind, before, limit: PAGE }),
    getActivityKindCounts(),
    getDashboardClock(),
  ]);
  const requestIds = entries.filter((e) => e.entityType === "correction_request").map((e) => e.entityId);
  const requestArticles = requestIds.length ? await getRequestArticleIds(requestIds) : {};

  const ordered: string[] = [
    ...ACTIVITY_TAB_ORDER,
    ...Object.keys(counts.byKind)
      .filter((k) => !(ACTIVITY_TAB_ORDER as readonly string[]).includes(k))
      .sort(),
  ];
  if (kind && !ordered.includes(kind)) ordered.push(kind);
  const tabs = [
    { key: "all", href: activityUrl(), label: "전체", count: counts.total },
    ...ordered.map((k) => ({ key: k, href: activityUrl(k), label: activityKind(k).label, count: counts.byKind[k] ?? 0 })),
  ];
  const active = kind ?? "all";

  const today = ymdKST(new Date(clock.nowMs));
  const yesterday = ymdKST(new Date(clock.nowMs - 86_400_000));
  const days: Array<{ day: string; items: ActivityEntry[] }> = [];
  for (const e of entries) {
    const day = ymdKST(e.at);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }
  const label = kind ? `‘${activityKind(kind).label}’ ` : "";

  return (
    <div className="px-6 py-5">
      <ScrollActiveIntoView activeKey={active} className="no-scrollbar -mx-6 overflow-x-auto px-6 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)] lg:[mask-image:none]">
        <nav aria-label="활동 종류" className="flex w-max min-w-full gap-1 lg:w-auto lg:flex-wrap">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  on ? "bg-bg-3 text-fg" : t.count ? "text-fg-3 hover:bg-bg-2 hover:text-fg" : "text-fg-4 hover:bg-bg-2 hover:text-fg-2",
                )}
              >
                {t.label}
                <span className={cx("tabular font-mono text-[11px]", t.count ? "text-fg-3" : "text-fg-4")}>{t.count.toLocaleString("ko-KR")}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollActiveIntoView>

      {before != null && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-2 bg-bg-1/60 px-3.5 py-2 text-[12.5px] text-fg-3">
          <span>{label}이전 기록을 보고 있습니다.</span>
          <Link href={activityUrl(kind)} className="inline-flex items-center gap-1 font-semibold text-fg-2 hover:text-fg">
            <Icon name="arrowLeft" size={13} />
            최신 기록으로
          </Link>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="panel mt-5">
          <EmptyState title={before != null ? `더 이전의 ${label}기록이 없습니다` : `${label}활동이 아직 없습니다`}>
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
          <div className="flex flex-col items-center gap-3 pt-1 text-center">
            {hasMore ? (
              <>
                <Link href={activityUrl(kind, entries.at(-1)!.id)} className={cx(btn.base, btn.ghost)}>
                  이전 기록 더 보기
                  <Icon name="chevronDown" size={14} />
                </Link>
                <p className="tabular text-[12px] text-fg-3">
                  {entries.length}건 표시 · {dateKST(entries.at(-1)!.at)} {clockKST(entries.at(-1)!.at)} 이전 기록이 더 있습니다
                </p>
              </>
            ) : (
              <p className="tabular text-[12px] text-fg-3">
                {before != null ? `${entries.length}건 표시 · 가장 오래된 기록까지 확인했습니다.` : `총 ${entries.length}건 · 모든 기록을 표시했습니다.`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ e, requestArticleId }: { e: ActivityEntry; requestArticleId?: string }) {
  const k = activityKind(e.kind);
  const href = activityHref(e.entityType, e.entityId, requestArticleId);
  const entity = ENTITY_LABEL[e.entityType] ?? e.entityType;
  const shortId = /^[0-9a-f-]{36}$/i.test(e.entityId) ? e.entityId.slice(0, 8) : e.entityId;
  const summary = presentSummary(e.kind, e.summary);
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
            {summary}
          </Link>
        ) : (
          summary
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
