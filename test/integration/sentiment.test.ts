import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { feedSources, marketMetrics, sentimentSnapshots, socialPosts } from "@/db/schema";
import { extractAssets } from "@/ingest/classify";
import { sentimentIndexJob } from "@/worker/jobs/sentiment-index";
import { sentimentScoreJob } from "@/worker/jobs/sentiment-score";

const enabled = Boolean(process.env.DATABASE_URL);
const SLUG = "itest-sentiment";
const HOUR = 3_600_000;

async function cleanup() {
  await db.delete(feedSources).where(like(feedSources.slug, `${SLUG}%`));
  await db.delete(sentimentSnapshots).where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.method, "v1"), inArray(sentimentSnapshots.scopeKey, ["index", "asset:BTC"])));
  await db.delete(marketMetrics).where(eq(marketMetrics.source, "itest"));
}

describe("sentiment jobs", { skip: !enabled && "DATABASE_URL not set" }, () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  before(async () => {
    delete process.env.ANTHROPIC_API_KEY; // lexicon path
    await cleanup();
  });
  after(async () => {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    await cleanup();
    await closeDb();
  });

  it("scores new posts, then writes shadow index and asset rows", async () => {
    const now = new Date();
    const [src] = await db.insert(feedSources).values({ slug: SLUG, name: "test board", kind: "scrape", adapter: "html.list", trustTier: 4, config: { llmConsent: true } }).returning();
    const titles = [
      ...Array.from({ length: 18 }, (_, i) => `비트 가즈아 ${i} 반감기 온다`),
      ...Array.from({ length: 6 }, (_, i) => `비트 떡락 ${i} 물렸다`),
      ...Array.from({ length: 6 }, (_, i) => `점심 메뉴 추천 ${i}`),
    ];
    await db.insert(socialPosts).values(
      titles.map((t, i) => ({ sourceId: src.id, externalId: `p${i}`, text: t, postedAt: new Date(now.getTime() - (i + 1) * 20 * 60_000), assets: extractAssets(t), llmOk: true, engagement: { views: 50 + i } })),
    );
    // hourly BTC closes for the market component
    const closes = Array.from({ length: 30 }, (_, i) => ({ metric: "close_1h", symbol: "BTC", source: "itest", at: new Date(Math.floor(now.getTime() / HOUR) * HOUR - (30 - i) * HOUR), value: 80000 + i * 100 }));
    await db.insert(marketMetrics).values(closes);

    const scored = await sentimentScoreJob.run(now);
    assert.equal(scored.updated, 30);
    assert.match(scored.note!, /30 by lexicon/);
    const [p] = await db.select().from(socialPosts).where(and(eq(socialPosts.sourceId, src.id), eq(socialPosts.externalId, "p0")));
    assert.equal(p.label, "bull");
    assert.deepEqual(p.assets, ["BTC"]);

    const res = await sentimentIndexJob.run(now);
    assert.match(res.note!, /index/);
    assert.deepEqual(res.tags, []); // shadow: nothing to refresh on the site
    const rows = await db.select().from(sentimentSnapshots).where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.method, "v1")));
    const index = rows.find((r) => r.scopeKey === "index")!;
    assert.ok(index, "index row");
    assert.equal(index.shadow, true);
    // the reading for hour H counts posts in (H−24h, H] from every real source (a dev database may hold more than ours)
    const hourStart = Math.floor(now.getTime() / HOUR) * HOUR;
    const [{ n }] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from social_posts p join feed_sources s on s.id = p.source_id
      where s.is_sample = false and p.stance is not null and p.label is distinct from 'off_topic'
        and p.posted_at > ${new Date(hourStart - 24 * HOUR).toISOString()}::timestamptz and p.posted_at <= ${new Date(hourStart).toISOString()}::timestamptz`);
    assert.equal(index.volume, n);
    assert.ok((index.components as { market?: unknown }).market, "market component from BTC closes");
    const ours = titles.filter((_, i) => now.getTime() - (i + 1) * 20 * 60_000 <= hourStart).length;
    if (n === ours) {
      // only our posts: the bullish majority and the topic must show
      assert.ok(index.score > 0, `score ${index.score}`);
      assert.ok(index.bullish > index.bearish);
      assert.ok(index.keywords.includes("반감기"));
      assert.ok(!index.keywords.includes("비트"), "instrument names are not keywords");
    }
    assert.ok(rows.some((r) => r.scopeKey === "asset:BTC"), "BTC has ≥ 20 posts");

    // the hour is recomputed in place, not duplicated
    await sentimentIndexJob.run(now);
    const again = await db.select().from(sentimentSnapshots).where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.scopeKey, "index")));
    assert.equal(again.length, 1);
  });
});
