import "server-only";
import { and, asc, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import {
  articleCorrections,
  articles,
  marketQuotes,
  sentimentSnapshots,
  siteSettings,
  staff,
  stories,
  type Beat,
} from "@/db/schema";
import { BEAT_ORDER, CRYPTO_LOW_PROFILE } from "@/lib/beats";
import { T } from "@/lib/cache-tags";
import { clusterTop } from "@/lib/rank";
import { related } from "@/lib/recommend";
import { isYmd } from "@/lib/format";
import { LEGAL_DEFAULTS, legalFromEnv, type Legal } from "@/lib/site";
import type {
  ArticleCard,
  ArticleFull,
  CorrectionDTO,
  PersonRef,
  Pulse,
  QuoteDTO,
  SearchRecord,
  SentimentDTO,
  StoryDTO,
  TimelineEntry,
} from "./dto";

/**
 * Public read model. Every exported function is a `'use cache'` boundary with an
 * explicit lifetime profile (next.config.ts → cacheLife) and tags (lib/cache-tags).
 * Public pages are fully static; the newsroom invalidates these tags on publish.
 */

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,80}$/;
const published = eq(articles.status, "published");

/* ─────────────────────────── shared selects ─────────────────────────── */

const cardFields = {
  id: articles.id,
  slug: articles.slug,
  beat: articles.beat,
  title: articles.title,
  dek: articles.dek,
  aiInvolvement: articles.aiInvolvement,
  publishedAt: articles.publishedAt,
  readSeconds: articles.readSeconds,
  isBreaking: articles.isBreaking,
  featured: sql<boolean>`coalesce(${articles.featuredUntil} > now(), false)`,
  storyId: articles.storyId,
  storySlug: stories.slug,
  storyTitle: stories.title,
  tags: articles.tags,
  tickers: articles.tickers,
  views: sql<number>`coalesce((select sum(s.views) from article_stats_daily s where s.article_id = ${articles.id} and s.day >= current_date - 7), 0)::int`,
  sentimentScore: sql<number | null>`(${articles.sentiment}->>'score')::float`,
  isSample: articles.isSample,
};

type CardRow = {
  [K in keyof typeof cardFields]: unknown;
} & { publishedAt: Date; storySlug: string | null; storyTitle: string | null };

function toCard(r: CardRow): ArticleCard {
  return {
    id: r.id as string,
    slug: r.slug as string,
    beat: r.beat as Beat,
    title: r.title as string,
    dek: r.dek as string,
    aiInvolvement: r.aiInvolvement as ArticleCard["aiInvolvement"],
    publishedAt: r.publishedAt.toISOString(),
    readSeconds: r.readSeconds as number,
    isBreaking: Boolean(r.isBreaking),
    featured: Boolean(r.featured),
    storyId: (r.storyId as string | null) ?? null,
    storySlug: r.storySlug,
    storyTitle: r.storyTitle,
    tags: (r.tags as string[]) ?? [],
    tickers: (r.tickers as string[]) ?? [],
    views: Number(r.views ?? 0),
    sentimentScore: r.sentimentScore == null ? null : Number(r.sentimentScore),
    isSample: Boolean(r.isSample),
  };
}

async function listCards(opts: { beat?: Beat; limit: number; storyId?: string; dayKST?: string; offset?: number }) {
  const where = [published];
  if (opts.beat) where.push(eq(articles.beat, opts.beat));
  if (opts.storyId) where.push(eq(articles.storyId, opts.storyId));
  if (opts.dayKST) where.push(sql`(${articles.publishedAt} at time zone 'Asia/Seoul')::date = ${opts.dayKST}::date`);
  const rows = await db
    .select(cardFields)
    .from(articles)
    .leftJoin(stories, eq(articles.storyId, stories.id))
    .where(and(...where))
    .orderBy(desc(articles.publishedAt))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);
  return rows.map((r) => toCard(r as CardRow));
}

function toStory(s: typeof stories.$inferSelect): StoryDTO {
  return {
    id: s.id,
    slug: s.slug,
    beat: s.beat,
    title: s.title,
    summary: s.summary,
    status: s.status,
    articleCount: s.articleCount,
    lastPublishedAt: s.lastPublishedAt?.toISOString() ?? null,
  };
}

