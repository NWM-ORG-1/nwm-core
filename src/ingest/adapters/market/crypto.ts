import { z } from "zod";
import { defineAdapter, type MetricIn, type QuoteIn } from "../../types";

/**
 * Crypto prices for the ticker. Binance spot via its public market-data mirror
 * (data-api.binance.vision, not geo-blocked); Upbit/Bithumb for KRW prices.
 * Every source refreshes its own quotes; the sparkline (24 hourly closes) is
 * refreshed less often than the price.
 */

const quoteSlot = {
  symbol: z.string().regex(/^[A-Z0-9.-]{2,20}$/),
  name: z.string().min(1).max(30),
  sort: z.number().int().min(0).max(999).optional(),
  inTicker: z.boolean().optional(),
};

const binanceConfig = z.object({
  base: z.url().default("https://data-api.binance.vision"),
  pairs: z
    .array(z.object({ pair: z.string().regex(/^[A-Z0-9]{5,20}$/), ...quoteSlot }))
    .min(1)
    .max(30),
  sparkEverySec: z.number().int().min(60).max(86_400).default(900),
});

interface Binance24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  closeTime: number;
}
type Kline = [number, string, string, string, string, string, number, ...unknown[]];

export const binanceSpotAdapter = defineAdapter({
  key: "market.binance",
  label: "바이낸스 현물 시세",
  description: "바이낸스 현물 24시간 시세(USDT 마켓)를 USD 시세로 티커에 반영하고, 1시간 봉 종가를 지표로 저장합니다.",
  kind: "api",
  group: "market",
  configSchema: binanceConfig,
  configExample: {
    base: "https://data-api.binance.vision",
    pairs: [
      { pair: "BTCUSDT", symbol: "BTC", name: "비트코인", sort: 10, inTicker: true },
      { pair: "ETHUSDT", symbol: "ETH", name: "이더리움", sort: 11, inTicker: true },
    ],
    sparkEverySec: 900,
  },
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const list = await ctx.http.json<Binance24h[]>(`${c.base}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(c.pairs.map((p) => p.pair)))}`);
    const byPair = new Map(list.map((t) => [t.symbol, t]));
    const sparkDue = !ctx.state.sparkAt || ctx.now.getTime() - Date.parse(String(ctx.state.sparkAt)) >= c.sparkEverySec * 1000;
    const quotes: QuoteIn[] = [];
    const metrics: MetricIn[] = [];
    for (const p of c.pairs) {
      const t = byPair.get(p.pair);
      if (!t) continue;
      let spark: number[] | undefined;
      if (sparkDue) {
        const kl = await ctx.http.json<Kline[]>(`${c.base}/api/v3/klines?symbol=${p.pair}&interval=1h&limit=25`);
        spark = kl.map((k) => Number(k[4])).slice(-24);
        for (const k of kl) {
          // closed candles only
          if (k[6] < ctx.now.getTime()) metrics.push({ metric: "close_1h", symbol: p.symbol, source: "binance", at: new Date(k[0]), value: Number(k[4]) });
        }
      }
      quotes.push({
        symbol: p.symbol,
        name: p.name,
        price: Number(t.lastPrice),
        changePct: Number(t.priceChangePercent),
        currency: "USD",
        spark,
        asOf: new Date(t.closeTime),
        source: "binance",
        sort: p.sort,
        inTicker: p.inTicker,
      });
    }
    return { quotes, metrics, state: sparkDue ? { sparkAt: ctx.now.toISOString() } : ctx.state, note: `${quotes.length} quotes${sparkDue ? " + spark" : ""}` };
  },
});

const krwConfig = z.object({
  exchange: z.enum(["upbit", "bithumb"]).default("upbit"),
  markets: z
    .array(z.object({ market: z.string().regex(/^KRW-[A-Z0-9]{2,15}$/), ...quoteSlot }))
    .min(1)
    .max(30),
  sparkEverySec: z.number().int().min(60).max(86_400).default(900),
});

interface KrwTicker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  timestamp: number;
}
interface Candle {
  candle_date_time_utc: string;
  trade_price: number;
  timestamp: number;
}

const KRW_BASE = { upbit: "https://api.upbit.com", bithumb: "https://api.bithumb.com" } as const;

export const krwSpotAdapter = defineAdapter({
  key: "market.krw",
  label: "원화 코인 시세 (업비트·빗썸)",
  description: "업비트·빗썸 원화 마켓 시세. 변동률은 거래소 기준(전일 종가 대비)이며, 김치 프리미엄 계산에도 쓰입니다.",
  kind: "api",
  group: "market",
  configSchema: krwConfig,
  configExample: { exchange: "upbit", markets: [{ market: "KRW-BTC", symbol: "KRW-BTC", name: "비트코인(원화)", sort: 20, inTicker: true }], sparkEverySec: 900 },
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const base = KRW_BASE[c.exchange];
    const list = await ctx.http.json<KrwTicker[]>(`${base}/v1/ticker?markets=${c.markets.map((m) => m.market).join(",")}`);
    const byMarket = new Map(list.map((t) => [t.market, t]));
    const sparkDue = !ctx.state.sparkAt || ctx.now.getTime() - Date.parse(String(ctx.state.sparkAt)) >= c.sparkEverySec * 1000;
    const quotes: QuoteIn[] = [];
    const metrics: MetricIn[] = [];
    for (const m of c.markets) {
      const t = byMarket.get(m.market);
      if (!t) continue;
      let spark: number[] | undefined;
      if (sparkDue) {
        const candles = await ctx.http.json<Candle[]>(`${base}/v1/candles/minutes/60?market=${m.market}&count=24`);
        const asc = [...candles].sort((a, b) => a.timestamp - b.timestamp);
        spark = asc.map((x) => x.trade_price);
        for (const x of asc.slice(0, -1)) metrics.push({ metric: "close_1h", symbol: m.symbol, source: c.exchange, at: new Date(`${x.candle_date_time_utc}Z`), value: x.trade_price });
      }
      quotes.push({
        symbol: m.symbol,
        name: m.name,
        price: t.trade_price,
        changePct: Math.round(t.signed_change_rate * 1e6) / 1e4,
        currency: "KRW",
        spark,
        asOf: new Date(t.timestamp),
        source: c.exchange,
        sort: m.sort,
        inTicker: m.inTicker,
      });
    }
    return { quotes, metrics, state: sparkDue ? { sparkAt: ctx.now.toISOString() } : ctx.state, note: `${quotes.length} quotes` };
  },
});
