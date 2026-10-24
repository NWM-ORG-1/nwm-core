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

const EXCHANGES = ["upbit", "bithumb", "coinone", "digitalx", "gopax"] as const;
type Exchange = (typeof EXCHANGES)[number];

const config = z.object({
  exchange: z.enum(EXCHANGES),
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

const NAMES: Record<Exchange, string> = { upbit: "업비트", bithumb: "빗썸", coinone: "코인원", digitalx: "디지털엑스(옛 코빗)", gopax: "고팍스" };

type Ctx = Parameters<typeof exchangeMarketsAdapter.run>[0];

/**
 * Each exchange's public market list as Upbit-style rows ("KRW-BTC"). Coinone,
 * Digital X and GOPAX only say whether a market trades: a market that stops
 * trading reads as one that left the list.
 */
async function marketList(ctx: Ctx): Promise<MarketRow[] | null> {
  const c = ctx.config;
  const get = async <T>(url: string) => {
    const res = await ctx.http.request(url, { conditional: true, timeoutMs: 15_000, headers: { accept: "application/json" } });
    return res.notModified ? null : (JSON.parse(res.text) as T);
  };
  const upper = (quote: string, base: string) => `${quote.toUpperCase()}-${base.toUpperCase()}`;
  switch (c.exchange) {
    case "upbit":
    case "bithumb":
      return get<MarketRow[]>(`${c.exchange === "upbit" ? "https://api.upbit.com" : "https://api.bithumb.com"}/v1/market/all?isDetails=true`);
    case "coinone": {
      const rows: MarketRow[] = [];
      for (const q of c.quotes) {
        const r = await get<{ result?: string; markets?: Array<{ quote_currency: string; target_currency: string; trade_status?: number }> }>(`https://api.coinone.co.kr/public/v2/markets/${q}`);
        if (r === null) return null;
        if (r.result !== "success" || !Array.isArray(r.markets)) throw new Error(`코인원 마켓 목록 응답이 이상합니다 (${q})`);
        for (const m of r.markets) if (m.trade_status === 1) rows.push({ market: upper(m.quote_currency, m.target_currency) });
      }
      return rows;
    }
    case "digitalx": {
      const r = await get<{ success?: boolean; data?: Array<{ status?: string; baseCurrency: string; quoteCurrency: string }> }>("https://api.digitalx.miraeasset.com/v2/currencyPairs");
      if (r === null) return null;
      if (!r.success || !Array.isArray(r.data)) throw new Error("디지털엑스 마켓 목록 응답이 이상합니다");
      return r.data.filter((m) => m.status === "launched").map((m) => ({ market: upper(m.quoteCurrency, m.baseCurrency) }));
    }
    case "gopax": {
      const r = await get<Array<{ baseAsset: string; quoteAsset: string }>>("https://api.gopax.co.kr/trading-pairs");
      if (r === null) return null;
      if (!Array.isArray(r)) throw new Error("고팍스 마켓 목록 응답이 이상합니다");
      return r.map((m) => ({ market: upper(m.quoteAsset, m.baseAsset) }));
    }
  }
}

function marketUrl(exchange: Exchange, market: string): string | null {
  const [quote, coin] = market.split("-");
  if (exchange === "upbit") return `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`;
  if (exchange === "bithumb") return `https://www.bithumb.com/react/trade/order/${coin}-${quote}`;
  return null;
}

/**
 * Listings, delistings and warning designations from the exchanges' public
 * market lists (official API). The first run only remembers the current state.
 */
export const exchangeMarketsAdapter = defineAdapter({
  key: "exchange.markets",
  label: "거래소 상장·유의종목 변동",
  description:
    "업비트·빗썸·코인원·디지털엑스(옛 코빗)·고팍스의 공개 마켓 목록을 비교해 신규 거래지원, 거래지원 종료, 유의(경고) 지정·해제(업비트·빗썸)를 속보 후보로 만듭니다. 첫 실행은 기준선만 저장합니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: { exchange: "upbit", quotes: ["KRW"], cautions: [] },
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const ex = NAMES[c.exchange];
    const rows = await marketList(ctx);
    if (rows === null) return { notModified: true };
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
        url: marketUrl(c.exchange, market),
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
