import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray, like, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { feedItems, feedSources, marketMetrics, marketQuotes, socialPosts } from "@/db/schema";
import { persistResult, type PersistSource } from "@/worker/persist";
import { claimDue, nextDelaySec, releaseLeases } from "@/worker/runner";

/** Needs Postgres (DATABASE_URL); CI provides one. Creates and removes its own rows. */
const enabled = Boolean(process.env.DATABASE_URL);
const PREFIX = "itest-";
const NOW = new Date();

async function makeSource(slug: string, over: Partial<typeof feedSources.$inferInsert> = {}) {
  const [row] = await db
    .insert(feedSources)
    .values({ slug: `${PREFIX}${slug}`, name: slug, kind: "rss", adapter: "rss", beats: ["tech"], trustTier: 2, ...over })
    .returning();
  return row;
}

const asPersist = (s: typeof feedSources.$inferSelect): PersistSource => ({
  id: s.id,
  beats: s.beats,
  trustTier: s.trustTier,
  signalOnly: s.signalOnly,
  lang: s.lang,
  licRetentionDays: s.licRetentionDays,
  config: s.config,
});

async function cleanup() {
  await db.delete(feedSources).where(like(feedSources.slug, `${PREFIX}%`));
  await db.delete(marketQuotes).where(like(marketQuotes.symbol, "ITEST%"));
  await db.delete(marketMetrics).where(eq(marketMetrics.metric, "itest_metric"));
}

describe("worker persistence", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(cleanup);
  after(async () => {
    await cleanup();
    await closeDb();
  });

  it("upserts items idempotently and keeps editorial status on updates", async () => {
    const src = await makeSource("items");
    const items = [
      { externalId: "a", title: "First item", summary: "one", url: "https://x.test/a" },
      { externalId: "b", title: "Second item", summary: "two", url: "https://x.test/b" },
    ];
    const first = await persistResult(db, asPersist(src), { items }, NOW);
    assert.deepEqual([first.inserted, first.updated], [2, 0]);
    const again = await persistResult(db, asPersist(src), { items }, NOW);
    assert.deepEqual([again.inserted, again.updated], [0, 0]);

    await db.update(feedItems).set({ status: "dismissed" }).where(eq(feedItems.externalId, "a"));
    const changed = await persistResult(db, asPersist(src), { items: [{ ...items[0], title: "First item (corrected)" }] }, NOW);
    assert.deepEqual([changed.inserted, changed.updated], [0, 1]);
    const [row] = await db.select().from(feedItems).where(eq(feedItems.externalId, "a"));
    assert.equal(row.title, "First item (corrected)");
    assert.equal(row.status, "dismissed");
  });

  it("marks the same story from another source as a duplicate", async () => {
    const a = await makeSource("dup-a");
    const b = await makeSource("dup-b");
    await persistResult(db, asPersist(a), { items: [{ externalId: "x1", title: "SEC approves spot ETF!" }] }, NOW);
    await persistResult(db, asPersist(b), { items: [{ externalId: "y1", title: "sec approves spot etf" }] }, NOW);
    const [dup] = await db.select().from(feedItems).where(eq(feedItems.sourceId, b.id));
    assert.ok((dup.payload as { dupOf?: string }).dupOf);
    assert.ok(dup.score <= 10);
  });

  it("updates post engagement without touching text", async () => {
    const src = await makeSource("posts", { kind: "scrape", adapter: "html.list", config: { llmConsent: false } });
    const post = { externalId: "p1", text: "비트 가즈아", postedAt: NOW, engagement: { views: 10 } };
    const first = await persistResult(db, asPersist(src), { posts: [post] }, NOW);
    assert.equal(first.inserted, 1);
    const second = await persistResult(db, asPersist(src), { posts: [{ ...post, text: "edited", engagement: { views: 25 } }] }, NOW);
    assert.equal(second.updated, 1);
    const [row] = await db.select().from(socialPosts).where(eq(socialPosts.sourceId, src.id));
    assert.equal(row.text, "비트 가즈아");
    assert.equal(row.engagement.views, 25);
    assert.equal(row.llmOk, false);
    assert.deepEqual(row.assets, ["BTC"]);
  });

  it("quotes keep editor placement and the old sparkline when none is sent", async () => {
    await persistResult(db, asPersist(await makeSource("q")), { quotes: [{ symbol: "ITEST", name: "t", price: 1, changePct: 0, currency: "USD", spark: [1, 2], asOf: NOW, source: "test", sort: 7, inTicker: true }] }, NOW);
    await db.update(marketQuotes).set({ sort: 3, inTicker: false }).where(eq(marketQuotes.symbol, "ITEST"));
    await persistResult(db, asPersist(await makeSource("q2")), { quotes: [{ symbol: "ITEST", name: "t", price: 2, changePct: 100, currency: "USD", asOf: NOW, source: "test", sort: 9, inTicker: true }] }, NOW);
    const [q] = await db.select().from(marketQuotes).where(eq(marketQuotes.symbol, "ITEST"));
    assert.deepEqual([q.price, q.sort, q.inTicker, q.spark], [2, 3, false, [1, 2]]);
  });

  it("metrics upsert by (metric, symbol, source, at)", async () => {
    const src = asPersist(await makeSource("m"));
    const at = new Date("2026-10-21T00:00:00Z");
    const m = { metric: "itest_metric", symbol: "BTC", source: "test", at, value: 1 };
    assert.equal((await persistResult(db, src, { metrics: [m] }, NOW)).inserted, 1);
    assert.equal((await persistResult(db, src, { metrics: [m] }, NOW)).updated, 0);
    assert.equal((await persistResult(db, src, { metrics: [{ ...m, value: 2 }] }, NOW)).updated, 1);
  });

  it("claims due real sources once, never samples, paused or leased ones", async () => {
    const due = await makeSource("due", { nextRunAt: new Date("2000-01-01T00:00:00Z") });
    const paused = await makeSource("paused", { status: "paused", nextRunAt: new Date("2000-01-01T00:00:00Z") });
    const sample = await makeSource("sample", { isSample: true, nextRunAt: new Date("2000-01-01T00:00:00Z") });
    const manual = await makeSource("manual", { adapter: "manual", nextRunAt: new Date("2000-01-01T00:00:00Z") });
    const claimed = await claimDue(25);
    const ids = claimed.map((s) => s.id);
    try {
      assert.ok(ids.includes(due.id));
      for (const s of [paused, sample, manual]) assert.ok(!ids.includes(s.id), s.slug);
      const again = await claimDue(25);
      assert.ok(!again.map((s) => s.id).includes(due.id), "a leased source is not claimed twice");
      await releaseLeases(again.map((s) => s.id));
    } finally {
      await releaseLeases(ids);
    }
    const [row] = await db.select({ lease: feedSources.leaseUntil }).from(feedSources).where(inArray(feedSources.id, [due.id]));
    assert.equal(row.lease, null);
  });

  it("backs off exponentially, honours Retry-After, and caps at six hours", () => {
    assert.equal(nextDelaySec(600, 1), 600);
    assert.equal(nextDelaySec(600, 3), 2400);
    assert.equal(nextDelaySec(60, 2, 900), 900);
    assert.equal(nextDelaySec(600, 20), 6 * 3600);
    const d = nextDelaySec(600, 0);
    assert.ok(d >= 540 && d <= 660);
  });
});

void sql;
