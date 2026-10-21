import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import {
  activityLog,
  articleCorrections,
  articleRevisions,
  articles,
  candidateItems,
  candidates,
  correctionRequests,
  experiments,
  feedItems,
  feedSources,
  siteSettings,
  staff,
  stories,
  type Beat,
  type CandidateStatus,
  type FeedItemStatus,
} from "@/db/schema";
import { LEGAL_DEFAULTS, legalFromEnv, type Legal } from "@/lib/site";
import { requireStaff } from "@/server/auth";
import { loadCandidateItems } from "@/server/newsroom";

/**
 * Newsroom read model. Always dynamic: every loader awaits `connection()` and
 * re-verifies the caller (proxy.ts alone is not a security boundary).
 */
async function guard() {
  await connection();
  return requireStaff();
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/* ───────────────────────────── shell ───────────────────────────── */

export async function getAdminShell() {
  const me = await guard();
  const [c] = await db.execute<{
    inbox_new: number;
    review: number;
    scheduled: number;
    open_requests: number;
    source_errors: number;
    demo: boolean;
  }>(sql`select
      (select count(*) from feed_items where status = 'new')::int as inbox_new,
      (select count(*) from candidates where status = 'review')::int as review,
      (select count(*) from candidates where status = 'scheduled')::int as scheduled,
      (select count(*) from correction_requests where status = 'open')::int as open_requests,
      (select count(*) from feed_sources where status = 'error')::int as source_errors,
      exists(select 1 from articles where is_sample) as demo`);
  return {
    me: { id: me.id, name: me.name, login: me.login, role: me.role },
    counts: {
      inboxNew: c.inbox_new,
      review: c.review,
      scheduled: c.scheduled,
      openRequests: c.open_requests,
      sourceErrors: c.source_errors,
    },
    demo: c.demo,
  };
}

/* ───────────────────────────── dashboard ───────────────────────────── */

export interface ExperimentFunnel {
  id: string;
  code: string;
  name: string;
  status: string;
  colorSlot: number;
  sources: number;
  items: number;
  promoted: number;
  candidates: number;
  published: number;
  views: number;
  reads: number;
  corrections: number;
  medianMinutesToPublish: number | null;
}

export async function getExperimentFunnels(days = 7): Promise<ExperimentFunnel[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    name: string;
    status: string;
    color_slot: number;
    sources: number;
    items: number;
    promoted: number;
    candidates: number;
    published: number;
    views: number;
    reads: number;
    corrections: number;
    median_min: number | null;
  }>(sql`
    with win as (select now() - make_interval(days => ${days}) as since)
    select e.id, e.code, e.name, e.status, e.color_slot,
      (select count(*) from feed_sources s where s.experiment_id = e.id)::int as sources,
      (select count(*) from feed_items i join feed_sources s on s.id = i.source_id
        where s.experiment_id = e.id and i.fetched_at >= (select since from win))::int as items,
      (select count(*) from feed_items i join feed_sources s on s.id = i.source_id
        where s.experiment_id = e.id and i.status = 'promoted' and i.fetched_at >= (select since from win))::int as promoted,
      (select count(*) from candidates c where c.experiment_id = e.id and c.created_at >= (select since from win))::int as candidates,
      (select count(*) from articles a where a.experiment_id = e.id and a.status = 'published' and a.published_at >= (select since from win))::int as published,
      (select coalesce(sum(st.views), 0) from article_stats_daily st join articles a on a.id = st.article_id
        where a.experiment_id = e.id and st.day >= current_date - ${days}::int)::int as views,
      (select coalesce(sum(st.reads), 0) from article_stats_daily st join articles a on a.id = st.article_id
        where a.experiment_id = e.id and st.day >= current_date - ${days}::int)::int as reads,
      (select count(distinct ac.article_id) from article_corrections ac join articles a on a.id = ac.article_id
        where a.experiment_id = e.id)::int as corrections,
      (select percentile_cont(0.5) within group (order by extract(epoch from (t.published_at - t.first_seen)) / 60)
         from (select a.published_at, min(i.fetched_at) as first_seen
                 from articles a
                 join candidate_items ci on ci.candidate_id = a.candidate_id
                 join feed_items i on i.id = ci.feed_item_id
                where a.experiment_id = e.id and a.published_at >= (select since from win)
                group by a.id, a.published_at) t)::float as median_min
    from experiments e
    order by e.code`);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    colorSlot: r.color_slot,
    sources: r.sources,
    items: r.items,
    promoted: r.promoted,
    candidates: r.candidates,
    published: r.published,
    views: r.views,
    reads: r.reads,
    corrections: r.corrections,
    medianMinutesToPublish: r.median_min == null ? null : Math.round(r.median_min),
  }));
}

