import "server-only";
import { inArray, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { correctionRequests } from "@/db/schema";
import { requireStaff } from "@/server/auth";

/**
 * Supplementary read model for the dashboard, activity, settings and stories
 * screens. Same contract as src/data/admin.ts: always dynamic, always re-verified.
 */

/** The database clock — the same clock every dashboard query windows on. */
export async function getDashboardClock() {
  await connection();
  await requireStaff();
  const [r] = await db.execute<{ now_ms: number; hour_ms: number }>(sql`select
      (extract(epoch from now()) * 1000)::float8 as now_ms,
      (extract(epoch from date_trunc('hour', now())) * 1000)::float8 as hour_ms`);
  return { nowMs: Number(r.now_ms), hourStartMs: Number(r.hour_ms) };
}

/** Entry counts per activity kind (all time) for the filter tabs. */
export async function getActivityKindCounts(): Promise<{ total: number; byKind: Record<string, number> }> {
  await connection();
  await requireStaff();
  const rows = await db.execute<{ kind: string; n: number }>(sql`select kind, count(*)::int as n from activity_log group by kind`);
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  return { total: rows.reduce((a, r) => a + r.n, 0), byKind };
}

/** correction_request id → article id, so request entries can link to their article. */
export async function getRequestArticleIds(requestIds: string[]): Promise<Record<string, string>> {
  await connection();
  await requireStaff();
  const ids = [...new Set(requestIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return {};
  const rows = await db
    .select({ id: correctionRequests.id, articleId: correctionRequests.articleId })
    .from(correctionRequests)
    .where(inArray(correctionRequests.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.articleId]));
}

/** Open (not yet published or rejected) candidates per story. */
export async function getStoryPipeline(): Promise<Record<string, number>> {
  await connection();
  await requireStaff();
  const rows = await db.execute<{ story_id: string; n: number }>(sql`
    select story_id, count(*)::int as n from candidates
     where story_id is not null and status in ('new', 'drafting', 'review', 'scheduled')
     group by story_id`);
  return Object.fromEntries(rows.map((r) => [r.story_id, r.n]));
}

export type CheckState = "ok" | "todo" | "info";

/**
 * Launch checklist state. Only booleans and public flags leave the server —
 * never the secret values themselves.
 */
export async function getOpsChecklist() {
  await connection();
  await requireStaff();
  const env = process.env;
  const [r] = await db.execute<{ samples: number }>(sql`select (
      (select count(*) from articles where is_sample) +
      (select count(*) from stories where is_sample) +
      (select count(*) from candidates where is_sample) +
      (select count(*) from correction_requests where is_sample)
    )::int as samples`);
  const secret = env.INTERNAL_API_SECRET?.trim() ?? "";
  return {
    adminUsers: Boolean(env.ADMIN_USERS?.trim()),
    internalSecret: (!secret ? "missing" : secret === "change-me" || secret.length < 24 ? "weak" : "ok") as "missing" | "weak" | "ok",
    sampleRows: r.samples,
    siteLock: env.SITE_LOCK === "1",
    production: env.NODE_ENV === "production",
  };
}