function person(p: typeof staff.$inferSelect | null | undefined): PersonRef | null {
  return p ? { name: p.name, slug: p.slug, title: p.title } : null;
}

/* ─────────────────────────── front page & lists ─────────────────────────── */

export interface HomeData {
  hero: { lead: ArticleCard; updates: number; members: ArticleCard[] } | null;
  five: Array<{ lead: ArticleCard; updates: number }>;
  river: ArticleCard[];
  rails: Record<Beat, ArticleCard[]>;
  popular: ArticleCard[];
  stories: StoryDTO[];
  /** candidate pool for on-device "For You" ranking */
  pool: ArticleCard[];
}

export async function getHomeData(): Promise<HomeData> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);

  const pool = await listCards({ limit: 200 });
  const now = Date.now(); // frozen into this cache entry
  const clusters = clusterTop(pool, now, 6);
  const [first, ...rest] = clusters;

  const rails = Object.fromEntries(BEAT_ORDER.map((b) => [b, pool.filter((c) => c.beat === b).slice(0, 4)])) as Record<
    Beat,
    ArticleCard[]
  >;

  const recent48 = pool.filter((c) => now - new Date(c.publishedAt).getTime() < 48 * 3_600_000);
  const popular = [...(recent48.length >= 5 ? recent48 : pool)].sort((a, b) => b.views - a.views).slice(0, 5);

  const storyRows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.status, "developing"), sql`${stories.articleCount} >= 2`))
    .orderBy(desc(stories.lastPublishedAt))
    .limit(6);

  return {
    hero: first ? { lead: first.lead, updates: first.members.length, members: first.members.slice(0, 4) } : null,
    five: rest.slice(0, 5).map((c) => ({ lead: c.lead, updates: c.members.length })),
    river: pool.slice(0, 60),
    rails,
    popular,
    stories: storyRows.map(toStory),
    pool: pool.slice(0, 80),
  };
}

export interface BeatData {
  top: ArticleCard[];
  river: ArticleCard[];
  stories: StoryDTO[];
  count24h: number;
}

export async function getBeatData(beat: Beat): Promise<BeatData> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);

  const pool = await listCards({ beat, limit: 120 });
  const now = Date.now();
  const top = clusterTop(pool, now, 3).map((c) => c.lead);
  const topSlugs = new Set(top.map((c) => c.slug));
  const storyRows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.beat, beat), sql`${stories.articleCount} >= 1`))
    .orderBy(desc(stories.lastPublishedAt))
    .limit(4);
  return {
    top,
    river: pool.filter((c) => !topSlugs.has(c.slug)).slice(0, 60),
    stories: storyRows.map(toStory),
    count24h: pool.filter((c) => now - new Date(c.publishedAt).getTime() < 24 * 3_600_000).length,
  };
}

export async function getLatest(limit = 150): Promise<ArticleCard[]> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  return listCards({ limit });
}

export async function getDay(ymd: string): Promise<ArticleCard[]> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  if (!isYmd(ymd)) return [];
  return listCards({ limit: 300, dayKST: ymd });
}

/** KST dates that have articles, newest first (for /d/[date] static params and archive nav). */
export async function getArchiveDays(limit = 14): Promise<string[]> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  const rows = await db.execute<{ d: string }>(
    sql`select distinct to_char((published_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as d
        from articles where status = 'published' order by d desc limit ${limit}`,
  );
  return rows.map((r) => r.d);
}

/* ─────────────────────────── articles ─────────────────────────── */

