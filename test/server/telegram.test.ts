import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, articles, candidateItems, candidates, deskLessons, feedItems, feedSources, siteSettings, staff, telegramLinks, telegramMessages } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { confirmLegalAs, publishAs, saveDraftAs } from "@/server/candidate-ops";
import { loadDeskSettings } from "@/server/desk/settings";
import type { PublishResult } from "@/server/newsroom";
import type { TgClient } from "@/server/telegram/api";
import { handleUpdate, type BotDeps, type TgUpdate } from "@/server/telegram/bot";
import { NOT_LINKED } from "@/server/telegram/format";
import { createLinkCode } from "@/server/telegram/links";
import { telegramTick } from "@/server/telegram/notify";
import { makeTicket, readTicket, TICKET_SEC, verifyInitData } from "@/server/telegram/webapp";
import { POST as miniAppSignIn } from "@/app/api/telegram/webapp/route";

/**
 * The newsroom bot end to end, against Postgres (DATABASE_URL; CI provides one)
 * with a fake Telegram that records every call. Run with the react-server
 * condition (npm run test:unit) so the newsroom's server-only modules load.
 */
const enabled = Boolean(process.env.DATABASE_URL);
const PREFIX = "itest-tg-";
const SITE = "https://newweb.media";
const USER = 910_000_001;
const PLACEHOLDER_USER = 910_000_002;
const STRANGER = 910_000_003;

/* fixtures — fictional companies only */

interface Call {
  method: string;
  params: Record<string, unknown> & { text?: string; reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>>; force_reply?: boolean } };
}
function fakeTelegram() {
  const calls: Call[] = [];
  let nextId = 7000;
  const tg: TgClient = {
    async call<T>(method: string, params: Record<string, unknown>) {
      calls.push({ method, params: params as Call["params"] });
      return (method === "sendMessage" ? { message_id: ++nextId } : true) as T;
    },
  };
  const since = (n: number) => calls.slice(n);
  return { tg, calls, since };
}

const fake = fakeTelegram();
const published: PublishResult[] = [];
let revise: BotDeps["revise"] = null;
const deps = (): BotDeps => ({ db, tg: fake.tg, site: SITE, published: (r) => void published.push(r), revise });
let updateId = 1;
const msg = (from: number, text: string, replyTo?: number): TgUpdate => ({
  update_id: updateId++,
  message: { message_id: 50_000 + updateId, chat: { id: from, type: "private" }, from: { id: from, username: `u${from}` }, text, ...(replyTo ? { reply_to_message: { message_id: replyTo } } : {}) },
});
const press = (from: number, data: string, messageId: number): TgUpdate => ({
  update_id: updateId++,
  callback_query: { id: `cb${updateId}`, from: { id: from }, data, message: { message_id: messageId, chat: { id: from, type: "private" } } },
});
const buttons = (c: Call) => (c.params.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? "");
/** the card sent for a candidate to a chat (the latest one) */
const cardOf = (id: string, chat = USER) =>
  [...fake.calls].reverse().find((c) => c.method === "sendMessage" && c.params.chat_id === chat && buttons(c).includes(`pub:${id}`));
const sentId = (c: Call | undefined) => 7000 + fake.calls.filter((x) => x.method === "sendMessage").indexOf(c!) + 1;

let editorId = "";
let placeholderId = "";
let licensed = "";
let unreviewed = "";

async function makeCandidate(source: string, tag: string): Promise<string> {
  const title = `누리AI랩, 언어모델 누리-3 공개 ${tag}`;
  const [item] = await db
    .insert(feedItems)
    .values({
      sourceId: source,
      externalId: `${PREFIX}${tag}-${randomBytes(4).toString("hex")}`,
      contentHash: `${PREFIX}${tag}`,
      title,
      summary: "누리AI랩이 매개변수 700억 개 규모의 언어모델 누리-3를 공개했다.",
      url: "https://example.com/nuri-3",
      beatGuess: "ai",
      status: "promoted",
    })
    .returning({ id: feedItems.id });
  const draft: Draft = {
    title,
    dek: "누리AI랩이 매개변수 700억 개 규모의 언어모델 누리-3를 공개했다.",
    blocks: [{ type: "why", items: ["국내 AI 기업의 자체 모델 경쟁이 이어진다는 신호다."] }],
    tags: [],
    tickers: [],
    sources: [{ name: "누리AI랩 보도자료", url: "https://example.com/nuri-3", kind: "press" }],
  };
  const [c] = await db
    .insert(candidates)
    .values({
      status: "review",
      mode: "feed_draft",
      beat: "ai",
      draft,
      aiNote: `AI 데스크 80점 (AI 모델 공개): 공식 발표 ${tag}`,
      generator: { id: "claude", version: "draft-1", generatedAt: new Date().toISOString(), inputItemIds: [item.id], desk: { decisionId: item.id, score: 80, lowRisk: false, lowRiskWhy: [] } },
    })
    .returning({ id: candidates.id });
  await db.insert(candidateItems).values({ candidateId: c.id, feedItemId: item.id, role: "primary" });
  return c.id;
}