export async function getDashboard() {
  await guard();
  const [k] = await db.execute<{
    ingested: number;
    promoted: number;
    published: number;
    views_today: number;
    auto: number;
    ai_draft_edited: number;
    ai_assisted: number;
    human: number;
    named: number;
    total7: number;
    median_min: number | null;
  }>(sql`select
      (select count(*) from feed_items where fetched_at >= now() - interval '24 hours')::int as ingested,
      (select count(*) from candidates where created_at >= now() - interval '24 hours')::int as promoted,
      (select count(*) from articles where status = 'published' and published_at >= now() - interval '24 hours')::int as published,
      (select coalesce(sum(views), 0) from article_stats_daily where day = (now() at time zone 'Asia/Seoul')::date)::int as views_today,
      (select count(*) from articles where published_at >= now() - interval '7 days' and ai_involvement = 'auto')::int as auto,
      (select count(*) from articles where published_at >= now() - interval '7 days' and ai_involvement = 'ai_draft_edited')::int as ai_draft_edited,
      (select count(*) from articles where published_at >= now() - interval '7 days' and ai_involvement = 'ai_assisted')::int as ai_assisted,
      (select count(*) from articles where published_at >= now() - interval '7 days' and ai_involvement = 'human')::int as human,
      (select count(*) from articles where published_at >= now() - interval '7 days' and (editor_id is not null or ai_involvement in ('auto','human')))::int as named,
      (select count(*) from articles where published_at >= now() - interval '7 days')::int as total7,
      (select percentile_cont(0.5) within group (order by extract(epoch from (a.published_at - t.first_seen)) / 60)
         from articles a
         join (select ci.candidate_id, min(i.fetched_at) as first_seen
                 from candidate_items ci join feed_items i on i.id = ci.feed_item_id group by ci.candidate_id) t
           on t.candidate_id = a.candidate_id
        where a.published_at >= now() - interval '7 days')::float as median_min`);

  const throughput = await db.execute<{ h: number; n: number }>(sql`
    select gs.h::int as h, coalesce(count(a.id), 0)::int as n
      from generate_series(0, 47) as gs(h)
      left join articles a
        on a.status = 'published'
       and a.published_at >= date_trunc('hour', now()) - make_interval(hours => 47 - gs.h)
       and a.published_at < date_trunc('hour', now()) - make_interval(hours => 46 - gs.h)
     group by gs.h order by gs.h`);

  const sourceAlerts = await db
    .select({ id: feedSources.id, name: feedSources.name, status: feedSources.status, lastError: feedSources.lastError, reviewed: feedSources.licReviewedAt })
    .from(feedSources)
    .where(or(eq(feedSources.status, "error"), isNull(feedSources.licReviewedAt)));

  const requests = await db
    .select({
      id: correctionRequests.id,
      receivedAt: correctionRequests.receivedAt,
      requester: correctionRequests.requester,
      articleId: correctionRequests.articleId,
      title: articles.title,
    })
    .from(correctionRequests)
    .innerJoin(articles, eq(correctionRequests.articleId, articles.id))
    .where(eq(correctionRequests.status, "open"))
    .orderBy(asc(correctionRequests.receivedAt));

  const due = await db
    .select({ id: candidates.id, draft: candidates.draft, scheduledAt: candidates.scheduledAt })
    .from(candidates)
    .where(and(eq(candidates.status, "scheduled"), sql`${candidates.scheduledAt} <= now() + interval '60 minutes'`))
    .orderBy(asc(candidates.scheduledAt));

  return {
    kpis: {
      ingested24h: k.ingested,
      candidates24h: k.promoted,
      published24h: k.published,
      viewsToday: k.views_today,
      medianMinutesToPublish: k.median_min == null ? null : Math.round(k.median_min),
      aiMix: { auto: k.auto, ai_draft_edited: k.ai_draft_edited, ai_assisted: k.ai_assisted, human: k.human },
      namedEditorPct: k.total7 ? k.named / k.total7 : 1,
    },
    funnels: await getExperimentFunnels(7),
    throughput: throughput.map((r) => r.n),
    alerts: {
      sources: sourceAlerts.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.status === "error" ? ("error" as const) : ("unlicensed" as const),
        message: s.status === "error" ? (s.lastError ?? "수집 오류") : "라이선스 미검토",
      })),
      requests: requests.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })),
      due: due.map((d) => ({ id: d.id, title: d.draft.title, scheduledAt: iso(d.scheduledAt)! })),
    },
    activity: await recentActivity(15),
  };
}