export async function getArticle(slug: string): Promise<ArticleFull | null> {
  "use cache";
  cacheLife("article");
  cacheTag(T.article(slug)); // tag before querying so a later publish clears a cached miss
  if (!SLUG_RE.test(slug)) return null;

  const row = await db.query.articles.findFirst({
    where: and(eq(articles.slug, slug), published),
    with: {
      editor: true,
      author: true,
      story: true,
      corrections: { orderBy: [asc(articleCorrections.publishedAt)] },
    },
  });
  if (!row) return null;
  if (row.storyId) cacheTag(T.story(row.storyId));

  const [stats] = await db.execute<{ v: number }>(
    sql`select coalesce(sum(views), 0)::int as v from article_stats_daily where article_id = ${row.id} and day >= current_date - 7`,
  );

  const corrections: CorrectionDTO[] = row.corrections.map((c) => ({
    kind: c.kind,
    note: c.note,
    publishedAt: c.publishedAt.toISOString(),
    revision: c.revision,
  }));

  return {
    id: row.id,
    slug: row.slug,
    beat: row.beat,
    title: row.title,
    dek: row.dek,
    aiInvolvement: row.aiInvolvement,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readSeconds: row.readSeconds,
    isBreaking: row.isBreaking,
    featured: false,
    storyId: row.storyId,
    storySlug: row.story?.slug ?? null,
    storyTitle: row.story?.title ?? null,
    tags: row.tags,
    tickers: row.tickers,
    views: Number(stats?.v ?? 0),
    sentimentScore: row.sentiment?.score ?? null,
    isSample: row.isSample,
    blocks: row.blocks,
    sources: row.sources,
    sentiment: row.sentiment ?? null,
    // Personal bylines follow the live staff name, so a rename never leaves the old one behind.
    byline: row.author ? `글 · ${row.author.name}` : row.byline,
    editor: person(row.editor),
    author: person(row.author),
    revision: row.revision,
    corrections,
    story: row.story
      ? {
          id: row.story.id,
          slug: row.story.slug,
          title: row.story.title,
          status: row.story.status,
          articleCount: row.story.articleCount,
        }
      : null,
  };
}

/** Related articles for the end-of-article rail and the default reading queue. */
export async function getRelated(slug: string, n = 8): Promise<ArticleCard[]> {
  "use cache";
  cacheLife("article");
  cacheTag(T.rel, T.article(slug));
  if (!SLUG_RE.test(slug)) return [];
  const pool = await listCards({ limit: 200 });
  const seed = pool.find((c) => c.slug === slug);
  if (!seed) return pool.slice(0, n);
  return related(seed, pool, n);
}

export async function getStoryTimeline(storyId: string): Promise<TimelineEntry[]> {
  "use cache";
  cacheLife("article");
  cacheTag(T.story(storyId));
  const rows = await db
    .select({
      slug: articles.slug,
      title: articles.title,
      dek: articles.dek,
      publishedAt: articles.publishedAt,
      aiInvolvement: articles.aiInvolvement,
    })
    .from(articles)
    .where(and(eq(articles.storyId, storyId), published))
    .orderBy(desc(articles.publishedAt))
    .limit(30);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() }));
}

/** Prerendered at build; any newer slug renders on first request and is then cached. */
export async function getPrerenderSlugs(limit = 200): Promise<string[]> {
  const rows = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(published)
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map((r) => r.slug);
}

/* ─────────────────────────── stories & people ─────────────────────────── */

export async function getStory(slug: string): Promise<{ story: StoryDTO; articles: ArticleCard[] } | null> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  if (!SLUG_RE.test(slug)) return null;
  const s = await db.query.stories.findFirst({ where: eq(stories.slug, slug) });
  if (!s) return null;
  cacheTag(T.story(s.id));
  // A story with no published update is an editorial plan, not a public page.
  const cards = await listCards({ storyId: s.id, limit: 100 });
  if (cards.length === 0) return null;
  return { story: toStory(s), articles: cards };
}

export async function getStorySlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: stories.slug })
    .from(stories)
    .where(gt(stories.articleCount, 0))
    .orderBy(desc(stories.lastPublishedAt))
    .limit(200);
  return rows.map((r) => r.slug);
}

export async function getEditor(
  slug: string,
): Promise<{ person: PersonRef & { bio: string; isSample: boolean }; articles: ArticleCard[] } | null> {
  "use cache";
  cacheLife("article");
  cacheTag(T.editors);
  if (!SLUG_RE.test(slug)) return null;
  const p = await db.query.staff.findFirst({ where: eq(staff.slug, slug) });
  if (!p || !p.active) return null;
  const rows = await db
    .select(cardFields)
    .from(articles)
    .leftJoin(stories, eq(articles.storyId, stories.id))
    .where(and(published, sql`(${articles.editorId} = ${p.id} or ${articles.authorId} = ${p.id})`))
    .orderBy(desc(articles.publishedAt))
    .limit(40);
  if (rows.length === 0) return null;
  return {
    person: { name: p.name, slug: p.slug, title: p.title, bio: p.bio, isSample: p.isSample },
    articles: rows.map((r) => toCard(r as CardRow)),
  };
}

