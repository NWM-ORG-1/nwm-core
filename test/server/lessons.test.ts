import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, gte, inArray, like } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, articles, candidateItems, candidates, deskLessons, draftFeedback, feedItems, feedSources, staff } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { noteInstruction, publishAs, rejectAs, saveDraftAs } from "@/server/candidate-ops";
import { lessonsFor, loadLessons, reviewLessons, type LessonOut } from "@/server/desk/lessons";
import type { CreateCall } from "@/server/generator/claude";

/**
 * 편집 노트 end to end against Postgres (DATABASE_URL; CI provides one): an
 * editor changes an AI draft and publishes it, the review (Claude faked)
 * turns that into a note, and the next draft of the beat reads it.
 */
const enabled = Boolean(process.env.DATABASE_URL);
const PREFIX = "itest-lessons-";
const START = new Date();

/* fixtures — a fictional ministry */
const AI_DRAFT: Draft = {
  title: "가상부, 반도체 규제 손질로 투자·연구·지원 시간 재설계",
  dek: "가상부가 23일 반도체 공장 인허가 기간을 절반으로 줄이는 방안을 내놨다.",
  blocks: [
    { type: "why", items: ["공장 가동 시점이 앞당겨질 수 있다."] },
    { type: "section", label: "big_picture", text: "반도체는 설비 투자 규모가 큰 산업이다." },
  ],
  tags: [],
  tickers: [],
  sources: [{ name: "가상부 보도자료", url: "https://www.example.go.kr/view/1", kind: "press" }],
};

let source = "";
let editor = { id: "", name: "", login: "" } as Awaited<ReturnType<typeof loadEditor>>;
let savedLessons: Array<typeof deskLessons.$inferSelect> = [];

async function loadEditor(id: string) {
  return (await db.query.staff.findFirst({ where: eq(staff.id, id) }))!;
}

async function makeCandidate(tag: string, generatorId = "claude"): Promise<string> {
  const [item] = await db
    .insert(feedItems)
    .values({ sourceId: source, externalId: `${PREFIX}${tag}-${randomBytes(4).toString("hex")}`, contentHash: `${PREFIX}${tag}`, title: AI_DRAFT.title, summary: AI_DRAFT.dek, beatGuess: "economy", status: "promoted" })
    .returning({ id: feedItems.id });
  const [c] = await db
    .insert(candidates)
    .values({ status: "review", mode: "feed_draft", beat: "economy", draft: AI_DRAFT, generator: { id: generatorId, version: "draft-2", generatedAt: new Date().toISOString(), inputItemIds: [item.id] } })
    .returning({ id: candidates.id });
  await db.insert(candidateItems).values({ candidateId: c.id, feedItemId: item.id, role: "primary" });
  return c.id;
}

const lockOf = async (id: string) => (await db.query.candidates.findFirst({ where: eq(candidates.id, id) }))!.lockVersion;
const feedbackOf = (id: string) => db.query.draftFeedback.findFirst({ where: eq(draftFeedback.candidateId, id) });

async function cleanup() {
  const sources = await db.select({ id: feedSources.id }).from(feedSources).where(like(feedSources.slug, `${PREFIX}%`));
  const items = sources.length ? await db.select({ id: feedItems.id }).from(feedItems).where(inArray(feedItems.sourceId, sources.map((s) => s.id))) : [];
  const cands = items.length ? [...new Set((await db.select({ id: candidateItems.candidateId }).from(candidateItems).where(inArray(candidateItems.feedItemId, items.map((i) => i.id)))).map((c) => c.id))] : [];
  const arts = cands.length ? await db.select({ id: articles.id }).from(articles).where(inArray(articles.candidateId, cands)) : [];
  const people = await db.select({ id: staff.id }).from(staff).where(like(staff.login, `${PREFIX}%`));
  const entities = [...cands, ...arts.map((a) => a.id)];
  if (entities.length) await db.delete(activityLog).where(inArray(activityLog.entityId, entities));
  if (people.length) await db.delete(activityLog).where(inArray(activityLog.actorId, people.map((p) => p.id)));
  await db.delete(activityLog).where(and(eq(activityLog.entityId, "desk.lessons"), gte(activityLog.at, START)));
  if (arts.length) await db.delete(articles).where(inArray(articles.id, arts.map((a) => a.id)));
  if (cands.length) await db.delete(candidates).where(inArray(candidates.id, cands));
  if (sources.length) await db.delete(feedSources).where(inArray(feedSources.id, sources.map((s) => s.id)));
  if (people.length) await db.delete(staff).where(inArray(staff.id, people.map((p) => p.id)));
}

