import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { arrayOverlaps, eq, inArray, like } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { activityLog, candidateItems, candidates, deskDecisions, deskPlaybooks, deskRuns, feedItems, feedSources } from "@/db/schema";
import { runDesk, type DeskRunReport } from "@/server/desk/run";
import { kstDayStart } from "@/server/desk/score";
import { DESK_DEFAULTS, type DeskSettings } from "@/server/desk/settings";
import type { TriageOut } from "@/server/desk/triage";
import { NO_LEDGER, type CreateCall, type DraftOut } from "@/server/generator/claude";

/** Needs Postgres (DATABASE_URL); CI provides one. Creates and removes its own rows; Claude is faked. */
const enabled = Boolean(process.env.DATABASE_URL);
const PREFIX = "itest-desk-";
const HOUR = 3_600_000;
/** today 12:00 KST: inside the drafting day whenever the test runs */
const NOW = new Date(kstDayStart(new Date()).getTime() + 12 * HOUR);

/* fixtures — fictional companies only */
const T = {
  a: "누리AI랩, 언어모델 누리-3 공개",
  b: "누리-3, 기업용 API로 먼저 제공",
  c: "블루웨이브체인, 해외 거래소 상장 추진설",
  d: "한빛반도체, 지난주 실적 발표",
  e: "한빛반도체, 2나노 공정 양산 일정 공개",
  f: "누리AI랩, 서울 연구소 개소",
};

const draftOut: DraftOut = {
  title: "누리AI랩, 언어모델 누리-3 공개",
  dek: "누리AI랩이 23일 매개변수 700억 개 규모의 언어모델 누리-3를 공개했다.",
  why: ["국내 AI 기업의 자체 모델 경쟁이 이어진다는 신호다."],
  numbers: [
    { value: "700억 개", label: "매개변수", trend: "none" },
    { value: "12%", label: "벤치마크 개선폭", trend: "up" },
  ],
  sections: [{ label: "context", text: "누리AI랩은 누리-3를 기업용 API로 먼저 제공한다.", bullets: [] }],
  next: ["내년 상반기 오픈소스 버전 공개 여부"],
  tags: ["누리AI랩", "언어모델"],
  tickers: [],
  sourceIndexes: [1, 2],
  notes: [],
};

type Story = TriageOut["stories"][number];
const story = (over: Partial<Story>): Story => ({
  items: [],
  beat: "ai",
  topic: "",
  angle: "",
  news: 50,
  interest: 50,
  evidence: 50,
  risk: 10,
  decision: "draft",
  reason: "",
  ...over,
});

/** Claude stand-in: triage answers by item title (the prompt numbers the items), drafts get `draftOut`. */
function fakeClaude(triage: (n: (title: string) => number) => Story[]) {
  const calls: Array<{ kind: "triage" | "draft"; user: string }> = [];
  const create: CreateCall = async (body) => {
    const user = String(body.messages[0].content);
    const reply = (x: unknown) => ({ content: [{ type: "text", text: JSON.stringify(x) }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 } });
    if (JSON.stringify(body.system).includes("AI 데스크입니다")) {
      calls.push({ kind: "triage", user });
      const index = new Map<string, number>();
      for (const m of user.matchAll(/<자료 번호="(\d+)">\n[^\n]*\n[^\n]*\n제목: ([^\n]*)/g)) index.set(m[2], Number(m[1]));
      return reply({ stories: triage((t) => index.get(t) ?? -1) });
    }
    calls.push({ kind: "draft", user });
    return reply(draftOut);
  };
  return { create, calls };
}

const settings = (over: Partial<DeskSettings> = {}): DeskSettings => ({ ...DESK_DEFAULTS, dailyDrafts: 5, minScore: 60, exploreShare: 0, ...over });
const runs: string[] = [];
async function run(create: CreateCall | null, s: DeskSettings): Promise<DeskRunReport> {
  const r = await runDesk({ db, create, ledger: NO_LEDGER, now: NOW, trigger: "manual", globalCapUsd: 1000, settings: s });
  if (r.runId) runs.push(r.runId);
  return r;
}

let official = "";
let reputable = "";
let signal = "";
let playbookExisted = false;
const itemIds = new Map<string, string>();

async function addItem(key: keyof typeof T, o: { source: string; summary: string; publishedHoursAgo?: number; beat?: "ai" | "economy" | "tech" }) {
  const [row] = await db
    .insert(feedItems)
    .values({
      sourceId: o.source,
      externalId: `${PREFIX}${key}-${Date.now()}`,
      contentHash: `${PREFIX}${key}`,
      title: T[key],
      summary: o.summary,
      url: `https://example.com/${key}`,
      beatGuess: o.beat ?? "ai",
      score: 60,
      publishedAt: new Date(NOW.getTime() - (o.publishedHoursAgo ?? 2) * HOUR),
      fetchedAt: new Date(NOW.getTime() - HOUR),
    })
    .returning({ id: feedItems.id });
  itemIds.set(key, row.id);
  return row.id;
}