/** Only people credited on published articles get a public page (never bare admin accounts). */
export async function getEditorSlugs(): Promise<string[]> {
  const rows = await db.execute<{ slug: string }>(sql`
    select s.slug from staff s
     where s.active and exists (
       select 1 from articles a where a.status = 'published' and (a.editor_id = s.id or a.author_id = s.id))`);
  return rows.map((r) => r.slug);
}

export async function getCorrectionsLog(): Promise<
  Array<CorrectionDTO & { slug: string; title: string; beat: Beat }>
> {
  "use cache";
  cacheLife("article");
  cacheTag(T.corrections);
  const rows = await db
    .select({
      kind: articleCorrections.kind,
      note: articleCorrections.note,
      publishedAt: articleCorrections.publishedAt,
      revision: articleCorrections.revision,
      slug: articles.slug,
      title: articles.title,
      beat: articles.beat,
    })
    .from(articleCorrections)
    .innerJoin(articles, eq(articleCorrections.articleId, articles.id))
    .where(published)
    .orderBy(desc(articleCorrections.publishedAt))
    .limit(100);
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() }));
}

/* ─────────────────────────── market & sentiment ─────────────────────────── */

/**
 * Quotes the public may see: live rows only once any live quote exists (sample
 * "mock" rows then drop out), and nothing older than four days (a stopped
 * source must not leave a frozen number on the ticker).
 */
const visibleQuote = sql`(${marketQuotes.source} <> 'mock' or not exists (select 1 from market_quotes q where q.source <> 'mock'))
  and (${marketQuotes.source} = 'mock' or ${marketQuotes.asOf} > now() - interval '4 days')`;

export async function getQuotes(): Promise<QuoteDTO[]> {
  "use cache";
  cacheLife("river");
  cacheTag(T.quotes);
  const rows = await db.select().from(marketQuotes).where(visibleQuote).orderBy(asc(marketQuotes.sort));
  return rows.map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changePct: q.changePct,
    currency: q.currency,
    spark: q.spark,
  }));
}

/**
 * Published readings only: shadow rows (computed before launch) never reach the
 * site, and once a live reading exists the seeded samples drop out.
 */
const visibleSentiment = sql`${sentimentSnapshots.shadow} = false
  and (${sentimentSnapshots.isSample} = false or not exists (select 1 from sentiment_snapshots x where x.is_sample = false and x.shadow = false))`;

async function sentimentScopes(keys?: string[]): Promise<SentimentDTO[]> {
  const rows = await db
    .select()
    .from(sentimentSnapshots)
    .where(
      and(
        visibleSentiment,
        // live readings are hourly: three days covers the 24 h chart; seeded samples keep their own times
        sql`(${sentimentSnapshots.isSample} or ${sentimentSnapshots.at} > now() - interval '3 days')`,
        keys?.length ? inArray(sentimentSnapshots.scopeKey, keys) : undefined,
      ),
    )
    .orderBy(asc(sentimentSnapshots.scopeKey), asc(sentimentSnapshots.at));
  const byScope = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    const list = byScope.get(r.scopeKey);
    if (list) list.push(r);
    else byScope.set(r.scopeKey, [r]);
  }
  const out: SentimentDTO[] = [];
  for (const [scopeKey, list] of byScope) {
    const last = list[list.length - 1];
    out.push({
      scopeKey,
      label: last.label,
      score: last.score,
      change24h: last.change24h,
      bullish: last.bullish,
      bearish: last.bearish,
      volume: last.volume,
      sources: last.sources,
      keywords: last.keywords,
      history: list.slice(-24).map((p) => ({ at: p.at.toISOString(), score: p.score })),
      live: !last.isSample,
      at: last.at.toISOString(),
      confidence: last.confidence,
    });
  }
  return out;
}

export async function getSentimentDashboard(): Promise<{ index: SentimentDTO | null; assets: SentimentDTO[] }> {
  "use cache";
  cacheLife("river");
  cacheTag(T.sentiment);
  const all = await sentimentScopes();
  return {
    index: all.find((s) => s.scopeKey === "index") ?? null,
    assets: all.filter((s) => s.scopeKey.startsWith("asset:")).sort((a, b) => b.volume - a.volume),
  };
}

/* ─────────────────────────── live pulse & search ─────────────────────────── */

