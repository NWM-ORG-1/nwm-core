import { and, gt, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { feedItems, marketMetrics, marketQuotes, socialPosts, type Beat } from "@/db/schema";
import { extractAssets, guessBeat, scoreItem } from "@/ingest/classify";
import { clip, oneLine, sha } from "@/ingest/text";
import type { AdapterResult, IngestItem } from "@/ingest/types";

/** Writes one adapter result. Idempotent: re-running a source never duplicates rows. */

type Tx = Pick<DB, "insert" | "select" | "execute">;

export interface PersistSource {
  id: string;
  beats: Beat[];
  trustTier: number;
  signalOnly: boolean;
  lang: string;
  licRetentionDays: number | null;
  config: Record<string, unknown>;
}

export interface Counts {
  seen: number;
  inserted: number;
  updated: number;
}

const CHUNK = 200;

/** Same story from another source within three days is a duplicate. */
export function titleKey(title: string): string {
  return sha(title.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""));
}

export async function persistResult(tx: Tx, src: PersistSource, r: AdapterResult, now: Date): Promise<Counts> {
  const c: Counts = { seen: 0, inserted: 0, updated: 0 };
  add(c, await persistItems(tx, src, r.items ?? [], now));
  add(c, await persistPosts(tx, src, r.posts ?? [], now));
  add(c, await persistQuotes(tx, r.quotes ?? []));
  add(c, await persistMetrics(tx, r.metrics ?? []));
  return c;
}

function add(a: Counts, b: Counts) {
  a.seen += b.seen;
  a.inserted += b.inserted;
  a.updated += b.updated;
}

async function persistItems(tx: Tx, src: PersistSource, items: IngestItem[], now: Date): Promise<Counts> {
  const c: Counts = { seen: items.length, inserted: 0, updated: 0 };
  if (!items.length) return c;
  const boost = Array.isArray(src.config.boost) ? (src.config.boost as unknown[]).filter((w): w is string => typeof w === "string") : undefined;

  // one row per external id (feeds sometimes repeat an entry)
  const unique = [...new Map(items.map((i) => [i.externalId, i])).values()];
  const keys = unique.map((i) => titleKey(i.title));
  const dupes = new Map<string, string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const rows = await tx
      .select({ id: feedItems.id, hash: feedItems.contentHash })
      .from(feedItems)
      .where(
        and(inArray(feedItems.contentHash, keys.slice(i, i + CHUNK)), ne(feedItems.sourceId, src.id), gt(feedItems.fetchedAt, new Date(now.getTime() - 3 * 86_400_000))),
      );
    for (const r of rows) if (!dupes.has(r.hash)) dupes.set(r.hash, r.id);
  }

  const defaultExpiry = src.licRetentionDays ? new Date(now.getTime() + src.licRetentionDays * 86_400_000) : null;
  const rows = unique.map((i, n) => {
    const title = clip(oneLine(i.title), 300) || "(제목 없음)";
    const summary = clip(i.summary ?? "", 2000);
    const dupOf = dupes.get(keys[n]);
    return {
      sourceId: src.id,
      externalId: i.externalId.slice(0, 500),
      contentHash: keys[n],
      url: i.url ?? null,
      title,
      summary,
      lang: i.lang ?? src.lang,
      payload: dupOf ? { ...i.payload, dupOf } : (i.payload ?? {}),
      entities: (i.entities ?? extractAssets(`${title} ${summary.slice(0, 400)}`)).slice(0, 16),
      beatGuess: i.beatGuess ?? guessBeat(title, summary, src.beats),
      score: scoreItem({
        trustTier: src.trustTier,
        signalOnly: src.signalOnly,
        weight: i.weight,
        title,
        publishedAt: i.publishedAt,
        boost,
        duplicate: Boolean(dupOf),
        now,
      }),
      publishedAt: i.publishedAt ?? null,
      fetchedAt: now,
      expiresAt: i.expiresAt ?? defaultExpiry,
    };
  });

  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await tx
      .insert(feedItems)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [feedItems.sourceId, feedItems.externalId],
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          url: sql`excluded.url`,
          payload: sql`excluded.payload`,
          contentHash: sql`excluded.content_hash`,
          entities: sql`excluded.entities`,
          publishedAt: sql`coalesce(excluded.published_at, ${feedItems.publishedAt})`,
        },
        // untouched rows are not rewritten (and not returned)
        setWhere: sql`${feedItems.title} is distinct from excluded.title or ${feedItems.summary} is distinct from excluded.summary or ${feedItems.url} is distinct from excluded.url`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) c.inserted++;
      else c.updated++;
    }
  }
  return c;
}