/* ───────────────────────────── inbox ───────────────────────────── */

export interface InboxFilters {
  status?: FeedItemStatus | "all";
  source?: string;
  experiment?: string;
  beat?: Beat;
  minScore?: number;
  q?: string;
}

export async function getInbox(f: InboxFilters) {
  await guard();
  const where: SQL[] = [];
  const status = f.status ?? "new";
  if (status !== "all") where.push(eq(feedItems.status, status));
  if (f.source) where.push(eq(feedSources.slug, f.source));
  if (f.experiment) where.push(eq(experiments.code, f.experiment));
  if (f.beat) where.push(eq(feedItems.beatGuess, f.beat));
  if (f.minScore) where.push(gte(feedItems.score, f.minScore));
  if (f.q) where.push(or(ilike(feedItems.title, `%${f.q}%`), ilike(feedItems.summary, `%${f.q}%`))!);

  const rows = await db
    .select({
      id: feedItems.id,
      title: feedItems.title,
      summary: feedItems.summary,
      url: feedItems.url,
      lang: feedItems.lang,
      entities: feedItems.entities,
      beatGuess: feedItems.beatGuess,
      score: feedItems.score,
      status: feedItems.status,
      dismissedReason: feedItems.dismissedReason,
      payload: feedItems.payload,
      publishedAt: feedItems.publishedAt,
      fetchedAt: feedItems.fetchedAt,
      source: {
        id: feedSources.id,
        slug: feedSources.slug,
        name: feedSources.name,
        kind: feedSources.kind,
        trustTier: feedSources.trustTier,
        signalOnly: feedSources.signalOnly,
        licCommercialOk: feedSources.licCommercialOk,
        licRedistributionOk: feedSources.licRedistributionOk,
        licVerbatimOk: feedSources.licVerbatimOk,
        licRetentionDays: feedSources.licRetentionDays,
        licReviewedAt: feedSources.licReviewedAt,
      },
      experiment: { code: experiments.code, colorSlot: experiments.colorSlot },
      candidateId: sql<string | null>`(select ci.candidate_id from candidate_items ci where ci.feed_item_id = ${feedItems.id} limit 1)`,
    })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .leftJoin(experiments, eq(feedSources.experimentId, experiments.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(feedItems.fetchedAt))
    .limit(150);

  const counts = await db.execute<{ status: string; n: number }>(
    sql`select status, count(*)::int as n from feed_items group by status`,
  );
  const sources = await db
    .select({ slug: feedSources.slug, name: feedSources.name })
    .from(feedSources)
    .orderBy(asc(feedSources.name));
  const exps = await db.select({ code: experiments.code, name: experiments.name, colorSlot: experiments.colorSlot }).from(experiments).orderBy(asc(experiments.code));

  return {
    items: rows.map((r) => ({
      ...r,
      publishedAt: iso(r.publishedAt),
      fetchedAt: r.fetchedAt.toISOString(),
      source: { ...r.source, licReviewed: r.source.licReviewedAt != null, licReviewedAt: undefined },
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<FeedItemStatus, number>,
    facets: { sources, experiments: exps },
  };
}

/* ───────────────────────────── sources & experiments ───────────────────────────── */

export async function getSourcesAdmin() {
  await guard();
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    kind: string;
    url: string | null;
    lang: string;
    beats: string[];
    status: string;
    adapter: string;
    poll_interval_sec: number;
    trust_tier: number;
    signal_only: boolean;
    lic_commercial_ok: boolean | null;
    lic_redistribution_ok: boolean | null;
    lic_verbatim_ok: boolean | null;
    lic_attribution: string | null;
    lic_retention_days: number | null;
    lic_reviewed_at: Date | null;
    lic_reviewed_by: string | null;
    last_fetched_at: Date | null;
    last_error: string | null;
    exp_code: string | null;
    exp_color: number | null;
    items24h: number;
    items7d: number;
    promoted7d: number;
    published7d: number;
  }>(sql`
    select s.*, e.code as exp_code, e.color_slot as exp_color,
      (select count(*) from feed_items i where i.source_id = s.id and i.fetched_at >= now() - interval '24 hours')::int as items24h,
      (select count(*) from feed_items i where i.source_id = s.id and i.fetched_at >= now() - interval '7 days')::int as items7d,
      (select count(*) from feed_items i where i.source_id = s.id and i.status = 'promoted' and i.fetched_at >= now() - interval '7 days')::int as promoted7d,
      (select count(distinct a.id) from articles a
         join candidate_items ci on ci.candidate_id = a.candidate_id
         join feed_items i on i.id = ci.feed_item_id
        where i.source_id = s.id and a.published_at >= now() - interval '7 days')::int as published7d
    from feed_sources s left join experiments e on e.id = s.experiment_id
    order by e.code nulls last, s.name`);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    url: r.url,
    lang: r.lang,
    beats: r.beats,
    status: r.status,
    adapter: r.adapter,
    pollIntervalSec: r.poll_interval_sec,
    trustTier: r.trust_tier,
    signalOnly: r.signal_only,
    license: {
      commercialOk: r.lic_commercial_ok,
      redistributionOk: r.lic_redistribution_ok,
      verbatimOk: r.lic_verbatim_ok,
      attribution: r.lic_attribution,
      retentionDays: r.lic_retention_days,
      reviewedAt: iso(r.lic_reviewed_at ? new Date(r.lic_reviewed_at) : null),
      reviewedBy: r.lic_reviewed_by,
    },
    lastFetchedAt: iso(r.last_fetched_at ? new Date(r.last_fetched_at) : null),
    lastError: r.last_error,
    experiment: r.exp_code ? { code: r.exp_code, colorSlot: r.exp_color ?? 1 } : null,
    stats: { items24h: r.items24h, items7d: r.items7d, promoted7d: r.promoted7d, published7d: r.published7d },
  }));
}