async function cleanup() {
  const sources = await db.select({ id: feedSources.id }).from(feedSources).where(like(feedSources.slug, `${PREFIX}%`));
  const items = sources.length
    ? (await db.select({ id: feedItems.id }).from(feedItems).where(inArray(feedItems.sourceId, sources.map((s) => s.id)))).map((r) => r.id)
    : [];
  if (items.length) {
    const decisions = await db.select({ id: deskDecisions.id, candidateId: deskDecisions.candidateId }).from(deskDecisions).where(arrayOverlaps(deskDecisions.itemIds, items));
    const cands = decisions.flatMap((d) => (d.candidateId ? [d.candidateId] : []));
    if (cands.length) {
      await db.delete(activityLog).where(inArray(activityLog.entityId, cands));
      await db.delete(candidates).where(inArray(candidates.id, cands));
    }
    await db.delete(feedSources).where(inArray(feedSources.id, sources.map((s) => s.id)));
    if (decisions.length) await db.delete(deskDecisions).where(inArray(deskDecisions.id, decisions.map((d) => d.id)));
  } else if (sources.length) await db.delete(feedSources).where(inArray(feedSources.id, sources.map((s) => s.id)));
  if (runs.length) {
    await db.delete(deskDecisions).where(inArray(deskDecisions.runId, runs));
    await db.delete(deskRuns).where(inArray(deskRuns.id, runs));
  }
  if (!playbookExisted) await db.delete(deskPlaybooks).where(eq(deskPlaybooks.source, "initial"));
}

