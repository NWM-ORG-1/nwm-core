import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { inArray, like, or } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, feedSources, staff } from "@/db/schema";
import { addSocialSourcesAs, previewSocial, X_MONTHLY_CAP, type AddSocialInput } from "@/server/social-sources";
import { CHANNEL_PAGE, CONTACT_PAGE } from "../fixtures/telegram-pages";

/**
 * 소스 → 텔레그램·X 연결 against Postgres (DATABASE_URL; CI provides one), with
 * t.me and X's embed endpoint faked. Channel and account names start with
 * itest_ so their sources (tg-itest-…, x-itest-…) are this test's alone.
 */
const enabled = Boolean(process.env.DATABASE_URL);
const SLUGS = [like(feedSources.slug, "tg-itest-%"), like(feedSources.slug, "x-itest-%")];

const requested: string[] = [];
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  requested.push(url);
  // t.me names are case-insensitive
  if (url.toLowerCase() === "https://t.me/s/itest_flash_one") return new Response(CHANNEL_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.startsWith("https://t.me/s/")) return new Response(CONTACT_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.startsWith("https://publish.x.com/oembed")) {
    const name = decodeURIComponent(new URL(url).searchParams.get("url") ?? "").split("/").pop();
    return name === "itest_x_none" ? new Response("not found", { status: 404 }) : Response.json({ type: "rich", provider_name: "X" });
  }
  return new Response("unexpected", { status: 500 });
};

let me = { id: "", name: "" } as Parameters<typeof addSocialSourcesAs>[1];
const base: Omit<AddSocialInput, "kind" | "entries"> = { beats: ["crypto"], lang: "ko", trustTier: 2, signalOnly: true, output: ["items"], llmConsent: true };

async function cleanup() {
  const rows = await db.select({ id: feedSources.id }).from(feedSources).where(or(...SLUGS));
  if (rows.length) {
    await db.delete(activityLog).where(inArray(activityLog.entityId, rows.map((r) => r.id)));
    await db.delete(feedSources).where(inArray(feedSources.id, rows.map((r) => r.id)));
  }
  await db.delete(staff).where(like(staff.login, "itest-social-%"));
}