export async function getSourceForEdit(id: string | null) {
  await guard();
  const exps = await db.select({ id: experiments.id, code: experiments.code, name: experiments.name }).from(experiments).orderBy(asc(experiments.code));
  if (!id) return { source: null, experiments: exps };
  const source = await db.query.feedSources.findFirst({ where: eq(feedSources.id, id) });
  return { source: source ?? null, experiments: exps };
}

export async function getExperimentsAdmin() {
  await guard();
  const exps = await db.select().from(experiments).orderBy(asc(experiments.code));
  const funnels = await getExperimentFunnels(7);
  return exps.map((e) => ({
    ...e,
    startedAt: iso(e.startedAt),
    endedAt: iso(e.endedAt),
    createdAt: e.createdAt.toISOString(),
    funnel: funnels.find((f) => f.id === e.id) ?? null,
  }));
}

/* ───────────────────────────── candidates ───────────────────────────── */

export async function getBoard() {
  await guard();
  const rows = await db
    .select({
      id: candidates.id,
      status: candidates.status,
      mode: candidates.mode,
      beat: candidates.beat,
      priority: candidates.priority,
      draft: candidates.draft,
      idea: candidates.idea,
      aiNote: candidates.aiNote,
      checks: candidates.checks,
      scheduledAt: candidates.scheduledAt,
      createdAt: candidates.createdAt,
      updatedAt: candidates.updatedAt,
      articleId: candidates.articleId,
      assignee: staff.name,
      storyTitle: stories.title,
      experimentCode: experiments.code,
      experimentColor: experiments.colorSlot,
      itemCount: sql<number>`(select count(*) from candidate_items ci where ci.candidate_id = ${candidates.id})::int`,
      articleSlug: sql<string | null>`(select a.slug from articles a where a.id = ${candidates.articleId})`,
    })
    .from(candidates)
    .leftJoin(staff, eq(candidates.assigneeId, staff.id))
    .leftJoin(stories, eq(candidates.storyId, stories.id))
    .leftJoin(experiments, eq(candidates.experimentId, experiments.id))
    .where(
      or(
        inArray(candidates.status, ["new", "drafting", "review", "scheduled"] satisfies CandidateStatus[]),
        gte(candidates.updatedAt, sql`now() - interval '24 hours'`),
      ),
    )
    .orderBy(desc(candidates.priority), desc(candidates.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    mode: r.mode,
    beat: r.beat,
    priority: r.priority,
    title: r.draft.title || r.idea || "(제목 없음)",
    dek: r.draft.dek,
    aiNote: r.aiNote,
    checks: {
      total: r.checks.length,
      passed: r.checks.filter((c) => c.ok || c.overridden).length,
      blocking: r.checks.filter((c) => c.blocking && !c.ok && !c.overridden).length,
    },
    scheduledAt: iso(r.scheduledAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    assignee: r.assignee,
    storyTitle: r.storyTitle,
    experiment: r.experimentCode ? { code: r.experimentCode, colorSlot: r.experimentColor ?? 1 } : null,
    itemCount: r.itemCount,
    articleSlug: r.articleSlug,
  }));
}

