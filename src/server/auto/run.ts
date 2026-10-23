import type { DB } from "@/db/client";
import type { Draft } from "@/lib/content/blocks";
import {
  buildCryptoMove,
  buildDataDraft,
  buildExchangeEvent,
  DATA_TEMPLATES,
  EXCHANGE_TEMPLATE,
  moveChangePct,
  type DataTemplateId,
} from "../generator/data-templates";
import { autoKeyExists, createAutoCandidate } from "./create";
import { exchangeEvents, hourlyCloses, listedMarkets, liveQuotes, marketInputs, metricReading, publicSentiment, type HourlyClose } from "./inputs";
import { dailySlot, loadAutoSettings, type AutoSettings } from "./settings";

export interface AutoRunReport {
  created: Array<{ template: DataTemplateId; id: string; status: "review" | "scheduled"; title: string }>;
  skipped: string[];
}

const MOVE_ASSETS = [
  { symbol: "BTC", name: "비트코인" },
  { symbol: "ETH", name: "이더리움" },
] as const;

/** The latest hourly close that ended 40–105 minutes ago: there is always one, about an hour back. */
export function referenceClose(closes: HourlyClose[], now: Date): HourlyClose | undefined {
  return [...closes].reverse().find((c) => now.getTime() - c.end.getTime() >= 40 * 60_000 && now.getTime() - c.end.getTime() <= 105 * 60_000);
}

function dateLabel(now: Date) {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/** One pass of the automatic desk: whatever is due now is made once. */
export async function runAutoArticles(db: DB, now: Date, settings?: AutoSettings): Promise<AutoRunReport> {
  const s = settings ?? (await loadAutoSettings(db));
  const report: AutoRunReport = { created: [], skipped: [] };
  const store = async (template: DataTemplateId, draft: Draft, key: string, itemIds?: string[], note?: string) => {
    const setting = s[template as keyof AutoSettings];
    const mode = setting?.mode === "auto" ? "auto" : "review";
    const r = await createAutoCandidate(db, { template, draft, mode, key, now, itemIds, note });
    if (r) report.created.push({ template, id: r.id, status: r.status, title: draft.title });
  };

  // ── daily briefs ──
  for (const template of ["crypto_daily", "sentiment_daily"] as const) {
    const setting = s[template];
    if (setting.mode === "off") continue;
    const slot = dailySlot(now, setting.time ?? (DATA_TEMPLATES[template].trigger as { defaultTime: string }).defaultTime);
    if (!slot.due) continue;
    const key = `${template}:${slot.ymd}`;
    if (await autoKeyExists(db, key)) continue;
    if (template === "crypto_daily") {
      const market = await marketInputs(db, now);
      const draft = buildDataDraft("crypto_daily", { quotes: market.quotes, sentiment: [], dateLabel: dateLabel(now), market });
      if (!draft) {
        report.skipped.push("크립토 데일리: 최근 2시간 시세 없음");
        continue;
      }
      await store(template, draft, key, [], `정기 자동 기사 · 매일 ${setting.time} (KST)`);
    } else {
      const sentiment = await publicSentiment(db);
      if (!sentiment) {
        report.skipped.push("투자심리 데일리: 지수 비공개 또는 최근 값 없음");
        continue;
      }
      const draft = buildDataDraft("sentiment_daily", { quotes: [], sentiment, dateLabel: dateLabel(now) });
      if (!draft) {
        report.skipped.push("투자심리 데일리: 지수 값 없음");
        continue;
      }
      await store(template, draft, key, [], `정기 자동 기사 · 매일 ${setting.time} (KST)`);
    }
  }

  // ── sharp moves ──
  if (s.crypto_move.mode !== "off") {
    const threshold = s.crypto_move.threshold ?? 3;
    const quotes = await liveQuotes(db, now, 15);
    const k = new Date(now.getTime() + 9 * 3_600_000);
    const window = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}:${Math.floor(k.getUTCHours() / 6)}`;
    for (const a of MOVE_ASSETS) {
      const q = quotes.find((x) => x.symbol === a.symbol && x.currency === "USD");
      if (!q) continue;
      const closes = await hourlyCloses(db, a.symbol, now);
      const ref = referenceClose(closes, now);
      if (!ref) continue;
      const change = moveChangePct({ price: q.price, refPrice: ref.value });
      if (!Number.isFinite(change) || Math.abs(change) < threshold) continue;
      const key = `crypto_move:${a.symbol}:${window}`;
      if (await autoKeyExists(db, key)) continue;
      const krw = quotes.find((x) => x.symbol === `KRW-${a.symbol}`);
      const [kimchi, fearGreed] = await Promise.all([metricReading(db, "kimchi_premium", a.symbol, now, 2), metricReading(db, "fear_greed", "CRYPTO", now, 36)]);
      const draft = buildCryptoMove({
        symbol: a.symbol,
        name: a.name,
        price: q.price,
        asOf: q.asOf,
        refPrice: ref.value,
        refAt: ref.end,
        change24h: q.changePct,
        hourly: closes.map((c) => c.value),
        krwPrice: krw?.price,
        kimchi: kimchi?.value,
        fearGreed: fearGreed?.value,
      });
      await store("crypto_move", draft, key, [], `급변동 자동 기사 · 1시간 ${change.toFixed(2)}% (기준 ±${threshold}%)`);
    }
  }

  // ── exchange market changes ──
  const wanted = (Object.keys(EXCHANGE_TEMPLATE) as Array<keyof typeof EXCHANGE_TEMPLATE>).filter((c) => s[EXCHANGE_TEMPLATE[c] as keyof AutoSettings].mode !== "off");
  if (wanted.length) {
    const groups = (await exchangeEvents(db, now)).filter((g) => wanted.includes(g.change));
    const listedOn = groups.length ? await listedMarkets(db) : {};
    for (const g of groups) {
      const template = EXCHANGE_TEMPLATE[g.change];
      const key = `${template}:${g.exchange}:${g.at.toISOString().slice(0, 16)}`;
      if (await autoKeyExists(db, key)) continue;
      const draft = buildExchangeEvent({ exchange: g.exchange, change: g.change, markets: g.markets, at: g.at, listedOn });
      if (!draft) continue;
      await store(template, draft, key, g.itemIds, `거래소 마켓 목록 변화 · ${g.markets.map((m) => m.market).join(", ")}`.slice(0, 500));
    }
  }

  return report;
}
