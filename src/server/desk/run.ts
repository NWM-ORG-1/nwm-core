import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { aiUsage, articles, candidateItems, candidates, deskDecisions, deskRuns, feedItems, feedSources, type Beat, type DeskDecision, type DeskScores } from "@/db/schema";
import type { Effort } from "@/lib/ai/models";
import { mapLimit } from "@/lib/ai/limit";
import { CRYPTO_LOW_PROFILE } from "@/lib/beats";
import { logActivity } from "../activity";
import { runChecks, similarity, type CheckItem } from "../checks";
import { ClaudeCallError, writeDraft, type CreateCall, type UsageLedger } from "../generator/claude";
import { aiMonthSpendUsd } from "../generator/ledger";
import type { GenItem } from "../generator/types";
import { loadDeskModel } from "./learn";
import type { BodyFetcher } from "@/ingest/fetch-body";
import { enrichItems, materialChars, MIN_MATERIAL } from "./enrich";
import { lessonsFor, loadLessons } from "./lessons";
import { activePlaybook } from "./playbook";
import { draftSlots, exploreAllowance, explorePoints, finalScores, kstDayStart, lowRisk, pickStories, priorPoints, type Contender } from "./score";
import { loadDeskSettings, type DeskSettings } from "./settings";
import { TRIAGE_BATCH, triageBatch, type TriageItem } from "./triage";

/**
 * One pass of the AI desk (worker job desk.triage):
 *  1. feed items it has not judged yet (last 36 h) are grouped into stories
 *     and judged, one Claude call per 40 items; hard rules, the learned
 *     adjustment and an exploration bonus give each story a final score
 *  2. stories worth drafting wait in a queue (a "draft" decision not yet
 *     drafted) for up to QUEUE_HOURS, losing a point an hour
 *  3. the best of the queue become drafts in 검토 — at once, or spread over
 *     the day (settings.pacing) — within the day's quota
 * Every call is kept in desk_decisions with its scores and reason, and each
 * feed item points at the decision that judged it.
 */

const MAX_ITEMS = 80;
const FRESH_HOURS = 36;
const STALE_HOURS = 72;
export const QUEUE_HOURS = 12;
/** a story this far under the bar may still be drafted as an exploration pick */
const NEAR_POINTS = 10;
const DUPLICATE_SIMILARITY = 0.6;
const CRYPTO_REASON = "등록 심사 기간: 크립토 제외";
const HOUR = 3_600_000;
const CLAIM_LOST = new Error("claim lost");

export interface DeskDeps {
  db: DB;
  /** Claude messages.create; null without ANTHROPIC_API_KEY */
  create: CreateCall | null;
  ledger: UsageLedger;
  now: Date;
  trigger: "schedule" | "manual";
  /** newsroom-wide monthly cap (DRAFT_LLM_MONTHLY_USD) */
  globalCapUsd: number;
  draftEffort?: Effort;
  /** tests: settings instead of the stored ones */
  settings?: DeskSettings;
  /** reads the article behind a title-only feed item; omitted = no fetching */
  fetchBody?: BodyFetcher;
}

export interface DeskRunReport {
  runId: string | null;
  note: string;
  itemsSeen: number;
  stories: number;
  /** stories still waiting for a slot after this pass */
  queued: number;
  drafted: Array<{ candidateId: string; title: string; score: number; lowRisk: boolean }>;
  costUsd: number;
}

/** Sources whose operator has not agreed to AI use (Telegram channels without consent) stay with the editors. */
const AI_ALLOWED = sql`(${feedSources.config}->>'llmConsent') is distinct from 'false'`;

function loadItems(db: DB, where: SQL | undefined, limit: number) {
  return db
    .select({
      id: feedItems.id,
      status: feedItems.status,
      title: feedItems.title,
      summary: feedItems.summary,
      url: feedItems.url,
      lang: feedItems.lang,
      entities: feedItems.entities,
      payload: feedItems.payload,
      beatGuess: feedItems.beatGuess,
      publishedAt: feedItems.publishedAt,
      fetchedAt: feedItems.fetchedAt,
      source: {
        name: feedSources.name,
        kind: feedSources.kind,
        adapter: feedSources.adapter,
        trustTier: feedSources.trustTier,
        signalOnly: feedSources.signalOnly,
        licCommercialOk: feedSources.licCommercialOk,
        licVerbatimOk: feedSources.licVerbatimOk,
        licReviewedAt: feedSources.licReviewedAt,
        experimentId: feedSources.experimentId,
        aiOk: sql<boolean>`${AI_ALLOWED}`,
      },
    })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(where)
    .orderBy(desc(feedItems.score), desc(feedItems.fetchedAt))
    .limit(limit);
}
type ItemRow = Awaited<ReturnType<typeof loadItems>>[number];

