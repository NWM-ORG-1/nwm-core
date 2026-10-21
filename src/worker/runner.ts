import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, feedSources, ingestRuns } from "@/db/schema";
import { executeAdapter } from "@/ingest/execute";
import { HostLimiter, HttpError } from "@/ingest/http";
import { ConfigError } from "@/ingest/types";
import { persistResult, type Counts } from "./persist";

/**
 * One source run: claim → adapter → persist → health bookkeeping → run log.
 * Leases make concurrent workers safe; a crashed worker's lease just expires.
 */

export type SourceRow = typeof feedSources.$inferSelect;

export interface RunReport extends Counts {
  sourceId: string;
  slug: string;
  outcome: "ok" | "not_modified" | "skipped" | "error";
  durationMs: number;
  httpStatus?: number;
  error?: string;
  note?: string;
}

const LEASE_SEC = 300;
/** errors in a row before a source shows as "error" in the newsroom */
const ERROR_AFTER = 3;
const MAX_BACKOFF_SEC = 6 * 3600;
const CONFIG_RETRY_SEC = 3600;

/** Due, active, real sources nobody else holds — leased in one statement. */
export async function claimDue(limit: number): Promise<SourceRow[]> {
  if (limit <= 0) return [];
  const rows = await db.execute<{ id: string }>(sql`
    update feed_sources set lease_until = now() + make_interval(secs => ${LEASE_SEC})
    where id in (
      select id from feed_sources
      where status in ('active', 'error') and adapter <> 'manual' and is_sample = false
        and (next_run_at is null or next_run_at <= now())
        and (lease_until is null or lease_until < now())
      order by next_run_at asc nulls first
      limit ${limit}
      for update skip locked
    )
    returning id`);
  if (!rows.length) return [];
  return db.query.feedSources.findMany({ where: inArray(feedSources.id, rows.map((r) => r.id)) });
}

/** ±10 % so sources configured alike do not fire in lockstep. */
export function nextDelaySec(base: number, failCount: number, retryAfterSec?: number): number {
  if (failCount <= 0) return Math.round(base * (0.9 + Math.random() * 0.2));
  const backoff = Math.min(MAX_BACKOFF_SEC, Math.max(60, base * 2 ** (failCount - 1)));
  return Math.max(Math.max(base, backoff), retryAfterSec ?? 0);
}

export async function runSource(src: SourceRow, limiter: HostLimiter, log: (m: string) => void = () => {}): Promise<RunReport> {
  const now = new Date();
  const base: Omit<RunReport, "outcome"> = { sourceId: src.id, slug: src.slug, seen: 0, inserted: 0, updated: 0, durationMs: 0 };
  try {
    const ex = await executeAdapter(
      {
        id: src.id,
        slug: src.slug,
        name: src.name,
        url: src.url,
        lang: src.lang,
        beats: src.beats,
        trustTier: src.trustTier,
        signalOnly: src.signalOnly,
        pollIntervalSec: src.pollIntervalSec,
        adapter: src.adapter,
        config: src.config,
        auth: src.auth,
        state: src.state,
      },
      { limiter, now, log: (m) => log(`[${src.slug}] ${m}`) },
    );
    const counts = await db.transaction(async (tx) => {
      const c = await persistResult(
        tx,
        { id: src.id, beats: src.beats, trustTier: src.trustTier, signalOnly: src.signalOnly, lang: src.lang, licRetentionDays: src.licRetentionDays, config: src.config },
        ex.result,
        now,
      );
      const delay = ex.result.nextRunInSec ?? nextDelaySec(src.pollIntervalSec, 0);
      await tx
        .update(feedSources)
        .set({
          state: ex.state,
          lastFetchedAt: now,
          lastSuccessAt: now,
          lastError: null,
          failCount: 0,
          status: src.status === "error" ? "active" : src.status,
          nextRunAt: new Date(Date.now() + delay * 1000),
          leaseUntil: null,
        })
        .where(eq(feedSources.id, src.id));
      return c;
    });
    const outcome = ex.result.notModified && counts.inserted === 0 && counts.updated === 0 ? "not_modified" : "ok";
    const report: RunReport = { ...base, ...counts, outcome, durationMs: ex.durationMs, httpStatus: ex.httpStatus, note: ex.result.note };
    await recordRun(report, ex.result.usage);
    if (src.status === "error") await logSource(src, `수집 복구: ${src.name}`, { previousError: src.lastError });
    return report;
  } catch (err) {
    const durationMs = Date.now() - now.getTime();
    const isConfig = err instanceof ConfigError;
    const message = describe(err);
    const httpStatus = err instanceof HttpError ? err.status : undefined;
    const failCount = isConfig ? src.failCount : src.failCount + 1;
    const delay = isConfig ? CONFIG_RETRY_SEC : nextDelaySec(src.pollIntervalSec, failCount, err instanceof HttpError ? err.retryAfterSec : undefined);
    const becomesError = !isConfig && failCount >= ERROR_AFTER && src.status === "active";
    await db
      .update(feedSources)
      .set({
        lastFetchedAt: now,
        lastError: message.slice(0, 500),
        failCount,
        status: becomesError ? "error" : src.status,
        nextRunAt: new Date(Date.now() + delay * 1000),
        leaseUntil: null,
      })
      .where(eq(feedSources.id, src.id));
    const report: RunReport = { ...base, outcome: isConfig ? "skipped" : "error", durationMs, httpStatus, error: message };
    await recordRun(report);
    if (becomesError) await logSource(src, `수집 오류 ${failCount}회 연속: ${src.name}`, { error: message });
    log(`[${src.slug}] ${report.outcome}: ${message}`);
    return report;
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "시간 초과";
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    return cause ? `${err.message} (${cause})` : err.message;
  }
  return String(err);
}

async function recordRun(r: RunReport, usage?: { unit: string; count: number; costUsd?: number }) {
  await db.insert(ingestRuns).values({
    sourceId: r.sourceId,
    job: "source",
    durationMs: r.durationMs,
    outcome: r.outcome,
    httpStatus: r.httpStatus ?? null,
    seen: r.seen,
    inserted: r.inserted,
    updated: r.updated,
    error: r.error?.slice(0, 1000) ?? null,
    meta: { ...(r.note ? { note: r.note } : {}), ...(usage ? { usage } : {}) },
  });
}

async function logSource(src: SourceRow, summary: string, meta: Record<string, unknown>) {
  await db.insert(activityLog).values({ actorId: null, kind: "source", entityType: "source", entityId: src.id, summary, meta });
}

/** On shutdown: hand unfinished sources back immediately instead of waiting for the lease. */
export async function releaseLeases(ids: string[]) {
  if (!ids.length) return;
  await db.update(feedSources).set({ leaseUntil: null }).where(inArray(feedSources.id, ids));
}