async function cleanup() {
  const sources = await db.select({ id: feedSources.id }).from(feedSources).where(like(feedSources.slug, `${PREFIX}%`));
  const items = sources.length ? await db.select({ id: feedItems.id }).from(feedItems).where(inArray(feedItems.sourceId, sources.map((s) => s.id))) : [];
  const cands = items.length
    ? await db.select({ id: candidateItems.candidateId }).from(candidateItems).where(inArray(candidateItems.feedItemId, items.map((i) => i.id)))
    : [];
  const candIds = [...new Set(cands.map((c) => c.id))];
  const arts = candIds.length ? await db.select({ id: articles.id }).from(articles).where(inArray(articles.candidateId, candIds)) : [];
  const people = await db.select({ id: staff.id }).from(staff).where(like(staff.login, `${PREFIX}%`));
  const entityIds = [...candIds, ...arts.map((a) => a.id)];
  if (entityIds.length || people.length) {
    await db.delete(activityLog).where(
      or(
        entityIds.length ? inArray(activityLog.entityId, entityIds) : undefined,
        people.length ? inArray(activityLog.actorId, people.map((p) => p.id)) : undefined,
      ),
    );
  }
  if (arts.length) await db.delete(articles).where(inArray(articles.id, arts.map((a) => a.id)));
  if (candIds.length) await db.delete(candidates).where(inArray(candidates.id, candIds));
  if (sources.length) await db.delete(feedSources).where(inArray(feedSources.id, sources.map((s) => s.id)));
  await db.delete(telegramMessages).where(inArray(telegramMessages.chatId, [USER, PLACEHOLDER_USER, STRANGER]));
  if (people.length) await db.delete(staff).where(inArray(staff.id, people.map((p) => p.id)));
}

/** Launch data the way Telegram signs it for a Mini App (core.telegram.org/bots/webapps) */
function initDataFor(userId: number, token: string, authDate = Math.floor(Date.now() / 1000), user: Record<string, unknown> = { id: userId, first_name: "편집", username: `u${userId}` }): string {
  const fields: Record<string, string> = { auth_date: String(authDate), query_id: "AAHitest", signature: "itest-signature", user: JSON.stringify(user) };
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}

describe("Telegram Mini App sign-in", () => {
  const TOKEN = "123456:itest-bot-token";
  const now = new Date("2026-10-24T12:00:00Z");
  const at = Math.floor(now.getTime() / 1000);
  const CANDIDATE = "11111111-1111-4111-8111-111111111111";
  const EDITOR = "22222222-2222-4222-8222-222222222222";

  it("accepts launch data signed with the bot's token, fresh, for a real user", () => {
    assert.deepEqual(verifyInitData(initDataFor(USER, TOKEN, at), TOKEN, now), { id: USER, username: `u${USER}` });
    assert.equal(verifyInitData(initDataFor(USER, "654321:another-bot", at), TOKEN, now), null, "another bot's data");
    const tampered = initDataFor(USER, TOKEN, at).replace(encodeURIComponent(`"id":${USER}`), encodeURIComponent(`"id":${STRANGER}`));
    assert.equal(verifyInitData(tampered, TOKEN, now), null, "a changed user");
    assert.equal(verifyInitData(initDataFor(USER, TOKEN, at - 2 * 3600), TOKEN, now), null, "too old");
    assert.ok(verifyInitData(initDataFor(USER, TOKEN, at - 50 * 60), TOKEN, now), "a Mini App reloaded within the hour");
    assert.equal(verifyInitData(initDataFor(USER, TOKEN, at + 3600), TOKEN, now), null, "from the future");
    assert.equal(verifyInitData(initDataFor(USER, TOKEN, at, { first_name: "no id" }), TOKEN, now), null, "no user id");
    assert.equal(verifyInitData("auth_date=1&user=%7B%7D", TOKEN, now), null, "no hash");
  });

  it("issues a ticket for one draft, for minutes, that only this server can make", () => {
    const ticket = makeTicket({ tgUserId: USER, staffId: EDITOR, candidateId: CANDIDATE }, TOKEN, now);
    assert.deepEqual(readTicket(ticket, TOKEN, now), { tgUserId: USER, staffId: EDITOR, candidateId: CANDIDATE, exp: at + TICKET_SEC });
    assert.equal(readTicket(ticket, TOKEN, new Date(now.getTime() + TICKET_SEC * 1000)), null, "expired");
    assert.equal(readTicket(ticket, "654321:another-bot", now), null, "signed by another key");
    assert.equal(readTicket(ticket.replace(CANDIDATE, "33333333-3333-4333-8333-333333333333"), TOKEN, now), null, "another draft");
    assert.equal(readTicket(null, TOKEN, now), null);
  });
});

