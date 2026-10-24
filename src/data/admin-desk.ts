import "server-only";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { articles, candidates, deskDecisions, deskPlaybooks, deskRuns, siteSettings, staff, type Beat, type CandidateStatus, type DeskDecision, type DeskScores } from "@/db/schema";
import { requireStaff } from "@/server/auth";
import { loadDeskModel } from "@/server/desk/learn";
import { countPendingCases, HALF_LIFE_DAYS, LESSON_CHARS, LESSON_MIN_CASES, lessonWeight, loadLessons, MAX_LESSONS, scopeLabel } from "@/server/desk/lessons";
import { activePlaybook } from "@/server/desk/playbook";
import { deskSpendUsd, draftedToday, QUEUE_HOURS } from "@/server/desk/run";
import { pacedAllowance } from "@/server/desk/score";
import { loadDeskSettings, loadDeskState, type DeskSettings } from "@/server/desk/settings";
import type { DeskModel } from "@/server/desk/types";
import { draftGeneratorConfig } from "@/server/generator/config";
import { aiMonthSpendUsd } from "@/server/generator/ledger";
import { collectorEnv } from "./admin-ingest";

/** Read model for 뉴스룸 → AI 데스크: what it decided, what it learned, how it is set. */

const HOUR = 3_600_000;

export interface DeskDecisionRow {
  id: string;
  at: string;
  decision: DeskDecision;
  /** judged worth drafting and still waiting for a slot */
  waiting: boolean;
  beat: Beat | null;
  topic: string;
  angle: string;
  reason: string;
  scores: DeskScores;
  lowRisk: boolean;
  items: number;
  lead: { title: string; source: string } | null;
  candidate: { id: string; title: string; status: CandidateStatus; articleSlug: string | null } | null;
}

export interface DeskRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  itemsSeen: number;
  stories: number;
  drafted: number;
  costUsd: number;
  note: string;
  error: string | null;
}

export interface DeskAdmin {
  settings: DeskSettings;
  model: DeskModel;
  playbook: { version: number; body: string; source: string; notes: string; createdAt: string };
  history: Array<{ version: number; source: string; notes: string; createdAt: string; by: string | null; body: string }>;
  decisions: DeskDecisionRow[];
  runs: DeskRunRow[];
  today: { drafted: number; allowedNow: number; queued: number };
  outcomes30d: Record<"review" | "published" | "rejected" | "other", number>;
  spend: { deskUsd: number; allUsd: number; capUsd: number };
  worker: { alive: boolean; hasKey: boolean; lastBeat: string | null };
  pending: { run: boolean; reflect: boolean };
  reflectedAt: string | null;
  lessons: {
    notes: Array<{ id: string; text: string; scope: string; scopeLabel: string; hits: number; lastSeenAt: string; pinned: boolean; origin: string; fading: boolean }>;
    /** edited drafts the next review will read */
    waiting: number;
    reviewedAt: string | null;
    requested: boolean;
    max: number;
    halfLifeDays: number;
    minCases: number;
    chars: number;
  };
}

