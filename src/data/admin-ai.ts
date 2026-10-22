import "server-only";
import { desc, gte, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { modelInfo } from "@/lib/ai/models";
import { requireStaff } from "@/server/auth";
import { draftGeneratorConfig, type DraftGeneratorConfig } from "@/server/generator/config";

/** Read model for the AI draft panel in 설정: configuration (never the key) and this month's Claude spend. */

export interface AiUsageAdmin {
  config: DraftGeneratorConfig & { modelLabel: string; assistModelLabel: string };
  month: { usd: number; calls: number; failed: number };
  byPurpose: Array<{ purpose: string; calls: number; usd: number }>;
  lastError: { at: string; purpose: string; error: string } | null;
}

export async function getAiUsageAdmin(): Promise<AiUsageAdmin> {
  await connection();
  await requireStaff();
  const config = draftGeneratorConfig();
  const thisMonth = gte(aiUsage.at, sql`date_trunc('month', now())`);
  const [rows, [lastError]] = await Promise.all([
    db
      .select({
        purpose: sql<string>`split_part(${aiUsage.purpose}, ':', 1)`,
        calls: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where not ${aiUsage.ok}))::int`,
        usd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8`,
      })
      .from(aiUsage)
      .where(thisMonth)
      .groupBy(sql`1`),
    db
      .select({ at: aiUsage.at, purpose: aiUsage.purpose, error: aiUsage.error })
      .from(aiUsage)
      .where(sql`${thisMonth} and not ${aiUsage.ok}`)
      .orderBy(desc(aiUsage.at))
      .limit(1),
  ]);
  return {
    config: { ...config, modelLabel: modelInfo(config.model).label, assistModelLabel: modelInfo(config.assistModel).label },
    month: {
      usd: rows.reduce((s, r) => s + Number(r.usd), 0),
      calls: rows.reduce((s, r) => s + r.calls, 0),
      failed: rows.reduce((s, r) => s + r.failed, 0),
    },
    byPurpose: rows.map((r) => ({ purpose: r.purpose, calls: r.calls, usd: Number(r.usd) })).sort((a, b) => b.usd - a.usd),
    lastError: lastError ? { at: lastError.at.toISOString(), purpose: lastError.purpose, error: lastError.error ?? "" } : null,
  };
}
