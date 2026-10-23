import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { feedSources, ingestRuns, marketMetrics, sentimentSnapshots, siteSettings } from "@/db/schema";
import { credentialStatus } from "@/ingest/execute";
import { getAdapter } from "@/ingest/registry";
import { requireStaff } from "@/server/auth";

/**
 * Read models for the collection screens (수집 현황, 투자심리, source health).
 * Always dynamic; staff re-verified like every admin loader.
 */

/** Raw SQL rows carry timestamps as strings; query-builder rows as Dates. */
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setting<T>(key: string): Promise<T | undefined> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, key) });
  return row?.value as T | undefined;
}

export interface WorkerBeat {
  at: string;
  host?: string;
  version?: string;
  running?: number;
  concurrency?: number;
  paused?: boolean;
  /** credential names set on the worker — values never leave it */
  keys?: string[];
  llm?: { model: string; budgetUsd: number };
}

/**
 * Keys and AI settings as the collector sees them. In production the worker is
 * its own service with its own variables and reports them in its heartbeat;
 * until a worker has reported, this server's variables stand in.
 */
function collectorEnvOf(beat: WorkerBeat | undefined) {
  const env: Record<string, string | undefined> = beat?.keys ? Object.fromEntries(beat.keys.map((k) => [k, "set"])) : process.env;
  const llm = beat?.llm ?? { model: process.env.SENTIMENT_MODEL?.trim() || "claude-haiku-5-5", budgetUsd: Number(process.env.SENTIMENT_LLM_MONTHLY_USD ?? 30) };
  return { env, llm: { ...llm, enabled: Boolean(env.ANTHROPIC_API_KEY?.trim()) } };
}

export async function collectorEnv() {
  return collectorEnvOf(await setting<WorkerBeat>("worker.heartbeat"));
}

export async function getIngestOverview() {
  await connection();
  await requireStaff();
  const [beat, ingest] = await Promise.all([setting<WorkerBeat>("worker.heartbeat"), setting<{ paused?: boolean }>("ingest")]);
  const collector = collectorEnvOf(beat);

  const sources = await db.execute<{
    id: string;
    slug: string;
    name: string;
    adapter: string;
    status: "active" | "paused" | "error";
    origin: string;
    last_success_at: string | null;
    last_fetched_at: string | null;
    next_run_at: string | null;
    fail_count: number;
    last_error: string | null;
    poll_interval_sec: number;
    runs24h: number;
    errors24h: number;
    new24h: number;
  }>(sql`
    select s.id, s.slug, s.name, s.adapter, s.status, s.origin, s.last_success_at, s.last_fetched_at, s.next_run_at,
           s.fail_count, s.last_error, s.poll_interval_sec,
           coalesce(r.runs, 0)::int as runs24h, coalesce(r.errors, 0)::int as errors24h, coalesce(r.inserted, 0)::int as new24h
    from feed_sources s
    left join (
      select source_id, count(*) as runs, count(*) filter (where outcome = 'error') as errors, sum(inserted) as inserted
      from ingest_runs where started_at > now() - interval '24 hours' and source_id is not null group by source_id
    ) r on r.source_id = s.id
    where s.is_sample = false and s.adapter <> 'manual'
    order by (s.status = 'error') desc, (s.last_error is not null) desc, s.name`);

  const recentErrors = await db
    .select({ at: ingestRuns.startedAt, job: ingestRuns.job, sourceId: ingestRuns.sourceId, error: ingestRuns.error, httpStatus: ingestRuns.httpStatus })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.outcome, "error"), gt(ingestRuns.startedAt, sql`now() - interval '24 hours'`)))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(15);

  const jobs = await db.execute<{ job: string; started_at: string; outcome: string; duration_ms: number; note: string | null; error: string | null }>(sql`
    select distinct on (job) job, started_at, outcome, duration_ms, meta->>'note' as note, error
    from ingest_runs where job <> 'source' order by job, started_at desc`);

  const [spend] = await db.execute<{ llm_usd: number; x_posts: number }>(sql`
    select
      coalesce(sum((meta->>'costUsd')::float8) filter (where job = 'sentiment.score'), 0) as llm_usd,
      coalesce(sum((meta->'usage'->>'count')::int) filter (where meta->'usage'->>'unit' = 'x_post_read'), 0)::int as x_posts
    from ingest_runs where started_at >= date_trunc('month', now())`);

  const names = new Map(sources.map((s) => [s.id, s.name]));
  const list = sources.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    adapter: s.adapter,
    adapterLabel: getAdapter(s.adapter)?.label ?? s.adapter,
    status: s.status,
    lastSuccessAt: iso(s.last_success_at),
    lastFetchedAt: iso(s.last_fetched_at),
    nextRunAt: iso(s.next_run_at),
    failCount: s.fail_count,
    lastError: s.last_error,
    pollIntervalSec: s.poll_interval_sec,
    runs24h: s.runs24h,
    errors24h: s.errors24h,
    new24h: s.new24h,
    needsKey: Boolean(s.last_error?.startsWith("키 필요")),
  }));
  return {
    worker: beat ? { ...beat, ageSec: Math.round((Date.now() - Date.parse(beat.at)) / 1000) } : null,
    paused: Boolean(ingest?.paused),
    counts: {
      active: list.filter((s) => s.status === "active").length,
      error: list.filter((s) => s.status === "error" || s.failCount > 0).length,
      paused: list.filter((s) => s.status === "paused").length,
      needsKey: list.filter((s) => s.needsKey).length,
      new24h: list.reduce((a, s) => a + s.new24h, 0),
    },
    sources: list,
    recentErrors: recentErrors.map((e) => ({ ...e, at: e.at.toISOString(), source: e.sourceId ? (names.get(e.sourceId) ?? "—") : e.job })),
    jobs: jobs.map((j) => ({ job: j.job, at: new Date(j.started_at).toISOString(), outcome: j.outcome, durationMs: j.duration_ms, note: j.note, error: j.error })),
    spend: {
      llmUsd: Number(spend?.llm_usd ?? 0),
      llmBudgetUsd: collector.llm.budgetUsd,
      llmEnabled: collector.llm.enabled,
      xPosts: Number(spend?.x_posts ?? 0),
    },
  };
}

