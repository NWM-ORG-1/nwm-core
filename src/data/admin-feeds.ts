import "server-only";
import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { experiments, feedItems, feedSources, type FeedItemStatus } from "@/db/schema";
import type { InboxFilters } from "@/data/admin";
import { adapterCatalog } from "@/ingest/registry";
import { requireStaff } from "@/server/auth";

/**
 * Extra read models for the feeds / sources / experiments screens.
 * Same contract as src/data/admin.ts: always dynamic, always re-verifies staff
 * before touching the database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Experiments for group headers and pickers (no funnel maths). */
export async function getExperimentOptions() {
  await connection();
  await requireStaff();
  const rows = await db
    .select({ id: experiments.id, code: experiments.code, name: experiments.name, status: experiments.status, colorSlot: experiments.colorSlot })
    .from(experiments)
    .orderBy(asc(experiments.code));
  // "H10" sorts after "H9"
  return rows.sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));
}

/**
 * One experiment for the edit form, plus what the form needs to warn about
 * (colour slots and codes already in use) and the sources attached to it.
 * `id === null` → defaults for a new hypothesis. Returns null for an unknown id.
 */
export async function getExperimentForEdit(id: string | null) {
  await connection();
  await requireStaff();
  const all = await db
    .select({ id: experiments.id, code: experiments.code, name: experiments.name, colorSlot: experiments.colorSlot, status: experiments.status })
    .from(experiments)
    .orderBy(asc(experiments.code));

  const used = new Set(all.map((e) => Number(e.code.slice(1))).filter(Number.isFinite));
  let next = 1;
  while (used.has(next)) next++;
  const slotUse = [1, 2, 3, 4].map((s) => ({ slot: s, n: all.filter((e) => e.colorSlot === s && e.status !== "concluded").length }));
  const freeSlot = [...slotUse].sort((a, b) => a.n - b.n || a.slot - b.slot)[0].slot;

  if (id === null) {
    return {
      experiment: null,
      others: all,
      suggested: { code: `H${next}`, colorSlot: freeSlot },
      sources: [],
    };
  }
  if (!UUID.test(id)) return null;
  const e = await db.query.experiments.findFirst({ where: eq(experiments.id, id) });
  if (!e) return null;
  const sources = await db
    .select({ id: feedSources.id, name: feedSources.name, slug: feedSources.slug, status: feedSources.status })
    .from(feedSources)
    .where(eq(feedSources.experimentId, e.id))
    .orderBy(asc(feedSources.name));
  return {
    experiment: {
      id: e.id,
      code: e.code,
      name: e.name,
      hypothesis: e.hypothesis,
      primaryMetric: e.primaryMetric,
      status: e.status,
      colorSlot: e.colorSlot,
      notes: e.notes,
      startedAt: iso(e.startedAt),
      endedAt: iso(e.endedAt),
      createdAt: e.createdAt.toISOString(),
    },
    others: all.filter((o) => o.id !== e.id),
    suggested: { code: e.code, colorSlot: e.colorSlot },
    sources,
  };
}

/** Recent intake and health of one source (side panel of the source editor). */
export async function getSourceActivity(id: string) {
  await connection();
  await requireStaff();
  if (!UUID.test(id)) return null;
  const s = await db.query.feedSources.findFirst({
    where: eq(feedSources.id, id),
    columns: { id: true, status: true, lastFetchedAt: true, lastError: true, licReviewedAt: true, licReviewedBy: true, createdAt: true },
  });
  if (!s) return null;
  const [stats] = await db.execute<{ items24h: number; items7d: number; promoted7d: number; dismissed7d: number; total: number }>(sql`
    select
      count(*) filter (where fetched_at >= now() - interval '24 hours')::int as items24h,
      count(*) filter (where fetched_at >= now() - interval '7 days')::int as items7d,
      count(*) filter (where status = 'promoted' and fetched_at >= now() - interval '7 days')::int as promoted7d,
      count(*) filter (where status = 'dismissed' and fetched_at >= now() - interval '7 days')::int as dismissed7d,
      count(*)::int as total
    from feed_items where source_id = ${s.id}`);
  const recent = await db
    .select({ id: feedItems.id, title: feedItems.title, status: feedItems.status, score: feedItems.score, fetchedAt: feedItems.fetchedAt })
    .from(feedItems)
    .where(eq(feedItems.sourceId, s.id))
    .orderBy(desc(feedItems.fetchedAt))
    .limit(8);
  return {
    status: s.status,
    lastFetchedAt: iso(s.lastFetchedAt),
    lastError: s.lastError,
    reviewedAt: iso(s.licReviewedAt),
    reviewedBy: s.licReviewedBy,
    createdAt: s.createdAt.toISOString(),
    stats,
    recent: recent.map((r) => ({ ...r, fetchedAt: r.fetchedAt.toISOString() })),
  };
}

/** Pickers and client-side checks for the source form: adapters, keys present, slugs taken. */
export async function getSourceFormOptions() {
  await connection();
  await requireStaff();
  const rows = await db.select({ id: feedSources.id, slug: feedSources.slug, name: feedSources.name, adapter: feedSources.adapter }).from(feedSources);
  const catalog = adapterCatalog();
  // which credentials are configured on this server — names only, never values
  const envPresent = Object.fromEntries(catalog.flatMap((a) => a.envVars).map((v) => [v.name, Boolean(process.env[v.name]?.trim())]));
  return {
    adapters: [...new Set(["manual", ...rows.map((r) => r.adapter)])].sort(),
    slugs: rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
    catalog,
    envPresent,
  };
}

/**
 * Inbox tab counts under the active filters (source / hypothesis / beat / score /
 * keyword), mirroring the WHERE clause of getInbox. getInbox's own counts are
 * global; the page uses these only when a filter is set.
 */
export async function getInboxCounts(f: Omit<InboxFilters, "status">): Promise<Record<FeedItemStatus, number>> {
  await connection();
  await requireStaff();
  const where: SQL[] = [];
  if (f.source) where.push(eq(feedSources.slug, f.source));
  if (f.experiment) where.push(eq(experiments.code, f.experiment));
  if (f.beat) where.push(eq(feedItems.beatGuess, f.beat));
  if (f.minScore) where.push(gte(feedItems.score, f.minScore));
  if (f.q) where.push(or(ilike(feedItems.title, `%${f.q}%`), ilike(feedItems.summary, `%${f.q}%`))!);
  const rows = await db
    .select({ status: feedItems.status, n: sql<number>`count(*)::int` })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .leftJoin(experiments, eq(feedSources.experimentId, experiments.id))
    .where(where.length ? and(...where) : undefined)
    .groupBy(feedItems.status);
  const out: Record<FeedItemStatus, number> = { new: 0, promoted: 0, dismissed: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}