export async function getCandidateBundle(id: string) {
  const me = await guard();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = await db.query.candidates.findFirst({
    where: eq(candidates.id, id),
    with: { experiment: true, story: true, assignee: true },
  });
  if (!c) return null;
  const items = await loadCandidateItems(db, c.id);
  const staffList = await db.select({ id: staff.id, name: staff.name, title: staff.title }).from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name));
  const storyList = await db
    .select({ id: stories.id, title: stories.title, beat: stories.beat, status: stories.status })
    .from(stories)
    .orderBy(desc(stories.lastPublishedAt))
    .limit(60);
  const article = c.articleId
    ? await db.query.articles.findFirst({ where: eq(articles.id, c.articleId), columns: { slug: true, status: true } })
    : null;
  return {
    me: { id: me.id, name: me.name },
    candidate: {
      id: c.id,
      status: c.status,
      mode: c.mode,
      beat: c.beat,
      priority: c.priority,
      idea: c.idea,
      draft: c.draft,
      checks: c.checks,
      aiNote: c.aiNote,
      generator: c.generator,
      lockVersion: c.lockVersion,
      scheduledAt: iso(c.scheduledAt),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      storyId: c.storyId,
      assigneeId: c.assigneeId,
      experiment: c.experiment ? { code: c.experiment.code, name: c.experiment.name, colorSlot: c.experiment.colorSlot } : null,
      article: article ? { slug: article.slug, status: article.status } : null,
    },
    items: items.map((i) => ({
      id: i.id,
      role: i.role,
      title: i.title,
      summary: i.summary,
      url: i.url,
      lang: i.lang,
      entities: i.entities,
      payload: i.payload,
      score: i.score,
      fetchedAt: i.fetchedAt.toISOString(),
      source: {
        name: i.source.name,
        kind: i.source.kind,
        trustTier: i.source.trustTier,
        signalOnly: i.source.signalOnly,
        commercialOk: i.source.licCommercialOk,
        redistributionOk: i.source.licRedistributionOk,
        verbatimOk: i.source.licVerbatimOk,
        attribution: i.source.licAttribution,
        reviewed: i.source.licReviewedAt != null,
      },
    })),
    staff: staffList,
    stories: storyList,
  };
}

export async function getStaffAndStories() {
  await guard();
  const storyList = await db.select({ id: stories.id, title: stories.title, beat: stories.beat }).from(stories).orderBy(desc(stories.lastPublishedAt)).limit(60);
  return { stories: storyList };
}

/* ───────────────────────────── articles ───────────────────────────── */

export async function getArticlesAdmin(f: { beat?: Beat; status?: "published" | "unpublished"; q?: string }) {
  await guard();
  const where: SQL[] = [];
  if (f.beat) where.push(eq(articles.beat, f.beat));
  if (f.status) where.push(eq(articles.status, f.status));
  if (f.q) where.push(ilike(articles.title, `%${f.q}%`));
  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      beat: articles.beat,
      status: articles.status,
      aiInvolvement: articles.aiInvolvement,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      revision: articles.revision,
      isBreaking: articles.isBreaking,
      featuredUntil: articles.featuredUntil,
      isSample: articles.isSample,
      editor: staff.name,
      storyTitle: stories.title,
      views: sql<number>`coalesce((select sum(views) from article_stats_daily s where s.article_id = ${articles.id} and s.day >= current_date - 7), 0)::int`,
      reads: sql<number>`coalesce((select sum(reads) from article_stats_daily s where s.article_id = ${articles.id} and s.day >= current_date - 7), 0)::int`,
      nexts: sql<number>`coalesce((select sum(nexts) from article_stats_daily s where s.article_id = ${articles.id} and s.day >= current_date - 7), 0)::int`,
      corrections: sql<number>`(select count(*) from article_corrections c where c.article_id = ${articles.id})::int`,
      openRequests: sql<number>`(select count(*) from correction_requests r where r.article_id = ${articles.id} and r.status = 'open')::int`,
    })
    .from(articles)
    .leftJoin(staff, eq(articles.editorId, staff.id))
    .leftJoin(stories, eq(articles.storyId, stories.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(articles.publishedAt))
    .limit(200);
  return rows.map((r) => ({
    ...r,
    publishedAt: r.publishedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    featuredUntil: iso(r.featuredUntil),
  }));
}