const toTriage = (r: ItemRow): TriageItem => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  sourceName: r.source.name,
  sourceKind: r.source.kind,
  trustTier: r.source.trustTier,
  signalOnly: r.source.signalOnly,
  licReviewed: r.source.licReviewedAt != null,
  licCommercialOk: r.source.licCommercialOk,
  beatGuess: r.beatGuess,
  entities: r.entities,
  publishedAt: r.publishedAt,
  fetchedAt: r.fetchedAt,
});

const toGen = (r: ItemRow): GenItem => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  sourceName: r.source.name,
  sourceKind: r.source.kind,
  trustTier: r.source.trustTier,
  signalOnly: r.source.signalOnly,
  lang: r.lang,
  entities: r.entities,
  payload: r.payload,
  url: r.url,
  publishedAt: r.publishedAt,
});

const toCheck = (r: ItemRow): CheckItem => ({
  title: r.title,
  summary: r.summary,
  payload: r.payload,
  signalOnly: r.source.signalOnly,
  trustTier: r.source.trustTier,
  sourceName: r.source.name,
  lic: { commercialOk: r.source.licCommercialOk, verbatimOk: r.source.licVerbatimOk, reviewed: r.source.licReviewedAt != null },
});

/** Usable items (not signal-only) first, most trusted first: the draft writer takes item 1 as the main source. */
const byPrimary = (a: ItemRow, b: ItemRow) => Number(a.source.signalOnly) - Number(b.source.signalOnly) || a.source.trustTier - b.source.trustTier;

