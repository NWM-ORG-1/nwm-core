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
import { closeDb, db } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { syncCatalog } from "@/ingest/catalog/sync";
import { HostLimiter, sleep } from "@/ingest/http";
import { JobScheduler } from "./jobs";
import { WORKER_JOBS } from "./jobs/index";
import { Revalidator } from "./revalidate";
import { claimDue, releaseLeases, runSource } from "./runner";

const TICK_MS = 5_000;
const HEARTBEAT_MS = 30_000;

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

function concurrency(): number {
  const n = Number(process.env.WORKER_CONCURRENCY ?? 4);
  return Number.isFinite(n) ? Math.min(16, Math.max(1, Math.round(n))) : 4;
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
  if (process.env.WORKER_SYNC_CATALOG !== "0") {
    const r = await syncCatalog();
    if (r.inserted.length) log(`catalog: added ${r.inserted.join(", ")}`);
  }
  const revalidator = new Revalidator(log);
  const scheduler = new JobScheduler(WORKER_JOBS, (tags) => revalidator.queue(tags), log);
  await scheduler.load();

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

  log(`worker started (concurrency ${limit}, jobs: ${WORKER_JOBS.map((j) => j.name).join(", ")})`);
  let lastBeat = 0;
  let paused = false;
  while (!stopping) {
    const t0 = Date.now();
    try {
      paused = await isPaused();
      if (t0 - lastBeat >= HEARTBEAT_MS) {
        await heartbeat({ running: running.size, concurrency: limit, paused });
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
  await Promise.race([Promise.allSettled([...running.values(), scheduler.idle()]), sleep(25_000)]);
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
