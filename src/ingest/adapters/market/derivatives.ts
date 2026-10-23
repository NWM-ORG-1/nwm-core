import { z } from "zod";
import { defineAdapter, type MetricIn } from "../../types";

/**
 * Futures positioning for the sentiment index: funding rate, open interest and
 * the long/short account ratio, hourly. Bybit and Binance USDⓈ-M are kept as
 * separate series (both block some countries — check from the deploy region).
 */

const pairs = z
  .array(z.object({ pair: z.string().regex(/^[A-Z0-9]{5,20}$/), symbol: z.string().regex(/^[A-Z0-9]{2,10}$/) }))
  .min(1)
  .max(10);

const hour = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

const bybitConfig = z.object({ pairs, base: z.url().default("https://api.bybit.com") });

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result?: { list?: T[] };
}

export const bybitDerivsAdapter = defineAdapter({
  key: "market.bybit",
  label: "바이비트 선물 지표",
  description: "바이비트 USDT 무기한 선물의 펀딩비·미결제약정·롱숏 계정 비율(1시간). 투자심리지수의 시장 입력입니다.",
  kind: "api",
  group: "market",
  configSchema: bybitConfig,
  configExample: { pairs: [{ pair: "BTCUSDT", symbol: "BTC" }, { pair: "ETHUSDT", symbol: "ETH" }], base: "https://api.bybit.com" },
  defaultPollSec: 3600,
  async run(ctx) {
    const c = ctx.config;
    const metrics: MetricIn[] = [];
    for (const p of c.pairs) {
      const t = await ctx.http.json<BybitEnvelope<{ fundingRate: string; openInterestValue: string }>>(`${c.base}/v5/market/tickers?category=linear&symbol=${p.pair}`);
      if (t.retCode !== 0) throw new Error(`bybit ${t.retCode}: ${t.retMsg}`);
      const row = t.result?.list?.[0];
      if (row) {
        metrics.push({ metric: "funding_rate", symbol: p.symbol, source: "bybit", at: hour(ctx.now), value: Number(row.fundingRate) * 100 });
        metrics.push({ metric: "open_interest_usd", symbol: p.symbol, source: "bybit", at: hour(ctx.now), value: Number(row.openInterestValue) });
      }
      const r = await ctx.http.json<BybitEnvelope<{ buyRatio: string; sellRatio: string; timestamp: string }>>(
        `${c.base}/v5/market/account-ratio?category=linear&symbol=${p.pair}&period=1h&limit=${ctx.state.backfilled ? 3 : 200}`,
      );
      if (r.retCode !== 0) throw new Error(`bybit ${r.retCode}: ${r.retMsg}`);
      for (const x of r.result?.list ?? []) {
        const sell = Number(x.sellRatio);
        if (sell > 0) metrics.push({ metric: "long_short_ratio", symbol: p.symbol, source: "bybit", at: new Date(Number(x.timestamp)), value: Number(x.buyRatio) / sell });
      }
    }
    return { metrics, state: { backfilled: true }, note: `${metrics.length} points` };
  },
});

const binanceFuturesConfig = z.object({ pairs, base: z.url().default("https://fapi.binance.com") });

export const binanceDerivsAdapter = defineAdapter({
  key: "market.binance-futures",
  label: "바이낸스 선물 지표",
  description: "바이낸스 USDⓈ-M 선물의 펀딩비·미결제약정·롱숏 비율. 롱숏·미결제약정 이력은 최근 30일만 제공되므로 일찍 쌓아 둡니다.",
  kind: "api",
  group: "market",
  configSchema: binanceFuturesConfig,
  configExample: { pairs: [{ pair: "BTCUSDT", symbol: "BTC" }], base: "https://fapi.binance.com" },
  defaultPollSec: 3600,
  async run(ctx) {
    const c = ctx.config;
    const limit = ctx.state.backfilled ? 3 : 500;
    const metrics: MetricIn[] = [];
    for (const p of c.pairs) {
      const prem = await ctx.http.json<{ lastFundingRate: string; time: number }>(`${c.base}/fapi/v1/premiumIndex?symbol=${p.pair}`);
      metrics.push({ metric: "funding_rate", symbol: p.symbol, source: "binance", at: hour(new Date(prem.time)), value: Number(prem.lastFundingRate) * 100 });
      const ls = await ctx.http.json<Array<{ longShortRatio: string; timestamp: number }>>(
        `${c.base}/futures/data/globalLongShortAccountRatio?symbol=${p.pair}&period=1h&limit=${limit}`,
      );
      for (const x of ls) metrics.push({ metric: "long_short_ratio", symbol: p.symbol, source: "binance", at: new Date(x.timestamp), value: Number(x.longShortRatio) });
      const oi = await ctx.http.json<Array<{ sumOpenInterestValue: string; timestamp: number }>>(
        `${c.base}/futures/data/openInterestHist?symbol=${p.pair}&period=1h&limit=${limit}`,
      );
      for (const x of oi) metrics.push({ metric: "open_interest_usd", symbol: p.symbol, source: "binance", at: new Date(x.timestamp), value: Number(x.sumOpenInterestValue) });
    }
    return { metrics, state: { backfilled: true }, note: `${metrics.length} points` };
  },
});