export async function getDeskAdmin(): Promise<DeskAdmin> {
  await connection();
  await requireStaff();
  const now = new Date();
  const since = new Date(now.getTime() - 24 * HOUR);

  const [settings, state, model, playbook, history, runs, decisions, deskUsd, allUsd, drafted, queued, outcomes, collector, beat] = await Promise.all([
    loadDeskSettings(db),
    loadDeskState(db),
    loadDeskModel(db),
    activePlaybook(db),
    db
      .select({ version: deskPlaybooks.version, source: deskPlaybooks.source, notes: deskPlaybooks.notes, createdAt: deskPlaybooks.createdAt, by: staff.name, body: deskPlaybooks.body })
      .from(deskPlaybooks)
      .leftJoin(staff, eq(staff.id, deskPlaybooks.createdById))
      .orderBy(desc(deskPlaybooks.version))
      .limit(12),
    db.select().from(deskRuns).orderBy(desc(deskRuns.startedAt)).limit(12),
    db
      .select({
        id: deskDecisions.id,
        at: deskDecisions.at,
        decision: deskDecisions.decision,
        draftedAt: deskDecisions.draftedAt,
        beat: deskDecisions.beat,
        topic: deskDecisions.topic,
        angle: deskDecisions.angle,
        reason: deskDecisions.reason,
        scores: deskDecisions.scores,
        lowRisk: deskDecisions.lowRisk,
        items: sql<number>`cardinality(${deskDecisions.itemIds})`,
        leadTitle: sql<string | null>`(select fi.title from feed_items fi where fi.id = ${deskDecisions.itemIds}[1])`,
        leadSource: sql<string | null>`(select s.name from feed_items fi join feed_sources s on s.id = fi.source_id where fi.id = ${deskDecisions.itemIds}[1])`,
        candId: candidates.id,
        candTitle: sql<string | null>`${candidates.draft}->>'title'`,
        candStatus: candidates.status,
        slug: articles.slug,
      })
      .from(deskDecisions)
      .leftJoin(candidates, eq(candidates.id, deskDecisions.candidateId))
      .leftJoin(articles, eq(articles.id, candidates.articleId))
      .where(or(gte(deskDecisions.at, since), gte(deskDecisions.draftedAt, since)))
      .orderBy(desc(deskDecisions.at))
      .limit(400),
    deskSpendUsd(db),
    aiMonthSpendUsd(db),
    draftedToday(db, now),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(deskDecisions)
      .where(and(eq(deskDecisions.decision, "draft"), isNull(deskDecisions.draftedAt), gte(deskDecisions.at, new Date(now.getTime() - QUEUE_HOURS * HOUR)))),
    db.execute<{ status: CandidateStatus; n: number }>(sql`
      select c.status, count(*)::int as n from desk_decisions d join candidates c on c.id = d.candidate_id
      where d.drafted_at > now() - interval '30 days' group by c.status`),
    collectorEnv(),
    db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "worker.heartbeat") }),
  ]);

  const [lessons, waitingCases] = await Promise.all([loadLessons(db), countPendingCases(db)]);
  const lastRun = runs[0]?.startedAt;
  const beatAt = (beat?.value as { at?: string } | undefined)?.at ?? null;
  const out30 = { review: 0, published: 0, rejected: 0, other: 0 };
  for (const r of outcomes) {
    const k = r.status === "review" || r.status === "published" || r.status === "rejected" ? r.status : "other";
    out30[k] += Number(r.n);
  }

  return {
    settings,
    model,
    playbook,
    history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    decisions: decisions.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      decision: r.decision,
      waiting: r.decision === "draft" && !r.draftedAt,
      beat: r.beat,
      topic: r.topic,
      angle: r.angle,
      reason: r.reason,
      scores: r.scores,
      lowRisk: r.lowRisk,
      items: Number(r.items),
      lead: r.leadTitle ? { title: r.leadTitle, source: r.leadSource ?? "" } : null,
      candidate: r.candId && r.candStatus ? { id: r.candId, title: r.candTitle ?? "(제목 없음)", status: r.candStatus, articleSlug: r.slug } : null,
    })),
    runs: runs.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      trigger: r.trigger,
      itemsSeen: r.itemsSeen,
      stories: r.stories,
      drafted: r.drafted,
      costUsd: r.costUsd,
      note: r.note ?? "",
      error: r.error,
    })),
    today: {
      drafted,
      allowedNow: settings.pacing === "spread" ? Math.min(settings.dailyDrafts, pacedAllowance(settings.dailyDrafts, now)) : settings.dailyDrafts,
      queued: Number(queued[0]?.n ?? 0),
    },
    outcomes30d: out30,
    spend: { deskUsd, allUsd, capUsd: draftGeneratorConfig().budgetUsd },
    worker: { alive: Boolean(beatAt && now.getTime() - Date.parse(beatAt) < 3 * 60_000), hasKey: Boolean(collector.env.ANTHROPIC_API_KEY?.trim()), lastBeat: beatAt },
    pending: {
      run: Boolean(state.runRequestedAt && (!lastRun || Date.parse(state.runRequestedAt) > lastRun.getTime())),
      reflect: Boolean(state.reflectRequestedAt && (!state.reflectedAt || Date.parse(state.reflectRequestedAt) > Date.parse(state.reflectedAt))),
    },
    reflectedAt: state.reflectedAt ?? null,
    lessons: {
      notes: lessons
        .sort((a, b) => lessonWeight(b, now) - lessonWeight(a, now))
        .map((l) => ({
          id: l.id,
          text: l.text,
          scope: l.scope,
          scopeLabel: scopeLabel(l.scope),
          hits: l.hits,
          lastSeenAt: l.lastSeenAt.toISOString(),
          pinned: l.pinned,
          origin: l.origin,
          // under one sighting's worth of weight: the next review may retire it
          fading: !l.pinned && lessonWeight(l, now) < 1,
        })),
      waiting: waitingCases,
      reviewedAt: state.lessonsAt ?? null,
      requested: Boolean(state.lessonsRequestedAt && (!state.lessonsAt || Date.parse(state.lessonsRequestedAt) > Date.parse(state.lessonsAt))),
      max: MAX_LESSONS,
      halfLifeDays: HALF_LIFE_DAYS,
      minCases: LESSON_MIN_CASES,
      chars: LESSON_CHARS,
    },
  };
}