async function persistPosts(tx: Tx, src: PersistSource, posts: NonNullable<AdapterResult["posts"]>, now: Date): Promise<Counts> {
  const c: Counts = { seen: posts.length, inserted: 0, updated: 0 };
  if (!posts.length) return c;
  const llmOk = src.config.llmConsent !== false;
  const unique = [...new Map(posts.map((p) => [p.externalId, p])).values()];
  const rows = unique.map((p) => ({
    sourceId: src.id,
    externalId: p.externalId.slice(0, 300),
    url: p.url ?? null,
    author: p.author ? p.author.slice(0, 80) : null,
    text: clip(p.text, 1500),
    lang: p.lang ?? src.lang,
    postedAt: p.postedAt,
    fetchedAt: now,
    engagement: p.engagement ?? {},
    assets: (p.assets ?? extractAssets(p.text)).slice(0, 8),
    llmOk,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await tx
      .insert(socialPosts)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [socialPosts.sourceId, socialPosts.externalId],
        set: { engagement: sql`excluded.engagement` },
        setWhere: sql`${socialPosts.engagement} is distinct from excluded.engagement`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) c.inserted++;
      else c.updated++;
    }
  }
  return c;
}

async function persistQuotes(tx: Tx, quotes: NonNullable<AdapterResult["quotes"]>): Promise<Counts> {
  const c: Counts = { seen: quotes.length, inserted: 0, updated: 0 };
  for (const q of quotes) {
    if (!Number.isFinite(q.price) || !Number.isFinite(q.changePct)) continue;
    const spark = q.spark?.filter(Number.isFinite).slice(-48);
    const [r] = await tx
      .insert(marketQuotes)
      .values({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        changePct: q.changePct,
        currency: q.currency,
        spark: spark ?? [],
        asOf: q.asOf,
        source: q.source,
        sort: q.sort ?? 50,
        inTicker: q.inTicker ?? false,
      })
      .onConflictDoUpdate({
        target: marketQuotes.symbol,
        set: {
          name: sql`excluded.name`,
          price: sql`excluded.price`,
          changePct: sql`excluded.change_pct`,
          currency: sql`excluded.currency`,
          spark: spark?.length ? sql`excluded.spark` : sql`${marketQuotes.spark}`,
          asOf: sql`excluded.as_of`,
          source: sql`excluded.source`,
        },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    if (r?.inserted) c.inserted++;
    else if (r) c.updated++;
  }
  return c;
}

async function persistMetrics(tx: Tx, metrics: NonNullable<AdapterResult["metrics"]>): Promise<Counts> {
  const c: Counts = { seen: metrics.length, inserted: 0, updated: 0 };
  const rows = metrics
    .filter((m) => Number.isFinite(m.value))
    .map((m) => ({ metric: m.metric, symbol: m.symbol, source: m.source ?? "unknown", at: m.at, value: m.value }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await tx
      .insert(marketMetrics)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [marketMetrics.metric, marketMetrics.symbol, marketMetrics.source, marketMetrics.at],
        set: { value: sql`excluded.value` },
        setWhere: sql`${marketMetrics.value} is distinct from excluded.value`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) c.inserted++;
      else c.updated++;
    }
  }
  return c;
}
