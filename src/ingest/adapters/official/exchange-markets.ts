import { z } from "zod";
import { defineAdapter, type IngestItem } from "../../types";

const CAUTIONS = ["PRICE_FLUCTUATIONS", "TRADING_VOLUME_SOARING", "DEPOSIT_AMOUNT_SOARING", "GLOBAL_PRICE_DIFFERENCES", "CONCENTRATION_OF_SMALL_ACCOUNTS"] as const;
const CAUTION_KO: Record<(typeof CAUTIONS)[number], string> = {
  PRICE_FLUCTUATIONS: "가격 급등락",
  TRADING_VOLUME_SOARING: "거래량 급등",
  DEPOSIT_AMOUNT_SOARING: "입금량 급등",
  GLOBAL_PRICE_DIFFERENCES: "글로벌 시세 차이",
  CONCENTRATION_OF_SMALL_ACCOUNTS: "소수 계정 거래 집중",
};

const config = z.object({
  exchange: z.enum(["upbit", "bithumb"]),
  /** market prefixes to watch: KRW, BTC, USDT */
  quotes: z.array(z.enum(["KRW", "BTC", "USDT"])).min(1).default(["KRW"]),
  /** Upbit 투자주의 reasons to report (they flap; off by default) */
  cautions: z.array(z.enum(CAUTIONS)).default([]),
});

interface MarketRow {
  market: string;
  korean_name?: string;
  english_name?: string;
  market_warning?: string;
  market_event?: { warning?: boolean; caution?: Partial<Record<(typeof CAUTIONS)[number], boolean>> };
}

interface Snapshot {
  /** warning flag */
  w: 0 | 1;
  /** active caution reasons */
  c?: string[];
  n?: string;
}

const NAMES = { upbit: "업비트", bithumb: "빗썸" } as const;
const BASE = { upbit: "https://api.upbit.com", bithumb: "https://api.bithumb.com" } as const;

/**
 * Listings, delistings and warning designations from the exchanges' public
 * market lists (official API). The first run only remembers the current state.
 */
export const exchangeMarketsAdapter = defineAdapter({
  key: "exchange.markets",
  label: "거래소 상장·유의종목 변동",
  description: "업비트·빗썸 공개 마켓 목록을 비교해 신규 거래지원, 거래지원 종료, 유의(경고) 지정·해제를 속보 후보로 만듭니다. 첫 실행은 기준선만 저장합니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: { exchange: "upbit", quotes: ["KRW"], cautions: [] },
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const ex = NAMES[c.exchange];
    const res = await ctx.http.request(`${BASE[c.exchange]}/v1/market/all?isDetails=true`, { conditional: true, timeoutMs: 15_000 });
    if (res.notModified) return { notModified: true };
    const rows = JSON.parse(res.text) as MarketRow[];
    if (!Array.isArray(rows) || rows.length < 10) throw new Error(`${ex} market list looks wrong (${Array.isArray(rows) ? rows.length : typeof rows})`);

    const prev = (ctx.state.markets ?? null) as Record<string, Snapshot> | null;
    const next: Record<string, Snapshot> = {};
    for (const r of rows) {
      if (!c.quotes.some((q) => r.market.startsWith(`${q}-`))) continue;
      const warning = r.market_event?.warning ?? r.market_warning === "CAUTION";
      const cautions = CAUTIONS.filter((k) => r.market_event?.caution?.[k]);
      next[r.market] = { w: warning ? 1 : 0, ...(cautions.length ? { c: cautions } : {}), n: r.korean_name ?? r.english_name };
    }
    if (!prev) return { state: { markets: next, since: ctx.now.toISOString() }, note: `기준선 ${Object.keys(next).length}개 마켓` };

    // a partial list (upstream glitch) must not read as mass delisting
    const removed = Object.keys(prev).filter((m) => !next[m]);
    if (removed.length > Math.max(5, Object.keys(prev).length * 0.1)) {
      throw new Error(`${ex}: ${removed.length} markets missing at once — list ignored`);
    }

    const stamp = ctx.now.toISOString().slice(0, 16);
    const items: IngestItem[] = [];
    const label = (market: string, s?: Snapshot) => {
      const [quote, coin] = market.split("-");
      return { coin, quote, name: s?.n ? `${s.n}(${coin})` : coin };
    };
    const push = (market: string, kind: string, title: string, weight: number, extra: Record<string, unknown> = {}) => {
      const l = label(market, next[market] ?? prev[market]);
      items.push({
        externalId: `${c.exchange}:${market}:${kind}:${stamp}`,
        url: c.exchange === "upbit" ? `https://upbit.com/exchange?code=CRIX.UPBIT.${market}` : `https://www.bithumb.com/react/trade/order/${l.coin}-${l.quote}`,
        title,
        summary: `${ex} ${l.quote} 마켓 · ${kind === "listed" ? "마켓 목록에 새로 나타남" : kind === "delisted" ? "마켓 목록에서 사라짐" : "마켓 상태 변경"} · 거래소 공지로 사유·일정을 확인하세요.`,
        beatGuess: "crypto",
        entities: [l.coin],
        weight,
        payload: { exchange: c.exchange, market, change: kind, coin: l.coin, quote: l.quote, name: (next[market] ?? prev[market])?.n ?? null, ...extra },
      });
    };

    for (const [market, s] of Object.entries(next)) {
      const before = prev[market];
      const { name, quote } = label(market, s);
      if (!before) {
        push(market, "listed", `${ex} 신규 거래지원: ${name} ${quote} 마켓`, 0.9);
        continue;
      }
      if (s.w && !before.w) push(market, "warning", `${ex} 유의 종목 지정: ${name}`, 0.9);
      if (!s.w && before.w) push(market, "warning_lifted", `${ex} 유의 종목 해제: ${name}`, 0.6);
      const added = (s.c ?? []).filter((k) => !(before.c ?? []).includes(k) && c.cautions.includes(k as (typeof CAUTIONS)[number]));
      if (added.length) push(market, `caution-${added.join("+")}`, `${ex} 투자주의: ${name} — ${added.map((k) => CAUTION_KO[k as (typeof CAUTIONS)[number]]).join(", ")}`, 0.45, { reasons: added });
    }
    for (const market of removed) {
      push(market, "delisted", `${ex} 거래지원 종료: ${label(market, prev[market]).name} ${market.split("-")[0]} 마켓`, 0.8);
    }
    return { items, state: { markets: next, since: ctx.state.since ?? ctx.now.toISOString() }, note: `${Object.keys(next).length}개 마켓, 변동 ${items.length}` };
  },
});
