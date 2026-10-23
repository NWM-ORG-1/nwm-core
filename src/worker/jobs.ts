import { desc, eq, sql } from "drizzle-orm";
import { db, rawSql } from "@/db/client";
import { ingestRuns } from "@/db/schema";

/**
 * Periodic jobs next to the source runs (derived metrics, sentiment, retention).
 * Each job takes a Postgres advisory lock, so a second worker never runs it twice.
 */

export interface JobResult {
  seen?: number;
  inserted?: number;
  updated?: number;
  note?: string;
  /** cache tags to refresh on the site */
  tags?: string[];
  /** stored with the run (spend, counts) */
  meta?: Record<string, unknown>;
}

export interface Job {
  name: string;
  /** seconds between runs */
  everySec: number;
  /** run at this second offset inside each period (e.g. hourly at :05 → 300) */
  offsetSec?: number;
  /** checked in each slot before running; false = nothing to do, and no run is logged */
  due?(now: Date): Promise<boolean>;
  run(now: Date): Promise<JobResult>;
}

export class JobScheduler {
  private last = new Map<string, number>();
  private running = new Map<string, Promise<void>>();

  constructor(
    private readonly jobs: Job[],
    private readonly onTags: (tags: string[]) => void,
    private readonly log: (m: string) => void,
  ) {}

  /** Remember when each job last ran so a restart does not re-run everything at once. */
  async load() {
    for (const j of this.jobs) {
      const [r] = await db.select({ at: ingestRuns.startedAt }).from(ingestRuns).where(eq(ingestRuns.job, j.name)).orderBy(desc(ingestRuns.startedAt)).limit(1);
      if (r) this.last.set(j.name, r.at.getTime());
    }
  }

  /** Start every job whose slot has come, without waiting for them. */
  tick(now = Date.now()) {
    for (const j of this.jobs) {
      if (this.running.has(j.name)) continue;
      const period = j.everySec * 1000;
      const slot = Math.floor((now - (j.offsetSec ?? 0) * 1000) / period) * period + (j.offsetSec ?? 0) * 1000;
      const last = this.last.get(j.name) ?? 0;
      if (last >= slot) continue;
      this.last.set(j.name, now);
      const p = this.runOne(j).finally(() => this.running.delete(j.name));
      this.running.set(j.name, p);
    }
  }

  /** Resolves when the jobs running now have finished (shutdown). */
  idle(): Promise<unknown> {
    return Promise.allSettled(this.running.values());
  }

  private async runOne(j: Job) {
    const started = Date.now();
    const sqlc = rawSql();
    const conn = await sqlc.reserve();
    try {
      const [{ ok }] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(hashtext(${`nwm-job:${j.name}`})) as ok`;
      if (!ok) return;
      try {
        if (j.due && !(await j.due(new Date(started)))) return;
        const r = await j.run(new Date(started));
        await db.insert(ingestRuns).values({
          job: j.name,
          startedAt: new Date(started),
          durationMs: Date.now() - started,
          outcome: "ok",
          seen: r.seen ?? 0,
          inserted: r.inserted ?? 0,
          updated: r.updated ?? 0,
          meta: { ...(r.note ? { note: r.note } : {}), ...r.meta },
        });
        if (r.tags?.length) this.onTags(r.tags);
        if (r.note) this.log(`[job ${j.name}] ${r.note}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log(`[job ${j.name}] error: ${message}`);
        await db
          .insert(ingestRuns)
          .values({ job: j.name, startedAt: new Date(started), durationMs: Date.now() - started, outcome: "error", error: message.slice(0, 1000) })
          .catch(() => {});
      } finally {
        await conn`select pg_advisory_unlock(hashtext(${`nwm-job:${j.name}`}))`;
      }
    } finally {
      conn.release();
    }
  }
}

/** Seconds of a value in `sql` interval form — used by job queries. */
export const ago = (sec: number) => sql`now() - make_interval(secs => ${sec})`;