describe("텔레그램·X 연결", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(async () => {
    await cleanup();
    const [s] = await db.insert(staff).values({ login: "itest-social-editor", name: "한서윤", slug: "itest-social-editor", title: "편집자", role: "editor" }).returning();
    me = s;
  });
  after(async () => {
    await cleanup();
    await closeDb();
  });

  it("looks channels up on t.me/s: title, subscribers, latest posts; a contact page cannot be collected", async () => {
    const out = await previewSocial(db, "telegram", ["ITEST_FLASH_ONE", "itest_nobody_here"], { fetchImpl: fakeFetch });
    assert.equal(out[0].status, "ok");
    assert.equal(out[0].name, "Itest_Flash_One", "the channel's own spelling");
    assert.equal(out[0].title, "가상코인속보 & 시황");
    assert.equal(out[0].subscribers, 30_600);
    assert.deepEqual(
      out[0].recent?.map((r) => r.link),
      ["https://t.me/Itest_Flash_One/102", "https://t.me/Itest_Flash_One/101"],
      "newest first",
    );
    assert.equal(out[1].status, "missing");
    assert.match(out[1].error ?? "", /공개 채널이 아니거나/);
  });

  it("adds one source per channel that the worker picks up at once; a paused one comes back, a running one is left alone", async () => {
    const [paused] = await db
      .insert(feedSources)
      .values({ slug: "tg-itest-flash-two", name: "예전 채널", kind: "scrape", adapter: "telegram.channel", status: "paused", config: { channel: "itest_flash_two", output: ["posts"], llmConsent: false, maxPages: 3 } })
      .returning();
    const r = await addSocialSourcesAs(db, me, {
      ...base,
      kind: "telegram",
      entries: [
        { name: "Itest_Flash_One", title: "가상코인속보 & 시황" },
        { name: "itest_flash_two", title: "다른 이름" },
      ],
    });
    assert.deepEqual(r.added.map((a) => a.name), ["가상코인속보 & 시황"]);
    assert.deepEqual(r.resumed.map((a) => a.id), [paused.id]);

    const rows = await db.select().from(feedSources).where(or(...SLUGS));
    const fresh = rows.find((s) => s.slug === "tg-itest-flash-one")!;
    assert.equal(fresh.adapter, "telegram.channel");
    assert.equal(fresh.kind, "scrape");
    assert.equal(fresh.url, "https://t.me/Itest_Flash_One");
    assert.equal(fresh.status, "active");
    assert.equal(fresh.nextRunAt, null, "due now");
    assert.equal(fresh.pollIntervalSec, 120);
    assert.deepEqual(fresh.config, { maxPages: 2, weight: 0.45, channel: "Itest_Flash_One", output: ["items"], llmConsent: true });
    assert.equal(fresh.signalOnly, true);
    assert.deepEqual(fresh.beats, ["crypto"]);
    assert.equal(fresh.licAttribution, "출처: 텔레그램 가상코인속보 & 시황");
    assert.match(fresh.notes, /운영자 동의/);

    const back = rows.find((s) => s.id === paused.id)!;
    assert.equal(back.status, "active");
    assert.equal(back.name, "예전 채널", "the editor's name stays");
    assert.deepEqual(back.config, { maxPages: 3, weight: 0.45, channel: "itest_flash_two", output: ["items"], llmConsent: true }, "options chosen now, its own maxPages kept");

    const again = await addSocialSourcesAs(db, me, { ...base, kind: "telegram", entries: [{ name: "itest_flash_one" }] });
    assert.deepEqual(again.added, []);
    assert.deepEqual(again.skipped.map((s) => s.reason), ["이미 수집 중입니다"]);
    const before = requested.length;
    const [known] = await previewSocial(db, "telegram", ["itest_flash_one"], { fetchImpl: fakeFetch });
    assert.equal(known.existing?.id, fresh.id);
    assert.equal(known.error, undefined);
    assert.equal(requested.length, before, "a channel already collecting is not looked up again");

    const log = await db.select({ summary: activityLog.summary }).from(activityLog).where(inArray(activityLog.entityId, [fresh.id, paused.id]));
    assert.deepEqual(log.map((l) => l.summary).sort(), ["텔레그램 채널 다시 켬: 예전 채널", "텔레그램 채널 연결: 가상코인속보 & 시황"]);
  });

  it("checks X accounts for free and makes billed sources with a monthly cap", async () => {
    const [list] = await db
      .insert(feedSources)
      .values({ slug: "x-itest-list", name: "X 묶음", kind: "api", adapter: "x.accounts", status: "paused", config: { accounts: ["@itest_x_one", "someone_else"] } })
      .returning();
    await db.insert(feedSources).values({ slug: "x-itest-x-two", name: "같은 슬러그의 다른 소스", kind: "rss", adapter: "rss", status: "paused" });

    const seen = await previewSocial(db, "x", ["itest_x_one", "itest_x_none"], { fetchImpl: fakeFetch });
    assert.equal(seen[0].status, "ok");
    assert.equal(seen[0].alsoIn, list.name, "listed in a multi-account source");
    assert.equal(seen[0].existing, undefined);
    assert.equal(seen[1].status, "missing");
    assert.ok(requested.every((u) => !u.includes("api.x.com")), "nothing billed");

    const r = await addSocialSourcesAs(db, me, { ...base, kind: "x", signalOnly: false, lang: "en", entries: [{ name: "itest_x_one" }, { name: "itest_x_two" }] });
    assert.equal(r.added.length, 2);
    const rows = await db.select().from(feedSources).where(or(...SLUGS));
    const one = rows.find((s) => s.slug === "x-itest-x-one")!;
    assert.equal(one.name, "X @itest_x_one");
    assert.equal(one.adapter, "x.accounts");
    assert.equal(one.kind, "api");
    assert.equal(one.pollIntervalSec, 600);
    assert.deepEqual(one.auth, { envVars: ["X_BEARER_TOKEN"] });
    assert.deepEqual((one.config as { accounts: string[] }).accounts, ["itest_x_one"]);
    assert.equal((one.config as { monthlyPostCap: number }).monthlyPostCap, X_MONTHLY_CAP);
    assert.equal(one.licAttribution, "X 게시물은 공식 임베드로만 노출");
    assert.ok(rows.some((s) => s.slug === "x-itest-x-two-2"), "a taken slug gets a suffix");
    assert.equal(rows.find((s) => s.id === list.id)?.status, "paused", "the multi-account source is not touched");
  });
});