/** Quotes from crypto exchanges stay off the ticker while the crypto beat is lowered. */
const CRYPTO_QUOTE_SOURCES = ["binance", "upbit", "bithumb"];

/** The only live data on public pages. Polled by the client; never baked into page HTML. */
export async function getPulse(): Promise<Pulse> {
  "use cache";
  cacheLife("pulse");
  cacheTag(T.feed, T.quotes, T.sentiment);
  const [latest, quotes, index] = await Promise.all([
    db
      .select({ s: articles.slug, t: articles.title, b: articles.beat, p: articles.publishedAt })
      .from(articles)
      .where(published)
      .orderBy(desc(articles.publishedAt))
      .limit(30),
    db
      .select()
      .from(marketQuotes)
      .where(
        and(
          eq(marketQuotes.inTicker, true),
          visibleQuote,
          CRYPTO_LOW_PROFILE ? notInArray(marketQuotes.source, CRYPTO_QUOTE_SOURCES) : undefined,
        ),
      )
      .orderBy(asc(marketQuotes.sort)),
    db
      .select({ score: sentimentSnapshots.score, ch: sentimentSnapshots.change24h })
      .from(sentimentSnapshots)
      .where(and(eq(sentimentSnapshots.scopeKey, "index"), visibleSentiment))
      .orderBy(desc(sentimentSnapshots.at))
      .limit(1),
  ]);
  return {
    at: new Date().toISOString(), // inside 'use cache': frozen per entry
    latest: latest.map((r) => ({ s: r.s, t: r.t, b: r.b, p: r.p.toISOString() })),
    quotes: quotes.map((q) => ({ s: q.symbol, n: q.name, p: q.price, c: q.changePct, cur: q.currency, src: q.source })),
    senti: index[0] ? { score: index[0].score, ch: index[0].ch } : null,
  };
}

export async function getSearchIndex(): Promise<SearchRecord[]> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  const rows = await db
    .select({ slug: articles.slug, title: articles.title, dek: articles.dek, beat: articles.beat, p: articles.publishedAt })
    .from(articles)
    .where(published)
    .orderBy(desc(articles.publishedAt))
    .limit(1000);
  return rows.map((r) => [r.slug, r.title, r.dek.slice(0, 60), r.beat, Math.floor(r.p.getTime() / 60000)]);
}

/* ─────────────────────────── site ─────────────────────────── */

export interface SiteFlags {
  /** sample content is live → demo banner + noindex */
  demo: boolean;
  legal: Legal;
}

export async function getSiteFlags(): Promise<SiteFlags> {
  "use cache";
  cacheLife("reference");
  // only `site`: this runs in the (site) layout, so any broader tag would re-render every page
  cacheTag(T.site);
  const [demoRow] = await db.execute<{ demo: boolean }>(
    sql`select exists(select 1 from articles where is_sample and status = 'published') as demo`,
  );
  const legalRow = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "legal") });
  const stored = (legalRow?.value ?? {}) as Partial<Legal>;
  return {
    demo: Boolean(demoRow?.demo),
    legal: { ...LEGAL_DEFAULTS, ...stripEmpty(stored), ...legalFromEnv() },
  };
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as Partial<T>;
}

/* ─────────────────────────── feeds for machines ─────────────────────────── */

/** Google News sitemap: articles from the last 48 hours. */
export async function getNewsSitemapEntries(): Promise<Array<{ slug: string; title: string; publishedAt: string }>> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  const cards = await listCards({ limit: 500 });
  const now = Date.now();
  return cards
    .filter((c) => now - new Date(c.publishedAt).getTime() < 48 * 3_600_000)
    .map((c) => ({ slug: c.slug, title: c.title, publishedAt: c.publishedAt }));
}

export async function getSitemapEntries(): Promise<{
  articles: Array<{ slug: string; updatedAt: string }>;
  stories: Array<{ slug: string; updatedAt: string | null }>;
}> {
  "use cache";
  cacheLife("river");
  cacheTag(T.feed);
  const a = await db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(published)
    .orderBy(desc(articles.publishedAt))
    .limit(5000);
  const s = await db
    .select({ slug: stories.slug, updatedAt: stories.lastPublishedAt })
    .from(stories)
    .where(gt(stories.articleCount, 0))
    .limit(1000);
  return {
    articles: a.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() })),
    stories: s.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt?.toISOString() ?? null })),
  };
}
