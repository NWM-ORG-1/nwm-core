import "server-only";
import { and, count, desc, eq, gte, isNull, max, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { articles, candidates, deskDecisions, deskLessons, deskRuns, feedItems, feedSources, siteSettings } from "@/db/schema";
import { countPendingCases } from "../desk/lessons";
import { deskSpendUsd, draftedToday, QUEUE_HOURS } from "../desk/run";
import { kstDayStart } from "../desk/score";
import { loadDeskSettings } from "../desk/settings";
import { draftGeneratorConfig } from "../generator/config";
import { aiMonthSpendUsd } from "../generator/ledger";
import type { StatusSnapshot } from "./format";

/** What /status reports: the worker, the collectors, the AI desk and the newsroom queue, read straight from the database. */

const HOUR = 3_600_000;
/** an active source this many failed runs in a row is listed as failing */
const FAILING_RUNS = 3;

export async function loadStatus(db: DB, now = new Date()): Promise<StatusSnapshot> {
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  const [beat, byStatus, failing, items, lastCheck, settings, drafted, queued, lastRun, deskUsd, allUsd, queue, publishedToday, notes, waiting] = await Promise.all([
    db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "worker.heartbeat") }),
    db.select({ status: feedSources.status, n: count() }).from(feedSources).groupBy(feedSources.status),
    db
      .select({ name: feedSources.name, error: feedSources.lastError, lastSuccessAt: feedSources.lastSuccessAt })
      .from(feedSources)
      .where(or(eq(feedSources.status, "error"), and(eq(feedSources.status, "active"), gte(feedSources.failCount, FAILING_RUNS))))
      .orderBy(desc(feedSources.failCount))
      .limit(3),
    db
      .select({
        hour: sql<number>`count(*) filter (where ${feedItems.fetchedAt} > ${new Date(now.getTime() - HOUR).toISOString()}::timestamptz)::int`,
        day: count(),
        lastNew: max(feedItems.fetchedAt),
      })
      .from(feedItems)
      .where(and(eq(feedItems.isSample, false), gte(feedItems.fetchedAt, new Date(now.getTime() - 24 * HOUR)))),
    db.select({ at: max(feedSources.lastFetchedAt) }).from(feedSources),
    loadDeskSettings(db),
    draftedToday(db, now),
    db
      .select({ n: count() })
      .from(deskDecisions)
      .where(and(eq(deskDecisions.decision, "draft"), isNull(deskDecisions.draftedAt), gte(deskDecisions.at, new Date(now.getTime() - QUEUE_HOURS * HOUR)))),
    db.select().from(deskRuns).orderBy(desc(deskRuns.startedAt)).limit(1),
    deskSpendUsd(db),
    aiMonthSpendUsd(db),
    db
      .select({ review: sql<number>`count(*) filter (where ${candidates.status} = 'review')::int`, scheduled: sql<number>`count(*) filter (where ${candidates.status} = 'scheduled')::int` })
      .from(candidates)
      .where(eq(candidates.isSample, false)),
    db
      .select({ n: count() })
      .from(articles)
      .where(and(eq(articles.status, "published"), eq(articles.isSample, false), gte(articles.publishedAt, kstDayStart(now)))),
    db.select({ n: count() }).from(deskLessons),
    countPendingCases(db),
  ]);

  const statusCount = (s: string) => Number(byStatus.find((r) => r.status === s)?.n ?? 0);
  const run = lastRun[0];
  return {
    workerBeatAt: (beat?.value as { at?: string } | undefined)?.at ?? null,
    sources: {
      active: statusCount("active"),
      paused: statusCount("paused"),
      error: statusCount("error"),
      failing: failing.map((f) => ({ name: f.name, error: f.error, lastSuccessAt: iso(f.lastSuccessAt) })),
    },
    items: { hour: Number(items[0]?.hour ?? 0), day: Number(items[0]?.day ?? 0), lastCheckAt: iso(lastCheck[0]?.at), lastNewAt: iso(items[0]?.lastNew) },
    desk: {
      enabled: settings.enabled,
      cadenceMin: settings.cadenceMin,
      dailyDrafts: settings.dailyDrafts,
      draftedToday: drafted,
      queued: Number(queued[0]?.n ?? 0),
      lastRun: run ? { at: run.startedAt.toISOString(), seen: run.itemsSeen, stories: run.stories, drafted: run.drafted, error: run.error } : null,
      spendUsd: deskUsd,
      budgetUsd: settings.monthlyBudgetUsd,
      allUsd,
      capUsd: draftGeneratorConfig().budgetUsd,
    },
    newsroom: { review: Number(queue[0]?.review ?? 0), scheduled: Number(queue[0]?.scheduled ?? 0), publishedToday: Number(publishedToday[0]?.n ?? 0) },
    lessons: { notes: Number(notes[0]?.n ?? 0), waiting },
  };
}
