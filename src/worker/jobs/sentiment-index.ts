import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { marketMetrics, sentimentSnapshots, siteSettings } from "@/db/schema";
import { T } from "@/lib/cache-tags";
import {
  MIN_POSTS_ASSET,
  METHOD,
  PRIORS,
  WEIGHTS,
  combine,
  confidence,
  marketComponent,
  scoreFromZ,
  socialAggregate,
  topKeywords,
  type Component,
  type Group,
  type MarketInput,
  type PostIn,
} from "@/sentiment/compute";
import { extractAssets } from "@/ingest/classify";
import { KNOWN_ASSETS } from "@/sentiment/llm";
import { robustZ, rollingChange, rollingVol, smooth } from "@/sentiment/stats";
import type { Job } from "../jobs";

/**
 * Hourly (at :05) index and per-asset readings from the last 24 h of scored
 * posts plus market positioning. Rows are shadow rows until the newsroom makes
 * the index public (site_settings "sentiment").
 */

const HOUR = 3_600_000;
const GROUP_OF: Record<string, Group> = { "html.list": "국내 커뮤니티", "telegram.channel": "텔레그램", "telegram.bot": "텔레그램", "x.accounts": "X" };
const MARKET_SYMBOL: Record<string, string> = { index: "BTC", "asset:BTC": "BTC", "asset:ETH": "ETH" };

interface PostRow extends Record<string, unknown> {
  stance: number;
  engagement: PostIn["engagement"];
  assets: string[];
  scored_by: string | null;
  text: string | null;
  trust_tier: number;
  adapter: string;
}

export async function sentimentSettings(): Promise<{ public: boolean }> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "sentiment") });
  return { public: Boolean((row?.value as { public?: boolean } | undefined)?.public) };
}

