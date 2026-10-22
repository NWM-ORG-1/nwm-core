import { and, asc, desc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { feedItems, feedSources, marketMetrics, marketQuotes, sentimentSnapshots, siteSettings } from "@/db/schema";
import type {
  Exchange,
  ExchangeChange,
  ExchangeMarket,
  MarketInputs,
  MetricReading,
  TemplateQuote,
  TemplateSentiment,
} from "../generator/data-templates";

/**
 * Inputs for the data templates, read the same way by the worker and the
 * newsroom. Only live readings count: seeded sample quotes and stale values
 * never reach an article.
 */

type Q = Pick<DB, "select" | "query">;
const HOUR = 3_600_000;

/** Live quotes no older than `maxAgeMin`. */
export async function liveQuotes(db: Q, now: Date, maxAgeMin = 120): Promise<(TemplateQuote & { asOf: Date; source: string })[]> {
  const rows = await db
    .select({
      symbol: marketQuotes.symbol,
      name: marketQuotes.name,
      price: marketQuotes.price,
      changePct: marketQuotes.changePct,
      currency: marketQuotes.currency,
      asOf: marketQuotes.asOf,
      source: marketQuotes.source,
    })
    .from(marketQuotes)
    .where(and(ne(marketQuotes.source, "mock"), gt(marketQuotes.asOf, new Date(now.getTime() - maxAgeMin * 60_000)), lte(marketQuotes.asOf, new Date(now.getTime() + 60_000))));
  return rows;
}

/** Latest value of a metric (any provider) within `maxAgeH`, with the value about 24 h before it. */
export async function metricReading(db: Q, metric: string, symbol: string, now: Date, maxAgeH: number): Promise<MetricReading | undefined> {
  const [latest] = await db
    .select({ value: marketMetrics.value, at: marketMetrics.at, source: marketMetrics.source })
    .from(marketMetrics)
    .where(and(eq(marketMetrics.metric, metric), eq(marketMetrics.symbol, symbol), gt(marketMetrics.at, new Date(now.getTime() - maxAgeH * HOUR)), lte(marketMetrics.at, now)))
    .orderBy(desc(marketMetrics.at))
    .limit(1);
  if (!latest) return undefined;
  const [before] = await db
    .select({ value: marketMetrics.value })
    .from(marketMetrics)
    .where(
      and(
        eq(marketMetrics.metric, metric),
        eq(marketMetrics.symbol, symbol),
        eq(marketMetrics.source, latest.source),
        gte(marketMetrics.at, new Date(latest.at.getTime() - 26 * HOUR)),
        lte(marketMetrics.at, new Date(latest.at.getTime() - 22 * HOUR)),
      ),
    )
    .orderBy(desc(marketMetrics.at))
    .limit(1);
  return { value: latest.value, at: latest.at, source: latest.source, ...(before ? { dayAgo: before.value } : {}) };
}

export interface HourlyClose {
  /** when the hour ended */
  end: Date;
  value: number;
}

/** Binance hourly closes of the last `hours`, oldest first. */
export async function hourlyCloses(db: Q, symbol: string, now: Date, hours = 26): Promise<HourlyClose[]> {
  const rows = await db
    .select({ at: marketMetrics.at, value: marketMetrics.value })
    .from(marketMetrics)
    .where(and(eq(marketMetrics.metric, "close_1h"), eq(marketMetrics.symbol, symbol), eq(marketMetrics.source, "binance"), gt(marketMetrics.at, new Date(now.getTime() - (hours + 1) * HOUR))))
    .orderBy(asc(marketMetrics.at));
  return rows.map((r) => ({ end: new Date(r.at.getTime() + HOUR), value: r.value })).filter((r) => r.end.getTime() <= now.getTime());
}

export async function marketInputs(db: Q, now: Date): Promise<MarketInputs> {
  // derivatives come from Bybit or Binance futures, whichever reported last (the other may be geo-blocked)
  const [quotes, kimchi, funding, longShort, fearGreed, btcHourly] = await Promise.all([
    liveQuotes(db, now),
    metricReading(db, "kimchi_premium", "BTC", now, 2),
    metricReading(db, "funding_rate", "BTC", now, 12),
    metricReading(db, "long_short_ratio", "BTC", now, 12),
    metricReading(db, "fear_greed", "CRYPTO", now, 36),
    hourlyCloses(db, "BTC", now),
  ]);
  return {
    quotes,
    metrics: {
      ...(kimchi ? { kimchi } : {}),
      ...(funding ? { funding } : {}),
      ...(longShort ? { longShort } : {}),
      ...(fearGreed ? { fearGreed } : {}),
    },
    hourly: { BTC: btcHourly.map((h) => h.value) },
  };
}

/** Latest published (non-shadow) sentiment per scope, or null while the index is not public. */
export async function publicSentiment(db: Q): Promise<TemplateSentiment[] | null> {
  const setting = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "sentiment") });
  if (!(setting?.value as { public?: boolean } | undefined)?.public) return null;
  const rows = await db
    .select()
    .from(sentimentSnapshots)
    .where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.shadow, false), gt(sentimentSnapshots.at, sql`now() - interval '6 hours'`)))
    .orderBy(desc(sentimentSnapshots.at));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.scopeKey)) latest.set(r.scopeKey, r);
  return [...latest.values()].map((r) => ({
    scopeKey: r.scopeKey,
    label: r.label,
    score: r.score,
    change24h: r.change24h,
    bullish: r.bullish,
    bearish: r.bearish,
    volume: r.volume,
    sources: r.sources,
    keywords: r.keywords,
  }));
}

