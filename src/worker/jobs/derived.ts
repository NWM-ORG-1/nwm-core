import { and, gt, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { marketMetrics, marketQuotes } from "@/db/schema";
import type { Job } from "../jobs";

/**
 * Numbers computed from stored quotes. Kimchi premium: Upbit KRW price against
 * the global USD price converted at the official USD/KRW rate. Kept as a
 * metric for editors and the sentiment index, not shown in the ticker.
 */
export const derivedJob: Job = {
  name: "market.derived",
  everySec: 600,
  offsetSec: 120,
  async run(now) {
    const symbols = ["BTC", "ETH", "KRW-BTC", "KRW-ETH", "USDKRW"];
    const rows = await db
      .select({ symbol: marketQuotes.symbol, price: marketQuotes.price, asOf: marketQuotes.asOf })
      .from(marketQuotes)
      .where(and(inArray(marketQuotes.symbol, symbols), ne(marketQuotes.source, "mock"), gt(marketQuotes.asOf, new Date(now.getTime() - 5 * 86_400_000))));
    const q = new Map(rows.map((r) => [r.symbol, r]));
    const fx = q.get("USDKRW");
    const fresh = (s: string) => {
      const r = q.get(s);
      return r && now.getTime() - r.asOf.getTime() < 2 * 3_600_000 ? r : undefined;
    };
    if (!fx) return { note: "USD/KRW 없음 — 건너뜀" };
    const at = new Date(Math.floor(now.getTime() / 600_000) * 600_000);
    const out: Array<typeof marketMetrics.$inferInsert> = [];
    for (const coin of ["BTC", "ETH"]) {
      const usd = fresh(coin);
      const krw = fresh(`KRW-${coin}`);
      if (!usd || !krw) continue;
      const premium = (krw.price / (usd.price * fx.price) - 1) * 100;
      if (Number.isFinite(premium) && Math.abs(premium) < 50) out.push({ metric: "kimchi_premium", symbol: coin, source: "derived", at, value: Math.round(premium * 1000) / 1000 });
    }
    if (out.length) {
      await db
        .insert(marketMetrics)
        .values(out)
        .onConflictDoNothing();
    }
    return { inserted: out.length, note: out.map((m) => `${m.symbol} ${m.value}%`).join(", ") || "시세 부족" };
  },
};

