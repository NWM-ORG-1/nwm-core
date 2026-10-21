/**
 * NWM feed worker — a separate process next to the web service.
 *
 *   dev:  npm run worker
 *   prod: node dist/worker.cjs   (Railway: second service, same image)
 *
 * Every few seconds it leases due sources (feed_sources.next_run_at), runs their
 * adapters with bounded concurrency, stores the results and records health;
 * periodic jobs (derived metrics, sentiment, retention) run alongside.
 */
import { hostname } from "node:os";
import { eq, sql } from "drizzle-orm";
import journal from "../../drizzle/meta/_journal.json";
import { closeDb, db } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { syncCatalog } from "@/ingest/catalog/sync";
import { HostLimiter, sleep } from "@/ingest/http";
import { adapterCatalog } from "@/ingest/registry";
import { sentimentModel } from "@/sentiment/llm";
import { JobScheduler } from "./jobs";
import { WORKER_JOBS } from "./jobs/index";
import { llmBudgetUsd } from "./jobs/sentiment-score";
import { Revalidator } from "./revalidate";
import { claimDue, releaseLeases, runSource } from "./runner";

const TICK_MS = 5_000;
const HEARTBEAT_MS = 30_000;
/** Postgres: undefined_table, undefined_column, invalid_schema_name */
const NOT_MIGRATED = new Set(["42P01", "42703", "3F000"]);

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

function concurrency(): number {
  const n = Number(process.env.WORKER_CONCURRENCY ?? 4);
  return Number.isFinite(n) ? Math.min(16, Math.max(1, Math.round(n))) : 4;
}

/**
 * Migrations run in the web service's build. A worker deployed from the same
 * push can start first: it waits for the migrations it was built with (drizzle
 * records each one's journal time) instead of crash-looping into the restart limit.
 */
async function waitForMigrations(signal: AbortSignal): Promise<boolean> {
  const needed = journal.entries[journal.entries.length - 1];
  for (let i = 0; !signal.aborted; i++) {
    let applied = 0;
    try {
      const [row] = await db.execute<{ at: string | null }>(sql`select max(created_at)::text as at from drizzle.__drizzle_migrations`);
      applied = Number(row?.at ?? 0);
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (!NOT_MIGRATED.has(e.code ?? e.cause?.code ?? "")) throw err;
    }
    if (applied >= needed.when) return true;
    if (i % 10 === 0) log(`waiting for migration ${needed.tag} (applied by the web service build)`);
    await sleep(30_000, signal).catch(() => {});
  }
  return false;
}

/**
 * Credential names (never values) and AI settings as this process sees them.
 * In production the worker is its own service with its own variables, so the
 * newsroom reads these from the heartbeat rather than from its own environment.
 */
function envReport() {
  const names = new Set(["ANTHROPIC_API_KEY", ...adapterCatalog().flatMap((a) => a.envVars.map((v) => v.name))]);
  return {
    keys: [...names].filter((n) => process.env[n]?.trim()).sort(),
    llm: { model: sentimentModel(), budgetUsd: llmBudgetUsd() },
  };
}

let pausedCache: { at: number; value: boolean } = { at: 0, value: false };
/** Newsroom kill switch: site_settings "ingest" = { paused: true } */
async function isPaused(): Promise<boolean> {
  if (Date.now() - pausedCache.at < 30_000) return pausedCache.value;
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "ingest") });
  const value = Boolean((row?.value as { paused?: boolean } | undefined)?.paused);
  pausedCache = { at: Date.now(), value };
  return value;
}

async function heartbeat(info: Record<string, unknown>) {
  const value = { at: new Date().toISOString(), host: hostname(), pid: process.pid, version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", ...info };
  await db
    .insert(siteSettings)
    .values({ key: "worker.heartbeat", value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const limit = concurrency();
  const limiter = new HostLimiter();
  const running = new Map<string, Promise<void>>();
  let stopping = false;
  const stop = new AbortController();
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      if (stopping) process.exit(1);
      stopping = true;
      stop.abort();
      log(`${sig}: finishing ${running.size} running source(s)`);
    });
  }

  if (!(await waitForMigrations(stop.signal))) {
    await closeDb();
    return;
  }
  if (process.env.WORKER_SYNC_CATALOG !== "0") {
    const r = await syncCatalog();
    if (r.inserted.length) log(`catalog: added ${r.inserted.join(", ")}`);
  }
  const revalidator = new Revalidator(log);
  const scheduler = new JobScheduler(WORKER_JOBS, (tags) => revalidator.queue(tags), log);
  await scheduler.load();

  const env = envReport();
  log(`worker started (concurrency ${limit}, keys: ${env.keys.join(", ") || "none"}, jobs: ${WORKER_JOBS.map((j) => j.name).join(", ")})`);
  let lastBeat = 0;
  let paused = false;
  while (!stopping) {
    const t0 = Date.now();
    try {
      paused = await isPaused();
      if (t0 - lastBeat >= HEARTBEAT_MS) {
        await heartbeat({ running: running.size, concurrency: limit, paused, ...env });
        lastBeat = t0;
      }
      if (!paused) {
        for (const src of await claimDue(limit - running.size)) {
          const p = runSource(src, limiter, log)
            .then((r) => {
              if (r.outcome === "ok" && (r.inserted || r.updated)) log(`[${r.slug}] +${r.inserted} new, ${r.updated} updated (${r.durationMs} ms)`);
            })
            .catch((err) => log(`[${src.slug}] crashed: ${(err as Error).message}`))
            .finally(() => running.delete(src.id));
          running.set(src.id, p);
        }
        scheduler.tick();
      }
      await revalidator.flush();
    } catch (err) {
      log(`tick failed: ${(err as Error).message}`);
    }
    await sleep(Math.max(500, TICK_MS - (Date.now() - t0)), stop.signal).catch(() => {});
  }

  const pending = [...running.keys()];
  // wait up to 25 s for running work; the timer must not outlive the race or it holds the process open
  const drained = new AbortController();
  await Promise.race([Promise.allSettled([...running.values(), scheduler.idle()]), sleep(25_000, drained.signal).catch(() => {})]);
  drained.abort();
  await releaseLeases(pending.filter((id) => running.has(id))).catch(() => {});
  await revalidator.flush();
  await closeDb();
  log("worker stopped");
}

main().catch(async (err) => {
  log(`worker failed: ${(err as Error).stack ?? err}`);
  await closeDb().catch(() => {});
  process.exit(1);
});
