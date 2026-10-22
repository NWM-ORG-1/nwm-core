import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, candidateItems, candidates, feedItems, feedSources, stories } from "@/db/schema";
import { AUTO_LEGAL_NOTE, createAutoCandidate } from "@/server/auto/create";
import { runAutoArticles } from "@/server/auto/run";
import { AUTO_DEFAULTS, type AutoSettings } from "@/server/auto/settings";
import { blockingFailures, draftHash, runChecks } from "@/server/checks";
import { buildExchangeEvent } from "@/server/generator/data-templates";

/** Needs Postgres (DATABASE_URL); CI provides one. Creates and removes its own rows. */
const enabled = Boolean(process.env.DATABASE_URL);
const PREFIX = "itest-auto-";
const KEY = `itest:${Date.now()}`;

const sampleDraft = () =>
  buildExchangeEvent({ exchange: "upbit", change: "listed", markets: [{ market: "KRW-ITSA", coin: "ITSA", quote: "KRW", name: "아이테스트" }], at: new Date() })!;

let storyExisted = false;

async function cleanup() {
  const mine = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(sql`${candidates.generator}->>'key' like ${"itest:%"} or ${candidates.draft}->>'title' like ${"%아이테스트%"}`);
  const ids = mine.map((c) => c.id);
  if (ids.length) {
    await db.delete(activityLog).where(inArray(activityLog.entityId, ids));
    await db.delete(candidates).where(inArray(candidates.id, ids));
  }
  await db.delete(feedSources).where(like(feedSources.slug, `${PREFIX}%`));
  if (!storyExisted) {
    // the series story only if this test made it and nothing else uses it
    await db.execute(sql`delete from stories s where s.slug = 'auto-exchange-markets'
      and not exists (select 1 from candidates c where c.story_id = s.id) and not exists (select 1 from articles a where a.story_id = s.id)`);
  }
}

const allOff = Object.fromEntries(Object.entries(AUTO_DEFAULTS).map(([k, v]) => [k, { ...v, mode: "off" }])) as AutoSettings;

describe("automatic articles", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(async () => {
    storyExisted = Boolean(await db.query.stories.findFirst({ where: eq(stories.slug, "auto-exchange-markets") }));
    await cleanup();
  });
  after(async () => {
    await cleanup();
    await closeDb();
  });

  it("makes a candidate once per key, in its series story", async () => {
    const now = new Date();
    const draft = sampleDraft();
    const first = await createAutoCandidate(db, { template: "exchange_listed", draft, mode: "review", key: `${KEY}:a`, now });
    assert.equal(first?.status, "review");
    const again = await createAutoCandidate(db, { template: "exchange_listed", draft, mode: "review", key: `${KEY}:a`, now });
    assert.equal(again, null, "the same key never makes a second candidate");

    const row = await db.query.candidates.findFirst({ where: eq(candidates.id, first!.id) });
    assert.equal(row!.mode, "data_auto");
    assert.equal(row!.generator?.id, "template:exchange_listed");
    assert.equal(row!.generator?.key, `${KEY}:a`);
    assert.deepEqual(row!.checks, [], "review mode leaves the legal check to an editor");
    const story = await db.query.stories.findFirst({ where: eq(stories.id, row!.storyId!) });
    assert.equal(story?.slug, "auto-exchange-markets");
  });

  it("auto mode schedules it now with the legal sign-off bound to the draft", async () => {
    const now = new Date();
    const draft = sampleDraft();
    const r = await createAutoCandidate(db, { template: "exchange_listed", draft, mode: "auto", key: `${KEY}:b`, now });
    assert.equal(r?.status, "scheduled");
    const row = await db.query.candidates.findFirst({ where: eq(candidates.id, r!.id) });
    assert.equal(row!.status, "scheduled");
    assert.equal(row!.scheduledAt?.getTime(), now.getTime());
    assert.equal(row!.scheduledById, null);
    // bound to the draft as stored (jsonb reorders keys), which is what publishing hashes
    assert.deepEqual(row!.checks, [{ id: "legal", ok: true, blocking: true, message: AUTO_LEGAL_NOTE, draftHash: draftHash(row!.draft) }]);
    const checks = runChecks({ draft: row!.draft, mode: "data_auto", items: [], recentTitles: [], previous: row!.checks, editorName: null });
    assert.deepEqual(blockingFailures(checks), [], "nothing blocks the scheduler from publishing it");
  });

  it("turns waiting exchange changes into one article per exchange run", async () => {
    const [src] = await db
      .insert(feedSources)
      .values({ slug: `${PREFIX}upbit`, name: "itest upbit", kind: "api", adapter: "exchange.markets", config: { exchange: "upbit" }, beats: ["crypto"], trustTier: 1, status: "paused" })
      .returning();
    const fetchedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 5_000);
    const item = (coin: string, name: string, change: string) => ({
      sourceId: src.id,
      externalId: `upbit:KRW-${coin}:${change}:${fetchedAt.toISOString()}`,
      contentHash: `${coin}${change}`,
      title: `업비트 신규 거래지원: ${name}(${coin}) KRW 마켓`,
      summary: "",
      payload: { exchange: "upbit", market: `KRW-${coin}`, change, coin, quote: "KRW", name },
      fetchedAt,
    });
    const rows = await db
      .insert(feedItems)
      .values([item("ITSA", "아이테스트", "listed"), item("ITSB", "아이테스트비", "listed"), item("ITSC", "아이테스트씨", "warning")])
      .returning({ id: feedItems.id, payload: feedItems.payload });

    const settings: AutoSettings = { ...allOff, exchange_listed: { mode: "review" } };
    const r = await runAutoArticles(db, new Date(), settings);
    const mine = r.created.filter((c) => c.title.includes("아이테스트"));
    assert.equal(mine.length, 1, JSON.stringify(r));
    assert.equal(mine[0].title, "업비트, 2종 거래지원… 아이테스트·아이테스트비");

    const linked = await db.select().from(candidateItems).where(eq(candidateItems.candidateId, mine[0].id));
    assert.equal(linked.length, 2);
    const items = await db.select({ status: feedItems.status, payload: feedItems.payload }).from(feedItems).where(eq(feedItems.sourceId, src.id));
    const status = Object.fromEntries(items.map((i) => [(i.payload as { coin: string }).coin, i.status]));
    assert.deepEqual(status, { ITSA: "promoted", ITSB: "promoted", ITSC: "new" }, "the warning type is off, so its item stays in the inbox");

    const second = await runAutoArticles(db, new Date(), settings);
    assert.equal(second.created.filter((c) => c.title.includes("아이테스트")).length, 0, "nothing twice");
    assert.ok(rows.length === 3);
    const log = await db.select().from(activityLog).where(and(eq(activityLog.entityId, mine[0].id), eq(activityLog.kind, "draft")));
    assert.equal(log.length, 1);
  });
});