describe("newsroom bot", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(async () => {
    await cleanup();
    [{ id: editorId }] = await db
      .insert(staff)
      .values({ login: `${PREFIX}editor`, name: "텔레그램편집", slug: `${PREFIX}editor`, title: "에디터" })
      .returning({ id: staff.id });
    [{ id: placeholderId }] = await db
      .insert(staff)
      .values({ login: `${PREFIX}placeholder`, name: "편집국", slug: `editor-${randomBytes(4).toString("hex")}`, title: "편집국" })
      .returning({ id: staff.id });
    const lic = { licReviewedAt: new Date(), licCommercialOk: true, licVerbatimOk: true, licRedistributionOk: true };
    [{ id: licensed }] = await db.insert(feedSources).values({ slug: `${PREFIX}licensed`, name: "누리AI랩 보도자료", kind: "rss", trustTier: 1, ...lic }).returning({ id: feedSources.id });
    [{ id: unreviewed }] = await db.insert(feedSources).values({ slug: `${PREFIX}unreviewed`, name: "누리AI랩 블로그", kind: "rss", trustTier: 1 }).returning({ id: feedSources.id });
  });
  after(async () => {
    await cleanup();
    await closeDb();
  });

  it("links a Telegram user with a one-time code, once", async () => {
    const { code } = await createLinkCode(db, editorId);
    await handleUpdate(deps(), msg(USER, `/start ${code}`));
    const link = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.staffId, editorId) });
    assert.equal(link?.tgUserId, USER);
    assert.equal(link?.chatId, USER);
    assert.equal(link?.codeHash, null, "the code is used up");
    assert.match(fake.calls.at(-1)!.params.text!, /텔레그램편집 님 계정과 연결했습니다/);

    await handleUpdate(deps(), msg(STRANGER, `/start ${code}`));
    assert.match(fake.calls.at(-1)!.params.text!, /맞지 않거나 만료/);
    const stranger = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.tgUserId, STRANGER) });
    assert.equal(stranger, undefined);
  });

  it("opens the preview inside Telegram, signed in as the linked editor and nobody else", async () => {
    const id = await makeCandidate(licensed, "미");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const keys = (cardOf(id)!.params.reply_markup!.inline_keyboard ?? []).flat() as Array<{ text: string; web_app?: { url: string } }>;
    assert.deepEqual(keys.find((b) => b.text === "👁 미리보기")?.web_app, { url: `${SITE}/tg/preview/${id}` });

    const TOKEN = "123456:itest-bot-token";
    const saved = process.env.NEWSROOM_TELEGRAM_BOT_TOKEN;
    process.env.NEWSROOM_TELEGRAM_BOT_TOKEN = TOKEN;
    const ask = (initData: string, site = "same-origin") =>
      miniAppSignIn(
        new Request(`${SITE}/api/telegram/webapp`, {
          method: "POST",
          headers: { "content-type": "application/json", "sec-fetch-site": site },
          body: JSON.stringify({ initData, candidateId: id }),
        }) as Parameters<typeof miniAppSignIn>[0],
      );
    try {
      const ok = await ask(initDataFor(USER, TOKEN));
      assert.equal(ok.status, 200);
      const { ticket } = (await ok.json()) as { ticket: string };
      assert.deepEqual({ ...readTicket(ticket, TOKEN), exp: 0 }, { tgUserId: USER, staffId: editorId, candidateId: id, exp: 0 });
      assert.equal((await ask(initDataFor(STRANGER, TOKEN))).status, 403, "a Telegram user no editor linked");
      assert.equal((await ask(initDataFor(USER, "654321:another-bot"))).status, 401, "launch data from another bot");
      assert.equal((await ask(initDataFor(USER, TOKEN), "cross-site")).status, 403, "a page on another site");
    } finally {
      if (saved === undefined) delete process.env.NEWSROOM_TELEGRAM_BOT_TOKEN;
      else process.env.NEWSROOM_TELEGRAM_BOT_TOKEN = saved;
    }
  });

  it("sends one card per new draft and ignores people who are not linked", async () => {
    const id = await makeCandidate(licensed, "가");
    const r = await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    assert.ok(r.sent >= 1);
    const card = cardOf(id);
    assert.ok(card, "a card for the new draft");
    assert.match(card.params.text!, /AI 데스크 초안<\/b> · 80점 · AI/);
    assert.deepEqual(buttons(card).filter(Boolean), [`pub:${id}`, `edit:${id}`, `rej:${id}`]);

    const before = fake.calls.length;
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    assert.equal(fake.since(before).filter((c) => c.method === "sendMessage" && buttons(c).includes(`pub:${id}`)).length, 0, "never twice");

    await handleUpdate(deps(), press(STRANGER, `pub:${id}`, sentId(card)));
    const answer = fake.calls.at(-1)!;
    assert.equal(answer.method, "answerCallbackQuery");
    assert.equal(answer.params.text, NOT_LINKED.slice(0, 190));
    assert.equal((await db.query.candidates.findFirst({ where: eq(candidates.id, id) }))?.status, "review");
  });

  it("publishes from the card once the editor confirms the legal check", async () => {
    const id = await makeCandidate(licensed, "나");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const card = cardOf(id)!;
    await handleUpdate(deps(), press(USER, `pub:${id}`, sentId(card)));
    const confirm = [...fake.calls].reverse().find((c) => c.method === "editMessageReplyMarkup")!;
    const ok = buttons(confirm).find((b) => b.startsWith("ok:"))!;
    assert.match(ok, new RegExp(`^ok:${id}:\\d+$`));
    assert.equal((await db.query.candidates.findFirst({ where: eq(candidates.id, id) }))?.status, "review", "nothing published on the first tap");

    const n = published.length;
    await handleUpdate(deps(), press(USER, ok, sentId(card)));
    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(cand?.status, "published");
    const art = await db.query.articles.findFirst({ where: eq(articles.candidateId, id) });
    assert.equal(art?.editorId, editorId);
    assert.equal(published.length, n + 1, "the site's caches are refreshed");
    assert.match(cand!.checks.find((c) => c.id === "legal")!.message, /텔레그램편집 확인 .* 텔레그램/);
    const edited = [...fake.calls].reverse().find((c) => c.method === "editMessageText" && c.params.message_id === sentId(card))!;
    assert.match(edited.params.text!, /^✅ <b>발행됨<\/b> · 텔레그램편집/);
    const log = await db.query.activityLog.findFirst({ where: and(eq(activityLog.entityId, art!.id), eq(activityLog.kind, "publish")) });
    assert.equal((log?.meta as { via?: string }).via, "telegram");
  });

  it("asks for a reason when another blocking check fails, and records it", async () => {
    const id = await makeCandidate(unreviewed, "다");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const card = cardOf(id)!;
    assert.match(card.params.text!, /⚠️ 라이선스·인용 범위: 라이선스 미검토: 누리AI랩 블로그/);
    await handleUpdate(deps(), press(USER, `pub:${id}`, sentId(card)));
    const ok = buttons([...fake.calls].reverse().find((c) => c.method === "editMessageReplyMarkup")!).find((b) => b.startsWith("ok:"))!;
    await handleUpdate(deps(), press(USER, ok, sentId(card)));
    const question = [...fake.calls].reverse().find((c) => c.method === "sendMessage" && c.params.reply_markup?.force_reply)!;
    assert.match(question.params.text!, /필수 체크에 걸려 있습니다/);
    assert.equal((await db.query.candidates.findFirst({ where: eq(candidates.id, id) }))?.status, "review");

    await handleUpdate(deps(), msg(USER, "공공누리 1유형 보도자료로 확인", sentId(question)));
    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(cand?.status, "published");
    assert.equal(cand!.checks.find((c) => c.id === "license")?.overridden?.reason, "공공누리 1유형 보도자료로 확인");
  });

  it("rejects with a reason from the buttons or a written one", async () => {
    const a = await makeCandidate(licensed, "라");
    const b = await makeCandidate(licensed, "마");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    await handleUpdate(deps(), press(USER, `rej:${a}`, sentId(cardOf(a))));
    assert.ok(buttons([...fake.calls].reverse().find((c) => c.method === "editMessageReplyMarkup")!).includes(`rj:${a}:1`));
    await handleUpdate(deps(), press(USER, `rj:${a}:1`, sentId(cardOf(a))));
    const ra = await db.query.candidates.findFirst({ where: eq(candidates.id, a) });
    assert.equal(ra?.status, "rejected");
    assert.equal(ra?.aiNote, "반려: 홍보성");

    await handleUpdate(deps(), press(USER, `rj:${b}:0`, sentId(cardOf(b))));
    const question = [...fake.calls].reverse().find((c) => c.method === "sendMessage" && c.params.reply_markup?.force_reply)!;
    await handleUpdate(deps(), msg(USER, "이미 지난주에 다룬 내용", sentId(question)));
    assert.equal((await db.query.candidates.findFirst({ where: eq(candidates.id, b) }))?.aiNote, "반려: 이미 지난주에 다룬 내용");
    const edited = [...fake.calls].reverse().find((c) => c.method === "editMessageText" && c.params.message_id === sentId(cardOf(b)))!;
    assert.match(edited.params.text!, /^🗑 <b>반려<\/b> · 이미 지난주에 다룬 내용/);
  });

  it("edits from a reply: 제목/요약 as written, anything else through the AI", async () => {
    const id = await makeCandidate(licensed, "바");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const first = cardOf(id)!;
    await handleUpdate(deps(), msg(USER, "제목: 누리AI랩 누리-3 공개 바", sentId(first)));
    let cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(cand?.draft.title, "누리AI랩 누리-3 공개 바");
    assert.equal(cand?.checks.find((c) => c.id === "legal")?.ok, false, "an edit voids the legal sign-off");
    const second = cardOf(id)!;
    assert.notEqual(second, first, "a new card with the new version");
    const old = [...fake.calls].reverse().find((c) => c.method === "editMessageText" && c.params.message_id === sentId(first))!;
    assert.match(old.params.text!, /^✏️ 고친 초안을 아래에 새로 보냈습니다/);

    revise = null;
    await handleUpdate(deps(), msg(USER, "요약을 더 짧게", sentId(second)));
    assert.match(fake.calls.at(-1)!.params.text!, /AI 수정을 쓸 수 없습니다/);

    revise = async ({ draft, instruction }) => ({ ...draft, dek: `누리AI랩이 누리-3를 공개했다. (${instruction.length})` });
    const later = await handleUpdate(deps(), msg(USER, "요약을 더 짧게", sentId(second)));
    assert.ok(later, "the AI edit runs after the webhook answers");
    await later!();
    cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(cand?.draft.dek, "누리AI랩이 누리-3를 공개했다. (8)");
    assert.notEqual(cardOf(id), second);
    revise = null;
  });

  it("refuses to publish a version the editor did not see", async () => {
    const id = await makeCandidate(licensed, "사");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const card = cardOf(id)!;
    await handleUpdate(deps(), press(USER, `pub:${id}`, sentId(card)));
    const ok = buttons([...fake.calls].reverse().find((c) => c.method === "editMessageReplyMarkup")!).find((b) => b.startsWith("ok:"))!;
    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    await saveDraftAs(db, { id, lockVersion: cand!.lockVersion, draft: { ...cand!.draft, dek: "편집기에서 그사이 고친 요약." } });

    await handleUpdate(deps(), press(USER, ok, sentId(card)));
    const answer = [...fake.calls].reverse().find((c) => c.method === "answerCallbackQuery")!;
    assert.match(String(answer.params.text), /바뀌었습니다/);
    const after = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(after?.status, "review");
    assert.equal(after?.checks.find((c) => c.id === "legal")?.ok ?? false, false, "no sign-off for a version nobody read");
    assert.match(cardOf(id)!.params.text!, /편집기에서 그사이 고친 요약/, "the current version is sent");
  });

  it("keeps cards in step with what happens in the newsroom", async () => {
    const id = await makeCandidate(licensed, "아");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const card = cardOf(id)!;
    const editor = (await db.query.staff.findFirst({ where: eq(staff.id, editorId) }))!;
    await confirmLegalAs(db, editor, id, true);
    await publishAs(db, editor, { id });
    const r = await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    assert.ok(r.updated >= 1);
    const edited = [...fake.calls].reverse().find((c) => c.method === "editMessageText" && c.params.message_id === sentId(card))!;
    assert.match(edited.params.text!, /^✅ <b>발행됨<\/b>/);
    const row = await db.query.telegramMessages.findFirst({ where: and(eq(telegramMessages.chatId, USER), eq(telegramMessages.messageId, sentId(card))) });
    assert.equal(row?.state, "done");
  });

  it("will not publish under the placeholder name", async () => {
    const { code } = await createLinkCode(db, placeholderId);
    await handleUpdate(deps(), msg(PLACEHOLDER_USER, `/start ${code}`));
    const id = await makeCandidate(licensed, "자");
    await telegramTick({ db, tg: fake.tg, site: SITE, pauseMs: 0 });
    const card = cardOf(id, PLACEHOLDER_USER)!;
    await handleUpdate(deps(), press(PLACEHOLDER_USER, `pub:${id}`, sentId(card)));
    const ok = buttons([...fake.calls].reverse().find((c) => c.method === "editMessageReplyMarkup")!).find((b) => b.startsWith("ok:"))!;
    await handleUpdate(deps(), press(PLACEHOLDER_USER, ok, sentId(card)));
    assert.match(String(fake.calls.at(-1)!.params.text), /실명/);
    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    assert.equal(cand?.status, "review");
    assert.equal(cand?.checks.find((c) => c.id === "legal")?.ok ?? false, false);
  });

  it("pauses and resumes from the /status panel, and turns the desk and card alerts off", async () => {
    const saved = await db.select().from(siteSettings).where(inArray(siteSettings.key, ["desk", "ingest"]));
    try {
      let mark = fake.calls.length;
      await handleUpdate(deps(), msg(USER, "/status"));
      const panel = fake.since(mark).find((c) => c.method === "sendMessage")!;
      const id = sentId(panel);
      const lastEdit = () => [...fake.calls].reverse().find((c) => c.method === "editMessageText")!;
      const ingest = async () => (await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "ingest") }))?.value as { paused?: boolean } | undefined;

      await handleUpdate(deps(), press(USER, "ctl:ingest:off", id));
      assert.equal((await ingest())?.paused, true);
      assert.match(lastEdit().params.text!, /⏸ 일시정지 중/);
      assert.ok(buttons(lastEdit()).includes("ctl:ingest:on"), "the button flips");
      await handleUpdate(deps(), press(USER, "ctl:ingest:on", id));
      assert.equal((await ingest())?.paused, false);

      await handleUpdate(deps(), press(USER, "ctl:desk:off", id));
      assert.equal((await loadDeskSettings(db)).enabled, false);
      assert.match(lastEdit().params.text!, /<b>AI 데스크<\/b> 꺼짐/);
      await handleUpdate(deps(), press(USER, "ctl:notify:off", id));
      assert.equal((await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.tgUserId, USER) }))?.notify, false);
      assert.ok(buttons(lastEdit()).includes("ctl:notify:on"));
      await handleUpdate(deps(), press(USER, "ctl:notify:on", id));

      const logs = await db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.actorId, editorId), eq(activityLog.entityId, "ingest")))
        .orderBy(activityLog.id);
      assert.deepEqual(
        logs.map((l) => [l.summary, (l.meta as { via?: string }).via]),
        [
          ["전체 수집 일시정지", "telegram"],
          ["전체 수집 재개", "telegram"],
        ],
      );

      mark = fake.calls.length;
      await handleUpdate(deps(), press(STRANGER, "ctl:ingest:off", id));
      assert.equal(fake.since(mark)[0].params.text, NOT_LINKED.slice(0, 190));
      assert.equal((await ingest())?.paused, false);
    } finally {
      await db.delete(siteSettings).where(inArray(siteSettings.key, ["desk", "ingest"]));
      if (saved.length) await db.insert(siteSettings).values(saved);
    }
  });

  it("changes the desk's settings from /settings", async () => {
    const saved = await db.select().from(siteSettings).where(eq(siteSettings.key, "desk"));
    try {
      const before = await loadDeskSettings(db);
      const mark = fake.calls.length;
      await handleUpdate(deps(), msg(USER, "/settings"));
      const panel = fake.since(mark).find((c) => c.method === "sendMessage")!;
      assert.match(panel.params.text!, /^⚙️ <b>AI 데스크 설정<\/b>/);
      const id = sentId(panel);
      await handleUpdate(deps(), press(USER, "set:daily:15", id));
      await handleUpdate(deps(), press(USER, "set:cadence:120", id));
      await handleUpdate(deps(), press(USER, before.minScore >= 95 ? "set:min:-5" : "set:min:+5", id));
      const after = await loadDeskSettings(db);
      assert.equal(after.dailyDrafts, 15);
      assert.equal(after.cadenceMin, 120);
      assert.equal(after.minScore, before.minScore + (before.minScore >= 95 ? -5 : 5));
      const redraw = [...fake.calls].reverse().find((c) => c.method === "editMessageText")!;
      assert.match(redraw.params.text!, /하루 초안 15건/);
      assert.ok(buttons(redraw).includes("set:daily:15"));
    } finally {
      await db.delete(siteSettings).where(eq(siteSettings.key, "desk"));
      if (saved.length) await db.insert(siteSettings).values(saved);
    }
  });

  it("adds a 편집 노트 with /note, and pins or deletes it from /notes", async () => {
    const saved = await db.select().from(deskLessons);
    await db.delete(deskLessons);
    try {
      let mark = fake.calls.length;
      await handleUpdate(deps(), msg(USER, "/note 경제: 정부 발표 기사는 제목에 핵심 수치를 앞세운다"));
      assert.match(fake.since(mark)[0].params.text!, /^노트를 추가했습니다 \(경제 · 고정 · 1\/12\)/);
      const [note] = await db.select().from(deskLessons);
      assert.deepEqual([note.text, note.scope, note.pinned, note.origin], ["정부 발표 기사는 제목에 핵심 수치를 앞세운다", "beat:economy", true, "editor"]);

      mark = fake.calls.length;
      await handleUpdate(deps(), msg(USER, "/notes"));
      const panel = fake.since(mark).find((c) => c.method === "sendMessage")!;
      assert.match(panel.params.text!, /1\. 📌 정부 발표 기사는/);
      const id = sentId(panel);
      await handleUpdate(deps(), press(USER, `nt:unpin:${note.id}`, id));
      assert.equal((await db.query.deskLessons.findFirst({ where: eq(deskLessons.id, note.id) }))?.pinned, false);

      await handleUpdate(deps(), press(USER, `nt:del:${note.id}`, id));
      assert.ok(await db.query.deskLessons.findFirst({ where: eq(deskLessons.id, note.id) }), "the first tap only asks");
      assert.ok(buttons([...fake.calls].reverse().find((c) => c.method === "editMessageText")!).includes(`nt:rm:${note.id}`));
      await handleUpdate(deps(), press(USER, `nt:rm:${note.id}`, id));
      assert.equal(await db.query.deskLessons.findFirst({ where: eq(deskLessons.id, note.id) }), undefined);

      mark = fake.calls.length;
      await handleUpdate(deps(), msg(USER, "/note"));
      assert.match(fake.since(mark)[0].params.text!, /노트 내용을 함께 보내 주세요/);
    } finally {
      await db.delete(deskLessons);
      if (saved.length) await db.insert(deskLessons).values(saved);
    }
  });

  it("answers /status for a linked editor only", async () => {
    const before = fake.calls.length;
    await handleUpdate(deps(), msg(USER, "/status"));
    const [reply] = fake.since(before);
    assert.equal(reply.method, "sendMessage");
    assert.match(reply.params.text!, /^📡 <b>뉴웹미디어 상태<\/b>/);
    assert.match(reply.params.text!, /\n<b>수집<\/b> 소스 \d+개 작동/);
    assert.match(reply.params.text!, /\n<b>AI 데스크<\/b> /);
    assert.match(reply.params.text!, /\n<b>뉴스룸<\/b> 검토 대기 [1-9]\d* · 예약 \d+ · 오늘 발행 \d+/, "this test's drafts are waiting in 검토");
    const mark = fake.calls.length;
    await handleUpdate(deps(), msg(STRANGER, "/status"));
    assert.equal(fake.since(mark)[0].params.text, NOT_LINKED);
  });
});
