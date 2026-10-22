import { gte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { aiUsage } from "@/db/schema";
import type { UsageLedger } from "./claude";

/** Claude calls this calendar month (server time zone, UTC on Railway), in USD. */
export async function aiMonthSpendUsd(db: Pick<DB, "select">): Promise<number> {
  const [r] = await db
    .select({ usd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(gte(aiUsage.at, sql`date_trunc('month', now())`));
  return Number(r?.usd ?? 0);
}

/** Usage ledger in `ai_usage`. A failed insert is logged, never thrown — the draft matters more than the row. */
export function dbLedger(db: DB): UsageLedger {
  return {
    monthSpendUsd: () => aiMonthSpendUsd(db),
    async record(e) {
      try {
        await db.insert(aiUsage).values({
          purpose: e.purpose.slice(0, 40),
          model: e.model.slice(0, 80),
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          cacheReadTokens: e.cacheReadTokens,
          cacheWriteTokens: e.cacheWriteTokens,
          costUsd: e.costUsd,
          latencyMs: e.latencyMs,
          ok: e.ok,
          error: e.error ? e.error.slice(0, 300) : null,
        });
      } catch (err) {
        console.error("[ai-usage] could not record a Claude call:", (err as Error).message);
      }
    },
  };
}