describe("편집 노트", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(async () => {
    await cleanup();
    // the review may retire or change notes: keep whatever this database had and put it back afterwards
    savedLessons = await db.select().from(deskLessons);
    await db.delete(deskLessons);
    const lic = { licReviewedAt: new Date(), licCommercialOk: true, licVerbatimOk: true, licRedistributionOk: true };
    [{ id: source }] = await db.insert(feedSources).values({ slug: `${PREFIX}ministry`, name: "가상부 보도자료", kind: "rss", adapter: "rss", trustTier: 1, ...lic }).returning({ id: feedSources.id });
    const [s] = await db.insert(staff).values({ login: `${PREFIX}editor`, name: "한서윤", slug: `${PREFIX}editor`, title: "편집자", role: "editor" }).returning({ id: staff.id });
    editor = await loadEditor(s.id);
  });
  after(async () => {
    await cleanup();
    await db.delete(deskLessons);
    if (savedLessons.length) await db.insert(deskLessons).values(savedLessons);
    await closeDb();
  });

  it("keeps the model's draft from before the first human save, then the published version", async () => {
    const id = await makeCandidate("a");
    const edited: Draft = { ...AI_DRAFT, title: "가상부, 반도체 인허가 18개월→9개월", blocks: [AI_DRAFT.blocks[0]] };
    await saveDraftAs(db, { id, lockVersion: await lockOf(id), draft: edited });
    const first = await feedbackOf(id);
    assert.deepEqual(first?.aiDraft, AI_DRAFT);
    assert.deepEqual(first?.sources, ["가상부 보도자료"]);
    assert.equal(first?.beat, "economy");

    // later saves never move the "before"
    await saveDraftAs(db, { id, lockVersion: await lockOf(id), draft: { ...edited, dek: `${edited.dek} 더 고침` } });
    assert.deepEqual((await feedbackOf(id))?.aiDraft, AI_DRAFT);
    await noteInstruction(db, id, "제목에 숫자를 넣어 줘");

    await publishAs(db, editor, { id, overrideReason: "테스트" });
    const done = await feedbackOf(id);
    assert.equal(done?.outcome, "published");
    assert.equal(done?.finalDraft?.title, "가상부, 반도체 인허가 18개월→9개월");
    assert.deepEqual(done?.instructions, ["제목에 숫자를 넣어 줘"]);
    assert.ok(done?.closedAt);
  });

  it("records nothing for an untouched draft or a non-AI one, and closes a rejected one", async () => {
    const untouched = await makeCandidate("b");
    await publishAs(db, editor, { id: untouched, overrideReason: "테스트" });
    assert.equal(await feedbackOf(untouched), undefined, "published as written: nothing to learn");

    const mock = await makeCandidate("c", "mock");
    await saveDraftAs(db, { id: mock, lockVersion: await lockOf(mock), draft: { ...AI_DRAFT, title: "다른 제목" } });
    assert.equal(await feedbackOf(mock), undefined);

    const rejected = await makeCandidate("d");
    await saveDraftAs(db, { id: rejected, lockVersion: await lockOf(rejected), draft: { ...AI_DRAFT, title: "고친 뒤 반려" } });
    await rejectAs(db, editor, { id: rejected, reason: "기사 가치 낮음" });
    assert.equal((await feedbackOf(rejected))?.outcome, "rejected");
  });

  it("the review turns waiting edits into a note the next draft of the beat reads", async () => {
    // two more edited drafts so the review has a pattern
    for (const tag of ["e", "f"]) {
      const id = await makeCandidate(tag);
      await saveDraftAs(db, { id, lockVersion: await lockOf(id), draft: { ...AI_DRAFT, title: `가상부, 핵심 수치 앞세운 제목 ${tag}`, blocks: [AI_DRAFT.blocks[0]] } });
      await publishAs(db, editor, { id, overrideReason: "테스트" });
    }
    let prompt = "";
    const create: CreateCall = async (body) => {
      prompt = String(body.messages[0].content);
      const out: LessonOut = {
        lessons: [{ keep: "", text: "정부 발표 기사는 제목에 핵심 수치를 앞세우고, 근거 없는 '넓게 보면' 단락은 쓰지 않는다.", scope: "beat:economy", cases: [1, 2, 3] }],
        drop: [],
        notes: "세 건 모두 제목에 수치를 넣고 일반론 단락을 뺐다.",
      };
      return { content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 200 } };
    };
    const r = await reviewLessons({ create }, db, new Date());
    assert.equal(r.cases, 3, "three published edits; the rejected and untouched ones are not cases");
    assert.equal(r.added, 1);
    assert.match(prompt, /제목에 숫자를 넣어 줘/, "the editor's instruction reaches the review");
    assert.match(prompt, /뺀 블록 \[넓게 보면\]/);

    const notes = await loadLessons(db);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].hits, 3);
    assert.deepEqual(lessonsFor(notes, { beat: "economy", sources: [] }, new Date()), [notes[0].text]);
    assert.deepEqual(lessonsFor(notes, { beat: "ai", sources: [] }, new Date()), [], "an economy note stays out of AI drafts");

    // read once: the next review has nothing to read and makes no model call
    let called = false;
    const again = await reviewLessons({ create: async (b) => ((called = true), create(b)) }, db, new Date());
    assert.equal(again.cases, 0);
    assert.equal(called, false);
    const [log] = await db.select().from(activityLog).where(and(eq(activityLog.entityId, "desk.lessons"), gte(activityLog.at, START)));
    assert.match(log.summary, /^편집 노트 정리: 사례 3건 · 새 노트 1/);
  });
});
