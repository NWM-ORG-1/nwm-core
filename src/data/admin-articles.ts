import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { activityLog, articles, staff } from "@/db/schema";
import { requireStaff } from "@/server/auth";

/**
 * Extra read models for the published-articles screens. Same contract as
 * src/data/admin.ts: always dynamic, always re-verifies staff first.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filter-independent totals for the summary strip above the article table. */
export async function getArticlesSummary() {
  await connection();
  await requireStaff();
  const [r] = await db.execute<{
    published: number;
    unpublished: number;
    views7: number;
    reads7: number;
    nexts7: number;
    articles_with_open: number;
    open_requests: number;
    oldest_open_at: string | null;
    featured_now: number;
  }>(sql`select
      (select count(*) from articles where status = 'published')::int as published,
      (select count(*) from articles where status = 'unpublished')::int as unpublished,
      (select coalesce(sum(s.views), 0) from article_stats_daily s join articles a on a.id = s.article_id
        where a.status = 'published' and s.day >= (now() at time zone 'Asia/Seoul')::date - 6)::int as views7,
      (select coalesce(sum(s.reads), 0) from article_stats_daily s join articles a on a.id = s.article_id
        where a.status = 'published' and s.day >= (now() at time zone 'Asia/Seoul')::date - 6)::int as reads7,
      (select coalesce(sum(s.nexts), 0) from article_stats_daily s join articles a on a.id = s.article_id
        where a.status = 'published' and s.day >= (now() at time zone 'Asia/Seoul')::date - 6)::int as nexts7,
      (select count(distinct article_id) from correction_requests where status = 'open')::int as articles_with_open,
      (select count(*) from correction_requests where status = 'open')::int as open_requests,
      (select min(received_at) from correction_requests where status = 'open') as oldest_open_at,
      (select count(*) from articles where status = 'published' and featured_until > now())::int as featured_now`);
  return {
    published: r.published,
    unpublished: r.unpublished,
    views7: r.views7,
    reads7: r.reads7,
    nexts7: r.nexts7,
    articlesWithOpen: r.articles_with_open,
    openRequests: r.open_requests,
    oldestOpenAt: r.oldest_open_at ? new Date(r.oldest_open_at).toISOString() : null,
    featuredNow: r.featured_now,
    /** Request time (ms) — for "Top 지정 중" and request ages, computed once per render. */
    now: Date.now(),
  };
}

/**
 * Everything the article detail screen needs beyond getArticleAdmin():
 * staff names for revisions / corrections, rejection notes for correction
 * requests (kept in the activity log), recent activity on the article, and the
 * 14 calendar days the stats window covers (zero-filled by the caller).
 */
export async function getArticleSidecar(
  articleId: string,
  refs: { staffIds: Array<string | null>; requestIds: string[] },
) {
  await connection();
  await requireStaff();
  if (!UUID.test(articleId)) return null;

  const staffIds = [...new Set(refs.staffIds.filter((v): v is string => !!v && UUID.test(v)))];
  const requestIds = refs.requestIds.filter((v) => UUID.test(v));

  const [names, notes, activity, days] = await Promise.all([
    staffIds.length ? db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds)) : Promise.resolve([]),
    requestIds.length
      ? db
          .select({ entityId: activityLog.entityId, summary: activityLog.summary, at: activityLog.at, actor: staff.name })
          .from(activityLog)
          .leftJoin(staff, eq(activityLog.actorId, staff.id))
          .where(and(eq(activityLog.entityType, "correction_request"), inArray(activityLog.entityId, requestIds)))
          .orderBy(desc(activityLog.at))
      : Promise.resolve([]),
    db
      .select({ id: activityLog.id, at: activityLog.at, kind: activityLog.kind, summary: activityLog.summary, actor: staff.name })
      .from(activityLog)
      .leftJoin(staff, eq(activityLog.actorId, staff.id))
      .where(and(eq(activityLog.entityType, "article"), eq(activityLog.entityId, articleId)))
      .orderBy(desc(activityLog.at))
      .limit(8),
    // 14 KST calendar days ending today. article_stats_daily.day is a KST date, while
    // current_date follows the DB session zone (UTC here): between 00:00 and 09:00 KST
    // it is still "yesterday", which would drop today's bar. getArticleAdmin's
    // `day >= current_date - 13` filter is open-ended, so every day listed here is covered.
    db.execute<{ day: string }>(
      sql`select ((now() at time zone 'Asia/Seoul')::date - g)::text as day from generate_series(13, 0, -1) as g`,
    ),
  ]);

  // Latest log line per request: the rejection note, or the intake line.
  const requestLog: Record<string, { summary: string; at: string; actor: string }> = {};
  for (const n of notes) {
    if (requestLog[n.entityId]) continue;
    requestLog[n.entityId] = { summary: n.summary, at: n.at.toISOString(), actor: n.actor ?? "시스템" };
  }

  return {
    staffNames: Object.fromEntries(names.map((n) => [n.id, n.name])) as Record<string, string>,
    requestLog,
    activity: activity.map((a) => ({ id: a.id, at: a.at.toISOString(), kind: a.kind, summary: a.summary, actor: a.actor ?? "시스템" })),
    days: days.map((d) => d.day),
    now: Date.now(),
  };
}

/** Title only, for the detail page's <title>. */
export async function getArticleTitle(articleId: string): Promise<string | null> {
  await connection();
  await requireStaff();
  if (!UUID.test(articleId)) return null;
  const a = await db.query.articles.findFirst({ where: eq(articles.id, articleId), columns: { title: true } });
  return a?.title ?? null;
}