describe("AI desk", { skip: !enabled && "DATABASE_URL not set" }, () => {
  before(async () => {
    playbookExisted = Boolean(await db.query.deskPlaybooks.findFirst());
    await cleanup();
    const lic = { licReviewedAt: new Date(), licCommercialOk: true, licVerbatimOk: true, licRedistributionOk: true };
    [{ id: official }] = await db
      .insert(feedSources)
      .values({ slug: `${PREFIX}official`, name: "누리AI랩 보도자료", kind: "rss", trustTier: 1, ...lic })
      .returning({ id: feedSources.id });
    [{ id: reputable }] = await db
      .insert(feedSources)
      .values({ slug: `${PREFIX}reputable`, name: "테크 전문지", kind: "rss", trustTier: 2, ...lic })
      .returning({ id: feedSources.id });
    [{ id: signal }] = await db
      .insert(feedSources)
      .values({ slug: `${PREFIX}signal`, name: "다른 언론", kind: "rss", trustTier: 2, signalOnly: true, ...lic })
      .returning({ id: feedSources.id });
  });
  after(async () => {
    await cleanup();
    await closeDb();
  });

  it("judges new items, drafts the best story into 검토 and records every call", async () => {
    await addItem("a", { source: official, summary: "누리AI랩이 23일 매개변수 700억 개 규모의 언어모델 누리-3를 공개했다. 한국어 벤치마크에서 이전 모델보다 12% 높은 점수를 기록했다고 밝혔다." });
    await addItem("b", { source: reputable, summary: "누리AI랩은 누리-3를 기업용 API로 먼저 제공하고 내년 상반기 오픈소스 버전을 내놓을 계획이다." });
    await addItem("c", { source: signal, summary: "업계에 따르면 블루웨이브체인이 해외 거래소 상장을 추진하고 있다.", beat: "economy" });
    await addItem("d", { source: official, summary: "한빛반도체가 지난주 분기 실적을 발표했다.", publishedHoursAgo: 120, beat: "tech" });

    const { create, calls } = fakeClaude((n) => [
      story({ items: [n(T.b), n(T.a)], topic: "AI 모델 공개", angle: "누리AI랩 누리-3 공개와 기업용 API 계획", news: 90, interest: 90, evidence: 90, risk: 10, reason: "국내 AI 모델 공개, 공식 발표" }),
      story({ items: [n(T.c)], beat: "economy", topic: "상장", angle: "블루웨이브체인 상장 추진", news: 70, interest: 70, evidence: 30, risk: 40, reason: "상장 추진설" }),
    ]);
    const r = await run(create, settings());

    assert.deepEqual(
      calls.map((c) => c.kind),
      ["triage", "draft"],
    );
    assert.ok(!calls[0].user.includes(T.d), "a five-day-old item is skipped without asking the model");
    assert.equal(r.itemsSeen, 4);
    assert.equal(r.stories, 2);
    assert.equal(r.drafted.length, 1);
    const [made] = r.drafted;
    assert.ok(made.score >= 88, `score ${made.score}`);
    assert.equal(made.lowRisk, true, "official, licensed, checked, low risk");

    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, made.candidateId) });
    assert.equal(cand?.status, "review");
    assert.equal(cand?.mode, "feed_draft");
    assert.equal(cand?.beat, "ai");
    assert.equal(cand?.generator?.desk?.lowRisk, true);
    assert.match(cand?.aiNote ?? "", /^AI 데스크 \d+점 \(AI 모델 공개\): 국내 AI 모델 공개, 공식 발표 · 저위험 기준 통과/);
    const links = await db.select().from(candidateItems).where(eq(candidateItems.candidateId, made.candidateId));
    assert.equal(links.length, 2);
    // the model listed the trade-press item first; the official one leads
    assert.equal(links.find((l) => l.role === "primary")?.feedItemId, itemIds.get("a"));
    assert.ok(calls[1].user.indexOf(T.a) > 0 && calls[1].user.indexOf(T.a) < calls[1].user.indexOf(T.b), "the writer sees the primary item first");

    const items = await db.select({ id: feedItems.id, status: feedItems.status, decision: deskDecisions.decision, reason: deskDecisions.reason, drafted: deskDecisions.draftedAt })
      .from(feedItems)
      .innerJoin(deskDecisions, eq(deskDecisions.id, feedItems.deskDecisionId))
      .where(inArray(feedItems.id, [...itemIds.values()]));
    const by = (k: keyof typeof T) => items.find((i) => i.id === itemIds.get(k))!;
    assert.equal(by("a").status, "promoted");
    assert.equal(by("b").status, "promoted");
    assert.ok(by("a").drafted);
    assert.equal(by("c").status, "new", "signal-only items are never drafted");
    assert.equal(by("c").decision, "hold");
    assert.match(by("c").reason, /^1차 자료 확인 필요/);
    assert.equal(by("d").decision, "skip");
    assert.match(by("d").reason, /72시간이 지난 자료/);

    const [log] = await db.select().from(activityLog).where(eq(activityLog.entityId, made.candidateId));
    assert.equal(log.kind, "draft");
    assert.equal(log.actorId, null);
    const runRow = await db.query.deskRuns.findFirst({ where: eq(deskRuns.id, r.runId!) });
    assert.ok(runRow?.finishedAt);
    assert.equal(runRow?.drafted, 1);
    assert.equal(runRow?.error, null);
  });

  it("does nothing new on the next pass", async () => {
    const { create, calls } = fakeClaude(() => []);
    const r = await run(create, settings());
    assert.equal(calls.length, 0);
    assert.equal(r.itemsSeen, 0);
    assert.equal(r.drafted.length, 0);
  });

  it("queues a story when the day is full and drafts it from the queue later", async () => {
    await addItem("e", { source: official, summary: "한빛반도체가 2나노 공정 양산을 내년 2분기에 시작한다고 밝혔다.", beat: "tech" });
    const judged = fakeClaude((n) => [
      story({ items: [n(T.e)], beat: "tech", topic: "반도체 공정", angle: "한빛반도체 2나노 양산 일정", news: 70, interest: 70, evidence: 80, risk: 20, reason: "공정 일정 공식 발표" }),
    ]);
    const first = await run(judged.create, settings({ dailyDrafts: 0 }));
    assert.deepEqual(
      judged.calls.map((c) => c.kind),
      ["triage"],
    );
    assert.equal(first.drafted.length, 0);
    assert.ok(first.queued >= 1);
    const waiting = await db.query.deskDecisions.findFirst({ where: arrayOverlaps(deskDecisions.itemIds, [itemIds.get("e")!]) });
    assert.equal(waiting?.decision, "draft");
    assert.equal(waiting?.draftedAt, null);

    // a slot opens: drafted from the queue without judging it again
    const later = fakeClaude(() => []);
    const second = await run(later.create, settings());
    assert.deepEqual(
      later.calls.map((c) => c.kind),
      ["draft"],
    );
    assert.equal(second.drafted.length, 1);
    const done = await db.query.deskDecisions.findFirst({ where: eq(deskDecisions.id, waiting!.id) });
    assert.ok(done?.draftedAt);
    assert.equal(done?.candidateId, second.drafted[0].candidateId);
  });

  it("lets an editor's own call on an item win over the queue", async () => {
    const id = await addItem("f", { source: official, summary: "누리AI랩이 서울에 두 번째 연구소를 열었다." });
    const judged = fakeClaude((n) => [story({ items: [n(T.f)], topic: "연구소", angle: "누리AI랩 서울 연구소", news: 70, interest: 65, evidence: 80, risk: 10, reason: "공식 발표" })]);
    await run(judged.create, settings({ dailyDrafts: 0 }));
    await db.update(feedItems).set({ status: "dismissed", dismissedReason: "편집자 판단" }).where(eq(feedItems.id, id));

    const later = fakeClaude(() => []);
    await run(later.create, settings());
    assert.equal(later.calls.length, 0);
    const d = await db.query.deskDecisions.findFirst({ where: arrayOverlaps(deskDecisions.itemIds, [id]) });
    assert.equal(d?.decision, "skip");
    assert.match(d?.reason ?? "", /^편집자가 먼저 처리한 자료/);
  });

  it("rests without a key or a budget, and says why", async () => {
    const none = await run(null, settings());
    assert.match(none.note, /ANTHROPIC_API_KEY/);
    const { create, calls } = fakeClaude(() => []);
    const broke = await run(create, settings({ monthlyBudgetUsd: 0 }));
    assert.equal(calls.length, 0);
    assert.match(broke.note, /예산/);
    const off = await runDesk({ db, create, ledger: NO_LEDGER, now: NOW, trigger: "schedule", globalCapUsd: 1000, settings: settings({ enabled: false }) });
    assert.equal(off.runId, null);
    assert.equal(off.note, "꺼짐");
  });
});
