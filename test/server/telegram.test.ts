import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, articles, candidateItems, candidates, feedItems, feedSources, staff, telegramLinks, telegramMessages } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { confirmLegalAs, publishAs, saveDraftAs } from "@/server/candidate-ops";
import type { PublishResult } from "@/server/newsroom";
import type { TgClient } from "@/server/telegram/api";
import { handleUpdate, type BotDeps, type TgUpdate } from "@/server/telegram/bot";
import { NOT_LINKED } from "@/server/telegram/format";
import { createLinkCode } from "@/server/telegram/links";
import { telegramTick } from "@/server/telegram/notify";

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
});