export async function getArticleAdmin(id: string) {
  await guard();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id), with: { editor: true, author: true, story: true } });
  if (!a) return null;
  const revisions = await db.select().from(articleRevisions).where(eq(articleRevisions.articleId, a.id)).orderBy(desc(articleRevisions.revision));
  const corrections = await db.select().from(articleCorrections).where(eq(articleCorrections.articleId, a.id)).orderBy(desc(articleCorrections.publishedAt));
  const requests = await db.select().from(correctionRequests).where(eq(correctionRequests.articleId, a.id)).orderBy(desc(correctionRequests.receivedAt));
  const stats = await db.execute<{ day: string; views: number; reads: number; nexts: number; dwell_ms: number }>(
    sql`select day::text, views, reads, nexts, dwell_ms::float as dwell_ms from article_stats_daily where article_id = ${a.id} and day >= current_date - 13 order by day`,
  );
  const storyList = await db.select({ id: stories.id, title: stories.title, beat: stories.beat }).from(stories).orderBy(desc(stories.lastPublishedAt)).limit(60);
  return {
    article: {
      ...a,
      publishedAt: a.publishedAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
      featuredUntil: iso(a.featuredUntil),
      editor: a.editor ? { name: a.editor.name, slug: a.editor.slug } : null,
      author: a.author ? { name: a.author.name, slug: a.author.slug } : null,
      story: a.story ? { id: a.story.id, title: a.story.title, slug: a.story.slug } : null,
    },
    revisions: revisions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    corrections: corrections.map((c) => ({ ...c, publishedAt: c.publishedAt.toISOString() })),
    requests: requests.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString(), resolvedAt: iso(r.resolvedAt) })),
    stats: stats.map((s) => ({ day: s.day, views: s.views, reads: s.reads, nexts: s.nexts, dwellMs: Number(s.dwell_ms) })),
    stories: storyList,
  };
}

/* ───────────────────────────── stories, activity, settings ───────────────────────────── */

export async function getStoriesAdmin() {
  await guard();
  const rows = await db.select().from(stories).orderBy(desc(stories.lastPublishedAt));
  return rows.map((s) => ({
    ...s,
    lastPublishedAt: iso(s.lastPublishedAt),
    createdAt: s.createdAt.toISOString(),
    featuredUntil: iso(s.featuredUntil),
  }));
}

async function recentActivity(limit: number, kind?: string) {
  const rows = await db
    .select({
      id: activityLog.id,
      at: activityLog.at,
      kind: activityLog.kind,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      summary: activityLog.summary,
      actor: staff.name,
    })
    .from(activityLog)
    .leftJoin(staff, eq(activityLog.actorId, staff.id))
    .where(kind ? eq(activityLog.kind, kind) : undefined)
    .orderBy(desc(activityLog.at))
    .limit(limit);
  return rows.map((r) => ({ ...r, at: r.at.toISOString(), actor: r.actor ?? "시스템" }));
}

export async function getActivity(f: { kind?: string }) {
  await guard();
  return recentActivity(200, f.kind);
}

export async function getSettingsAdmin(): Promise<{ stored: Partial<Legal>; env: Partial<Legal>; effective: Legal }> {
  await guard();
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "legal") });
  const stored = (row?.value ?? {}) as Partial<Legal>;
  const env = legalFromEnv();
  const clean = Object.fromEntries(Object.entries(stored).filter(([, v]) => typeof v === "string" && v.trim())) as Partial<Legal>;
  return { stored, env, effective: { ...LEGAL_DEFAULTS, ...clean, ...env } };
}