/** Desk calls this calendar month, in USD. */
export async function deskSpendUsd(db: Pick<DB, "select">): Promise<number> {
  const [r] = await db
    .select({ usd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(gte(aiUsage.at, sql`date_trunc('month', now())`), sql`${aiUsage.purpose} like 'desk:%'`));
  return Number(r?.usd ?? 0);
}

/** Desk drafts written since midnight KST, and how many of them were exploration picks under the bar. */
export async function draftedToday(db: Pick<DB, "select">, now: Date): Promise<number> {
  return (await draftsToday(db, now)).all;
}

async function draftsToday(db: Pick<DB, "select">, now: Date): Promise<{ all: number; explored: number }> {
  const [r] = await db
    .select({ all: count(), explored: sql<number>`count(*) filter (where ${candidates.generator}->'desk'->>'explore' = 'true')::int` })
    .from(deskDecisions)
    .leftJoin(candidates, eq(candidates.id, deskDecisions.candidateId))
    .where(gte(deskDecisions.draftedAt, kstDayStart(now)));
  return { all: Number(r?.all ?? 0), explored: Number(r?.explored ?? 0) };
}

/**
 * What the desk should not write again: published titles (72 h), drafts in
 * any state (48 h) and the angles of desk drafts (48 h). `published` alone
 * feeds the duplicate check editors see, as in the editor.
 */
async function recentWork(db: DB, now: Date): Promise<{ published: string[]; all: string[] }> {
  const [pub, cand, angles] = await Promise.all([
    db
      .select({ t: articles.title })
      .from(articles)
      .where(and(eq(articles.status, "published"), gte(articles.publishedAt, new Date(now.getTime() - 72 * HOUR))))
      .orderBy(desc(articles.publishedAt))
      .limit(200),
    db
      .select({ t: sql<string>`${candidates.draft}->>'title'` })
      .from(candidates)
      .where(gte(candidates.createdAt, new Date(now.getTime() - 48 * HOUR)))
      .orderBy(desc(candidates.createdAt))
      .limit(200),
    db
      .select({ t: deskDecisions.angle })
      .from(deskDecisions)
      .where(gte(deskDecisions.draftedAt, new Date(now.getTime() - 48 * HOUR)))
      .limit(200),
  ]);
  const published = pub.map((r) => r.t);
  const all = [...new Set([...published, ...cand.map((r) => r.t), ...angles.map((r) => r.t)].filter((t): t is string => Boolean(t?.trim())))];
  return { published, all };
}

const isDuplicate = (texts: string[], recent: string[]) =>
  recent.some((t) => texts.some((x) => x.trim() && similarity(x, t) >= DUPLICATE_SIMILARITY));

async function knownTopics(db: DB): Promise<string[]> {
  const rows = await db
    .select({ topic: deskDecisions.topic })
    .from(deskDecisions)
    .where(and(sql`${deskDecisions.topic} <> ''`, gte(deskDecisions.at, sql`now() - interval '60 days'`)))
    .groupBy(deskDecisions.topic)
    .orderBy(desc(count()))
    .limit(40);
  return rows.map((r) => r.topic);
}

type NewDecision = typeof deskDecisions.$inferInsert & { id: string; itemIds: string[] };
const ZERO: DeskScores = { news: 0, interest: 0, evidence: 0, risk: 0, base: 0, prior: 0, explore: 0, final: 0 };

/* ───────────────────────── 1. judge new items ───────────────────────── */

async function judgeNew(d: DeskDeps, runId: string, settings: DeskSettings, rows: ItemRow[], recent: string[], report: DeskRunReport, notes: string[]) {
  const { db, now } = d;
  const decisions: NewDecision[] = [];
  const skipAll = (items: ItemRow[], reason: string, beat: Beat | null) => {
    if (items.length) decisions.push({ id: randomUUID(), runId, at: now, itemIds: items.map((r) => r.id), beat, decision: "skip", reason, scores: ZERO });
  };

  const stale = new Set(rows.filter((r) => r.publishedAt && now.getTime() - r.publishedAt.getTime() > STALE_HOURS * HOUR).map((r) => r.id));
  const crypto = new Set(CRYPTO_LOW_PROFILE ? rows.filter((r) => r.beatGuess === "crypto" && !stale.has(r.id)).map((r) => r.id) : []);
  skipAll(rows.filter((r) => stale.has(r.id)), `${STALE_HOURS}시간이 지난 자료`, null);
  skipAll(rows.filter((r) => crypto.has(r.id)), CRYPTO_REASON, "crypto");
  const fresh = rows.filter((r) => !stale.has(r.id) && !crypto.has(r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));

  if (fresh.length) {
    const [playbook, model, topics] = await Promise.all([activePlaybook(db), loadDeskModel(db), knownTopics(db)]);
    for (let i = 0; i < fresh.length; i += TRIAGE_BATCH) {
      const batch = fresh.slice(i, i + TRIAGE_BATCH);
      let t: Awaited<ReturnType<typeof triageBatch>>;
      try {
        t = await triageBatch({ create: d.create, ledger: d.ledger }, settings.triageModel, {
          items: batch.map(toTriage),
          now,
          playbook,
          model,
          topics,
          recentTitles: recent,
          excludeBeats: CRYPTO_LOW_PROFILE ? ["crypto(크립토)"] : [],
        });
      } catch (e) {
        if (!(e instanceof ClaudeCallError)) throw e;
        if (e.usage) report.costUsd += e.usage.costUsd;
        // these and later items stay unjudged and are read again next pass
        notes.push(`판단 실패: ${e.message.slice(0, 120)}`);
        break;
      }
      report.costUsd += t.usage.costUsd;
      report.stories += t.stories.length;
      skipAll(t.missing.map((id) => byId.get(id)!), "판단에서 빠진 자료", null);

      for (const story of t.stories) {
        const items = story.itemIds.map((id) => byId.get(id)!).sort(byPrimary);
        const usable = items.filter((r) => !r.source.signalOnly);
        // community and unverified sources cannot carry an article on their own
        const evidence = usable.length && usable.every((r) => r.source.trustTier >= 3) ? Math.min(story.evidence, 40) : story.evidence;
        const sources = [...new Set(usable.map((r) => r.source.name))];
        const scores = finalScores({ ...story, evidence }, priorPoints(model, { beat: story.beat, topic: story.topic, sources }), explorePoints(model, story.topic));

        let decision: DeskDecision = story.decision;
        let reason = story.reason;
        if (CRYPTO_LOW_PROFILE && story.beat === "crypto") [decision, reason] = ["skip", CRYPTO_REASON];
        else if (decision !== "skip" && isDuplicate([story.angle, usable[0]?.title ?? items[0].title], recent)) [decision, reason] = ["skip", `최근 기사·초안과 겹침 — ${reason}`];
        else if (decision !== "skip" && usable.length && usable.every((r) => r.source.licCommercialOk === false)) [decision, reason] = ["skip", "상업 이용이 안 되는 출처뿐"];
        else if (decision === "draft" && !usable.length) [decision, reason] = ["hold", `1차 자료 확인 필요 — ${reason}`];
        else if (decision === "draft" && scores.final < settings.minScore - NEAR_POINTS) [decision, reason] = ["skip", `${scores.final}점, 기준 ${settings.minScore}점에 못 미침 — ${reason}`];

        decisions.push({
          id: randomUUID(),
          runId,
          at: now,
          itemIds: items.map((r) => r.id),
          beat: story.beat,
          topic: story.topic,
          angle: story.angle,
          decision,
          reason,
          scores,
          model: settings.triageModel,
        });
      }
    }
  }

  if (!decisions.length) return;
  await db.transaction(async (tx) => {
    await tx.insert(deskDecisions).values(decisions);
    for (const row of decisions) await tx.update(feedItems).set({ deskDecisionId: row.id }).where(inArray(feedItems.id, row.itemIds));
  });
}

/* ───────────────────────── 2. draft from the queue ───────────────────────── */

async function closeDecision(db: DB, id: string, decision: Exclude<DeskDecision, "draft">, reason: string) {
  await db.update(deskDecisions).set({ decision, reason: reason.slice(0, 300) }).where(eq(deskDecisions.id, id));
}

async function draftFromQueue(d: DeskDeps, runId: string, settings: DeskSettings, recent: { published: string[]; all: string[] }, budgetLeft: () => number, report: DeskRunReport, notes: string[]) {
  const { db, now } = d;
  const queue = await db
    .select()
    .from(deskDecisions)
    .where(and(eq(deskDecisions.decision, "draft"), isNull(deskDecisions.draftedAt), gte(deskDecisions.at, new Date(now.getTime() - QUEUE_HOURS * HOUR))))
    .orderBy(desc(deskDecisions.at))
    .limit(100);
  if (!queue.length) return;

  const ids = [...new Set(queue.flatMap((q) => q.itemIds))];
  const byId = new Map((await loadItems(db, inArray(feedItems.id, ids), ids.length)).map((r) => [r.id, r]));
  const waiting: Array<(typeof queue)[number] & { items: ItemRow[]; score: number }> = [];
  for (const q of queue) {
    const items = q.itemIds.flatMap((id) => byId.get(id) ?? []).sort(byPrimary);
    if (items.length !== q.itemIds.length || items.some((r) => r.status !== "new")) {
      await closeDecision(db, q.id, "skip", `편집자가 먼저 처리한 자료 — ${q.reason}`);
      continue;
    }
    if (items.some((r) => !r.source.aiOk)) {
      await closeDecision(db, q.id, "skip", `AI 이용 동의가 없는 소스의 자료 — ${q.reason}`);
      continue;
    }
    if (q.runId !== runId && isDuplicate([q.angle, items[0].title], recent.all)) {
      await closeDecision(db, q.id, "skip", `최근 기사·초안과 겹침 — ${q.reason}`);
      continue;
    }
    // news goes stale: a point off for every hour spent waiting
    waiting.push({ ...q, items, score: q.scores.final - Math.floor((now.getTime() - q.at.getTime()) / HOUR) });
  }

  const done = await draftsToday(db, now);
  const contenders: Contender[] = waiting.map((w) => ({
    key: w.id,
    final: w.score,
    explore: w.scores.explore,
    eligible: w.score >= settings.minScore,
    near: w.score >= settings.minScore - NEAR_POINTS,
  }));
  const picked = pickStories(contenders, {
    ...draftSlots(settings, now, done.all),
    exploreShare: settings.exploreShare,
    exploreLeft: exploreAllowance(settings.dailyDrafts, settings.exploreShare, done.explored),
  }).map((k) => waiting.find((w) => w.id === k)!);
  // the same event can come in two batches: draft it once
  const chosen = picked.filter((w, i) => !picked.slice(0, i).some((p) => isDuplicate([w.angle, w.items[0].title], [p.angle, p.items[0].title])));
  const lessons = chosen.length ? await loadLessons(db) : [];

  await mapLimit(chosen, 2, async (w) => {
    if (budgetLeft() <= 0) {
      if (!notes.includes("예산이 차서 초안을 미뤘습니다")) notes.push("예산이 차서 초안을 미뤘습니다");
      return;
    }
    if (d.fetchBody) await enrichItems(db, w.items, d.fetchBody, now);
    if (materialChars(w.items) < MIN_MATERIAL) {
      // a headline is not enough to write from; the editor still has the item in the inbox
      await closeDecision(db, w.id, "hold", `원문 본문을 가져오지 못해 제목만으로는 쓰지 않았습니다 — ${w.reason}`);
      return;
    }
    const beat: Beat = w.beat ?? w.items[0].beatGuess ?? "tech";
    const explore = w.score < settings.minScore;
    let gen: Awaited<ReturnType<typeof writeDraft>>;
    try {
      gen = await writeDraft(
        { create: d.create, ledger: d.ledger, model: settings.draftModel, effort: d.draftEffort, budgetUsd: Number.POSITIVE_INFINITY, now: () => now },
        {
          items: w.items.map(toGen),
          beat,
          mode: "feed_draft",
          idea: w.angle ? `기사 각도 — ${w.angle}` : null,
          lessons: lessonsFor(lessons, { beat, sources: [...new Set(w.items.map((i) => i.source.name))] }, now),
        },
        "desk:draft",
      );
    } catch (e) {
      if (!(e instanceof ClaudeCallError)) throw e;
      if (e.usage) {
        // the model answered but the draft is unusable: do not pay for it twice
        report.costUsd += e.usage.costUsd;
        await closeDecision(db, w.id, "hold", `초안 작성 실패(${e.message.slice(0, 80)}) — ${w.reason}`);
      } else {
        notes.push(`초안 요청 실패, 다음 실행에 다시 시도: ${e.message.slice(0, 80)}`);
      }
      return;
    }
    report.costUsd += gen.usage.costUsd;

    const checks = runChecks({ draft: gen.draft, mode: "feed_draft", items: w.items.map(toCheck), recentTitles: recent.published, previous: [], editorName: null });
    const risk = lowRisk({
      scores: w.scores,
      items: w.items.map((r) => ({ trustTier: r.source.trustTier, signalOnly: r.source.signalOnly, licReviewed: r.source.licReviewedAt != null, licCommercialOk: r.source.licCommercialOk })),
      checks,
    });
    // " · " separates notes in the editor
    const plain = (s: string) => s.replace(/\s+·\s+/g, ", ");
    const aiNote = [
      `AI 데스크 ${w.scores.final}점${w.topic ? ` (${plain(w.topic)})` : ""}: ${plain(w.reason)}`,
      explore ? `기준 점수(${settings.minScore}) 아래지만 반응을 아직 모르는 주제라 시험 삼아 골랐습니다` : null,
      risk.ok ? "저위험 기준 통과" : null,
      gen.aiNote,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 2000);

    const candidateId = await db
      .transaction(async (tx) => {
        const claimed = await tx
          .update(feedItems)
          .set({ status: "promoted" })
          .where(and(inArray(feedItems.id, w.itemIds), eq(feedItems.status, "new")))
          .returning({ id: feedItems.id });
        if (claimed.length !== w.itemIds.length) throw CLAIM_LOST; // an editor took an item meanwhile
        const [cand] = await tx
          .insert(candidates)
          .values({
            status: "review",
            mode: "feed_draft",
            beat,
            priority: w.scores.final,
            experimentId: w.items[0].source.experimentId,
            draft: gen.draft,
            checks,
            aiNote,
            generator: { ...gen.meta, desk: { decisionId: w.id, score: w.scores.final, lowRisk: risk.ok, lowRiskWhy: risk.why, ...(explore ? { explore: true } : {}) } },
          })
          .returning({ id: candidates.id });
        await tx.insert(candidateItems).values(w.items.map((r, i) => ({ candidateId: cand.id, feedItemId: r.id, role: i === 0 ? "primary" : "supporting" })));
        await tx.update(deskDecisions).set({ candidateId: cand.id, draftedAt: now, lowRisk: risk.ok }).where(eq(deskDecisions.id, w.id));
        await logActivity(tx, {
          actorId: null,
          kind: "draft",
          entityType: "candidate",
          entityId: cand.id,
          summary: `AI 데스크 초안 (${w.scores.final}점): ${gen.draft.title}`.slice(0, 300),
          meta: { decisionId: w.id, topic: w.topic, lowRisk: risk.ok, explore, items: w.itemIds },
        });
        return cand.id;
      })
      .catch((e) => {
        if (e === CLAIM_LOST) return null;
        throw e;
      });
    if (!candidateId) {
      await closeDecision(db, w.id, "skip", `편집자가 먼저 처리한 자료 — ${w.reason}`);
      return;
    }
    report.drafted.push({ candidateId, title: gen.draft.title, score: w.scores.final, lowRisk: risk.ok });
  });
}

/* ───────────────────────── the pass ───────────────────────── */

export async function runDesk(d: DeskDeps): Promise<DeskRunReport> {
  const { db, now } = d;
  const settings = d.settings ?? (await loadDeskSettings(db));
  const report: DeskRunReport = { runId: null, note: "", itemsSeen: 0, stories: 0, queued: 0, drafted: [], costUsd: 0 };
  if (!settings.enabled && d.trigger === "schedule") return { ...report, note: "꺼짐" };

  const [run] = await db.insert(deskRuns).values({ startedAt: now, trigger: d.trigger }).returning({ id: deskRuns.id });
  report.runId = run.id;
  const notes: string[] = [];
  const finish = async (error?: string) => {
    report.note = [
      `자료 ${report.itemsSeen}건 · 사건 ${report.stories}건 · 초안 ${report.drafted.length}건 · 대기 ${report.queued}건 · $${report.costUsd.toFixed(4)}`,
      ...notes,
    ].join(" · ");
    await db
      .update(deskRuns)
      .set({
        finishedAt: new Date(),
        itemsSeen: report.itemsSeen,
        stories: report.stories,
        drafted: report.drafted.length,
        costUsd: report.costUsd,
        note: report.note.slice(0, 1000),
        error: error?.slice(0, 1000) ?? null,
      })
      .where(eq(deskRuns.id, run.id));
    return report;
  };

  try {
    if (!d.create) {
      notes.push("ANTHROPIC_API_KEY가 없어 쉬었습니다");
      return await finish();
    }
    const [deskSpent, allSpent] = await Promise.all([deskSpendUsd(db), aiMonthSpendUsd(db)]);
    const budgetLeft = () => Math.min(settings.monthlyBudgetUsd - deskSpent, d.globalCapUsd - allSpent) - report.costUsd;
    if (budgetLeft() <= 0) {
      notes.push(deskSpent >= settings.monthlyBudgetUsd ? `이번 달 데스크 예산($${settings.monthlyBudgetUsd})을 다 써서 쉬었습니다` : `뉴스룸 전체 AI 한도($${d.globalCapUsd})를 다 써서 쉬었습니다`);
      return await finish();
    }

    // stories that waited too long leave the queue
    await db
      .update(deskDecisions)
      .set({ decision: "skip", reason: sql`concat(${`${QUEUE_HOURS}시간 동안 차례가 오지 않음 — `}::text, ${deskDecisions.reason})` })
      .where(and(eq(deskDecisions.decision, "draft"), isNull(deskDecisions.draftedAt), lt(deskDecisions.at, new Date(now.getTime() - QUEUE_HOURS * HOUR))));

    const recent = await recentWork(db, now);
    const rows = await loadItems(
      db,
      and(eq(feedItems.status, "new"), isNull(feedItems.deskDecisionId), eq(feedItems.isSample, false), gte(feedItems.fetchedAt, new Date(now.getTime() - FRESH_HOURS * HOUR)), AI_ALLOWED),
      MAX_ITEMS,
    );
    report.itemsSeen = rows.length;
    if (rows.length) await judgeNew(d, run.id, settings, rows, recent.all, report, notes);

    await draftFromQueue(d, run.id, settings, recent, budgetLeft, report, notes);

    const [q] = await db
      .select({ n: count() })
      .from(deskDecisions)
      .where(and(eq(deskDecisions.decision, "draft"), isNull(deskDecisions.draftedAt), gte(deskDecisions.at, new Date(now.getTime() - QUEUE_HOURS * HOUR))));
    report.queued = Number(q?.n ?? 0);
    return await finish();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notes.push(`오류: ${msg.slice(0, 200)}`);
    await finish(msg).catch(() => {});
    throw e;
  }
}