export interface ExchangeEventGroup {
  exchange: Exchange;
  change: ExchangeChange;
  /** minute the change was seen (one adapter run) */
  at: Date;
  markets: ExchangeMarket[];
  itemIds: string[];
}

const CHANGES: ExchangeChange[] = ["listed", "delisted", "warning", "warning_lifted"];

/**
 * Exchange market changes still waiting in the inbox (not promoted or
 * dismissed by an editor), grouped per exchange, change and adapter run.
 */
export async function exchangeEvents(db: Q, now: Date, lookbackMin = 120): Promise<ExchangeEventGroup[]> {
  const rows = await db
    .select({ id: feedItems.id, payload: feedItems.payload, title: feedItems.title, fetchedAt: feedItems.fetchedAt })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(
      and(
        eq(feedSources.adapter, "exchange.markets"),
        eq(feedSources.isSample, false),
        eq(feedItems.status, "new"),
        gt(feedItems.fetchedAt, new Date(now.getTime() - lookbackMin * 60_000)),
        inArray(sql<string>`${feedItems.payload}->>'change'`, CHANGES),
      ),
    )
    .orderBy(asc(feedItems.fetchedAt));
  const groups = new Map<string, ExchangeEventGroup>();
  for (const r of rows) {
    const p = r.payload as { exchange?: string; change?: string; market?: string; name?: string; coin?: string; quote?: string };
    if ((p.exchange !== "upbit" && p.exchange !== "bithumb") || !p.market || !CHANGES.includes(p.change as ExchangeChange)) continue;
    const [quote, coin] = p.market.split("-");
    // older items carry the name only in the title: "업비트 신규 거래지원: 뉴코인(NEWC) KRW 마켓"
    const name = p.name ?? /:\s*(.+?)\((?:[A-Z0-9]+)\)/.exec(r.title)?.[1] ?? null;
    const at = new Date(Math.floor(r.fetchedAt.getTime() / 60_000) * 60_000);
    const key = `${p.exchange}:${p.change}:${at.toISOString()}`;
    const g = groups.get(key) ?? { exchange: p.exchange, change: p.change as ExchangeChange, at, markets: [], itemIds: [] };
    g.markets.push({ market: p.market, coin: p.coin ?? coin, quote: p.quote ?? quote, name });
    g.itemIds.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** KRW markets each exchange lists right now, from the market watchers' last snapshot. */
export async function listedMarkets(db: Q): Promise<Partial<Record<Exchange, Set<string>>>> {
  const rows = await db
    .select({ config: feedSources.config, state: feedSources.state })
    .from(feedSources)
    .where(and(eq(feedSources.adapter, "exchange.markets"), eq(feedSources.isSample, false)));
  const out: Partial<Record<Exchange, Set<string>>> = {};
  for (const r of rows) {
    const ex = (r.config as { exchange?: string }).exchange;
    const markets = (r.state as { markets?: Record<string, unknown> }).markets;
    if ((ex === "upbit" || ex === "bithumb") && markets) out[ex] = new Set(Object.keys(markets).filter((m) => m.startsWith("KRW-")));
  }
  return out;
}