/** Hourly series of one metric (averaged over providers), oldest first. */
function hourly(rows: Array<{ metric: string; at: Date; value: number }>, metric: string): Array<[number, number]> {
  const by = new Map<number, number[]>();
  for (const r of rows) {
    if (r.metric !== metric) continue;
    const h = Math.floor(r.at.getTime() / HOUR) * HOUR;
    by.set(h, [...(by.get(h) ?? []), r.value]);
  }
  return [...by]
    .map(([h, v]) => [h, v.reduce((a, b) => a + b, 0) / v.length] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

async function marketInputs(symbol: string, at: number): Promise<MarketInput[]> {
  const rows = await db
    .select({ metric: marketMetrics.metric, at: marketMetrics.at, value: marketMetrics.value })
    .from(marketMetrics)
    .where(and(eq(marketMetrics.symbol, symbol), gt(marketMetrics.at, new Date(at - 31 * 24 * HOUR))));
  const inputs: MarketInput[] = [];
  const latest = (series: Array<[number, number]>, maxAgeH: number) => {
    const last = series[series.length - 1];
    return last && at - last[0] <= maxAgeH * HOUR ? last[1] : undefined;
  };
  for (const [metric, name, sign] of [
    ["funding_rate", "funding_rate", 1],
    ["long_short_ratio", "long_short_ratio", 1],
    ["kimchi_premium", "kimchi_premium", 1],
  ] as const) {
    const s = hourly(rows, metric);
    const v = latest(s, 3);
    if (v !== undefined) inputs.push({ name, value: v, history: s.slice(0, -1).map(([, x]) => x), sign });
  }
  const oi = hourly(rows, "open_interest_usd");
  if (latest(oi, 3) !== undefined && oi.length > 24) {
    const changes = rollingChange(oi.map(([, x]) => x), 24);
    inputs.push({ name: "oi_change_24h", value: changes[changes.length - 1], history: changes.slice(0, -1), sign: 1 });
  }
  const close = hourly(rows, "close_1h");
  if (latest(close, 3) !== undefined && close.length > 25) {
    const prices = close.map(([, x]) => x);
    const ret = rollingChange(prices, 24);
    inputs.push({ name: "return_24h", value: ret[ret.length - 1], history: ret.slice(0, -1), sign: 1 });
    const vol = rollingVol(prices, 24);
    if (vol.length) inputs.push({ name: "volatility_24h", value: vol[vol.length - 1], history: vol.slice(0, -1), sign: -1 });
  }
  return inputs;
}

export const sentimentIndexJob: Job = {
  name: "sentiment.index",
  everySec: 3600,
  offsetSec: 300,
  async run(now) {
    const at = Math.floor(now.getTime() / HOUR) * HOUR;
    const { public: isPublic } = await sentimentSettings();
    const shadow = !isPublic;

    const posts = await db.execute<PostRow>(sql`
      select p.stance, p.engagement, p.assets, p.scored_by, p.text, s.trust_tier, s.adapter
      from social_posts p join feed_sources s on s.id = p.source_id
      where p.posted_at > ${new Date(at - 24 * HOUR).toISOString()}::timestamptz and p.posted_at <= ${new Date(at).toISOString()}::timestamptz
        and p.stance is not null and p.label is distinct from 'off_topic' and s.is_sample = false`);
    const all: Array<PostIn & { assets: string[] }> = posts.map((p) => ({
      group: GROUP_OF[p.adapter] ?? "국내 커뮤니티",
      trustTier: p.trust_tier,
      stance: Number(p.stance),
      engagement: p.engagement ?? {},
      llm: Boolean(p.scored_by && p.scored_by !== "lexicon-v1"),
      text: p.text,
      assets: p.assets ?? [],
    }));

    const history = await db
      .select({ scope: sentimentSnapshots.scopeKey, at: sentimentSnapshots.at, score: sentimentSnapshots.score, volume: sentimentSnapshots.volume, components: sentimentSnapshots.components })
      .from(sentimentSnapshots)
      .where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.method, METHOD), gt(sentimentSnapshots.at, new Date(at - 30 * 24 * HOUR))))
      .orderBy(sentimentSnapshots.at);

    const counts = new Map<string, number>();
    for (const p of all) for (const a of p.assets) counts.set(a, (counts.get(a) ?? 0) + 1);
    const scopes = [
      { key: "index", label: "NWM 센티먼트 인덱스", posts: all },
      ...[...counts]
        .filter(([id, n]) => n >= MIN_POSTS_ASSET && KNOWN_ASSETS[id] && id !== "CRYPTO" && id !== "KR-EQ")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([id]) => ({ key: `asset:${id}`, label: KNOWN_ASSETS[id], posts: all.filter((p) => p.assets.includes(id)) })),
    ];

    let written = 0;
    const notes: string[] = [];
    for (const scope of scopes) {
      if (scope.posts.length < MIN_POSTS_ASSET) {
        notes.push(`${scope.key}: ${scope.posts.length} posts — skipped`);
        continue;
      }
      const past = history.filter((h) => h.scope === scope.key && h.at.getTime() < at);
      const soc = socialAggregate(scope.posts);
      const socZ = robustZ(soc.raw, past.map((h) => Number((h.components as { social?: { raw?: number } }).social?.raw)), PRIORS.social);
      const social: Component = { z: socZ.z, weight: WEIGHTS.social, mature: socZ.mature, detail: { raw: round(soc.raw, 4) } };

      const symbol = MARKET_SYMBOL[scope.key];
      const market = symbol ? marketComponent(await marketInputs(symbol, at)) : null;

      const volHist = past.map((h) => h.volume);
      let attention: Component | null = null;
      if (volHist.length >= 24) {
        const vz = robustZ(soc.volume, volHist, PRIORS.volume);
        attention = { z: vz.z * Math.sign(soc.raw || 0), weight: WEIGHTS.attention, mature: vz.mature, detail: { volume: soc.volume, z: round(vz.z, 3) } };
      }

      const { z, coverage } = combine({ social, market, attention });
      const raw = scoreFromZ(z);
      const prev = past[past.length - 1];
      const score = round(smooth(prev?.score, raw, prev ? (at - prev.at.getTime()) / HOUR : Infinity), 1);
      const dayAgo = [...past].reverse().find((h) => at - h.at.getTime() >= 23 * HOUR);
      const parts = [social, market, attention].filter(Boolean) as Component[];
      const conf = confidence(soc.volume, coverage, parts.filter((c) => c.mature).length / parts.length);
      const assetNames = Object.values(KNOWN_ASSETS);

      await db.transaction(async (tx) => {
        await tx
          .delete(sentimentSnapshots)
          .where(and(eq(sentimentSnapshots.scopeKey, scope.key), eq(sentimentSnapshots.at, new Date(at)), eq(sentimentSnapshots.isSample, false)));
        await tx.insert(sentimentSnapshots).values({
          scopeKey: scope.key,
          label: scope.label,
          at: new Date(at),
          score,
          change24h: dayAgo ? round(score - dayAgo.score, 1) : 0,
          bullish: soc.bullish,
          bearish: soc.bearish,
          volume: soc.volume,
          sources: soc.groups.map((g) => ({ name: g.name, score: g.score, share: g.share })),
          keywords: topKeywords(scope.posts.map((p) => p.text ?? ""), 8, assetNames, (w) => extractAssets(w).length > 0),
          components: {
            social: { raw: round(soc.raw, 4), z: round(social.z, 3), mature: social.mature },
            market: market ? { z: round(market.z, 3), mature: market.mature, ...market.detail } : null,
            attention: attention ? { z: round(attention.z, 3), mature: attention.mature, ...attention.detail } : null,
            Z: round(z, 3),
            coverage: round(coverage, 2),
            rawScore: raw,
            llmShare: round(scope.posts.filter((p) => p.llm).length / scope.posts.length, 3),
          },
          confidence: conf,
          method: METHOD,
          shadow,
          isSample: false,
        });
      });
      written++;
      notes.push(`${scope.key} ${score} (n=${soc.volume}, conf ${conf})`);
    }
    return { inserted: written, note: notes.join("; ") || "no scopes", tags: !shadow && written ? [T.sentiment] : [] };
  },
};

function round(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