/** Health, credentials and recent runs for the source editor. */
export async function getSourceHealth(id: string) {
  await connection();
  await requireStaff();
  if (!UUID.test(id)) return null;
  const s = await db.query.feedSources.findFirst({ where: eq(feedSources.id, id) });
  if (!s) return null;
  const runs = await db
    .select({ at: ingestRuns.startedAt, outcome: ingestRuns.outcome, durationMs: ingestRuns.durationMs, httpStatus: ingestRuns.httpStatus, seen: ingestRuns.seen, inserted: ingestRuns.inserted, updated: ingestRuns.updated, error: ingestRuns.error, meta: ingestRuns.meta })
    .from(ingestRuns)
    .where(eq(ingestRuns.sourceId, id))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(10);
  const adapter = getAdapter(s.adapter);
  const { env } = await collectorEnv();
  return {
    adapter: adapter ? { key: adapter.key, label: adapter.label, description: adapter.description, defaultPollSec: adapter.defaultPollSec } : null,
    credentials: credentialStatus({ adapter: s.adapter, auth: s.auth }, env).map((c) => ({ name: c.name, required: c.required, help: c.help, present: c.present })),
    notes: s.notes,
    origin: s.origin,
    isSample: s.isSample,
    lastSuccessAt: iso(s.lastSuccessAt),
    nextRunAt: iso(s.nextRunAt),
    failCount: s.failCount,
    lastError: s.lastError,
    runs: runs.map((r) => ({ ...r, at: r.at.toISOString(), note: (r.meta as { note?: string }).note ?? null })),
  };
}

export async function getSentimentAdmin() {
  await connection();
  await requireStaff();
  const settings = (await setting<{ public?: boolean; publicSince?: string }>("sentiment")) ?? {};
  const latestAt = await db
    .select({ at: sentimentSnapshots.at })
    .from(sentimentSnapshots)
    .where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.scopeKey, "index")))
    .orderBy(desc(sentimentSnapshots.at))
    .limit(1);
  const at = latestAt[0]?.at;
  const latest = at
    ? await db
        .select()
        .from(sentimentSnapshots)
        .where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.at, at)))
        .orderBy(desc(sentimentSnapshots.volume))
    : [];
  const series = await db
    .select({ at: sentimentSnapshots.at, score: sentimentSnapshots.score, confidence: sentimentSnapshots.confidence, shadow: sentimentSnapshots.shadow })
    .from(sentimentSnapshots)
    .where(and(eq(sentimentSnapshots.isSample, false), eq(sentimentSnapshots.scopeKey, "index"), gt(sentimentSnapshots.at, sql`now() - interval '14 days'`)))
    .orderBy(sentimentSnapshots.at);
  const fng = await db
    .select({ at: marketMetrics.at, value: marketMetrics.value })
    .from(marketMetrics)
    .where(and(eq(marketMetrics.metric, "fear_greed"), gt(marketMetrics.at, sql`now() - interval '14 days'`)))
    .orderBy(marketMetrics.at);
  const scoring = await db.execute<{ scored_by: string | null; label: string | null; n: number }>(sql`
    select scored_by, label, count(*)::int as n from social_posts
    where fetched_at > now() - interval '24 hours' group by 1, 2`);
  const [queue] = await db.execute<{ n: number }>(sql`select count(*)::int as n from social_posts where scored_at is null and text is not null`);
  const [spend] = await db.execute<{ usd: number }>(sql`
    select coalesce(sum((meta->>'costUsd')::float8), 0) as usd from ingest_runs
    where job = 'sentiment.score' and started_at >= date_trunc('month', now())`);
  const { llm } = await collectorEnv();
  return {
    public: Boolean(settings.public),
    publicSince: settings.publicSince ?? null,
    latest: latest.map((r) => ({
      scopeKey: r.scopeKey,
      label: r.label,
      at: r.at.toISOString(),
      score: r.score,
      change24h: r.change24h,
      volume: r.volume,
      bullish: r.bullish,
      bearish: r.bearish,
      confidence: r.confidence,
      shadow: r.shadow,
      components: r.components,
      sources: r.sources,
      keywords: r.keywords,
    })),
    series: series.map((p) => ({ at: p.at.toISOString(), score: p.score, confidence: p.confidence, shadow: p.shadow })),
    fearGreed: fng.map((p) => ({ at: p.at.toISOString(), value: p.value })),
    scoring: scoring.map((r) => ({ by: r.scored_by ?? "대기", label: r.label ?? "—", n: r.n })),
    queue: queue?.n ?? 0,
    llm: { usd: Number(spend?.usd ?? 0), ...llm },
  };
}


