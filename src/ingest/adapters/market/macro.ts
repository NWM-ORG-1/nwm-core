import { z } from "zod";
import { parseXml } from "../../feed";
import { kstParts, kstYmd } from "../../text";
import { ConfigError, defineAdapter, type MetricIn, type QuoteIn } from "../../types";

/**
 * Daily macro quotes that may be shown publicly: USD/KRW (한국수출입은행
 * 매매기준율, or the ECB reference rate via Frankfurter as a keyless fallback)
 * and the US 10-year Treasury par yield (public domain).
 */

const slot = z.object({
  symbol: z.string().regex(/^[A-Z0-9.-]{2,20}$/).default("USDKRW"),
  name: z.string().min(1).max(30).default("원/달러"),
  sort: z.number().int().min(0).max(999).optional(),
  inTicker: z.boolean().optional(),
});

const pctChange = (now: number, prev: number | undefined) => (prev ? Math.round((now / prev - 1) * 1e6) / 1e4 : 0);

const frankfurterConfig = slot.extend({ base: z.string().length(3).default("USD"), quote: z.string().length(3).default("KRW"), days: z.number().int().min(7).max(120).default(45) });

export const frankfurterAdapter = defineAdapter({
  key: "fx.frankfurter",
  label: "환율 (ECB 기준, Frankfurter)",
  description: "키 없이 쓰는 ECB 기준환율(영업일 1회). 수출입은행 키를 받기 전까지의 예비 소스입니다.",
  kind: "api",
  group: "market",
  configSchema: frankfurterConfig,
  configExample: { symbol: "USDKRW", name: "원/달러", base: "USD", quote: "KRW", days: 45, sort: 30, inTicker: true },
  defaultPollSec: 3 * 3600,
  async run(ctx) {
    const c = ctx.config;
    const from = new Date(ctx.now.getTime() - c.days * 86_400_000).toISOString().slice(0, 10);
    const data = await ctx.http.json<{ rates?: Record<string, Record<string, number>> }>(
      `https://api.frankfurter.dev/v1/${from}..?base=${c.base}&symbols=${c.quote}`,
      { timeoutMs: 20_000 },
    );
    const series = Object.entries(data.rates ?? {})
      .map(([d, r]) => [d, r[c.quote]] as const)
      .filter(([, v]) => Number.isFinite(v))
      .sort(([a], [b]) => a.localeCompare(b));
    if (!series.length) throw new Error("no rates");
    const [lastDate, last] = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2][1] : undefined;
    const metrics: MetricIn[] = series.map(([d, v]) => ({ metric: "fx_close", symbol: c.symbol, source: "ecb", at: new Date(`${d}T14:15:00Z`), value: v }));
    const quotes: QuoteIn[] = [
      {
        symbol: c.symbol,
        name: c.name,
        price: last,
        changePct: pctChange(last, prev),
        currency: c.quote,
        spark: series.slice(-30).map(([, v]) => v),
        asOf: new Date(`${lastDate}T14:15:00Z`),
        source: "ecb",
        sort: c.sort,
        inTicker: c.inTicker,
      },
    ];
    return { quotes, metrics, note: `${c.symbol} ${last} (${lastDate})` };
  },
});

const eximConfig = slot.extend({ currency: z.string().regex(/^[A-Z]{3}(\(100\))?$/).default("USD") });

interface EximRow {
  result: number;
  cur_unit: string | null;
  deal_bas_r: string | null;
}

export const koreaeximAdapter = defineAdapter({
  key: "fx.koreaexim",
  label: "환율 (한국수출입은행)",
  description: "한국수출입은행 현재환율 API의 매매기준율(영업일 11시경 갱신, 하루 1,000회). 비영업일·고시 전에는 직전 값을 유지합니다.",
  kind: "api",
  group: "market",
  configSchema: eximConfig,
  configExample: { symbol: "USDKRW", name: "원/달러", currency: "USD", sort: 30, inTicker: true },
  envVars: [{ name: "KOREAEXIM_API_KEY", required: true, help: "koreaexim.go.kr Open API 인증키" }],
  defaultPollSec: 3600,
  async run(ctx) {
    const c = ctx.config;
    const key = ctx.secret("KOREAEXIM_API_KEY")!;
    const history = { ...((ctx.state.history ?? {}) as Record<string, number>) };
    // first run: walk back to collect a short history for the change and the sparkline
    const days = Object.keys(history).length ? [0] : Array.from({ length: 10 }, (_, i) => i);
    for (const back of days) {
      const ymd = kstYmd(new Date(ctx.now.getTime() - back * 86_400_000));
      if (history[ymd]) continue;
      const rows = await ctx.http.json<EximRow[]>(
        `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${encodeURIComponent(key)}&searchdate=${ymd}&data=AP01`,
        { timeoutMs: 20_000 },
      );
      if (rows[0]?.result === 3) throw new ConfigError("수출입은행 인증키 오류");
      if (rows[0]?.result === 4) throw new Error("수출입은행 일일 호출 한도 초과");
      const row = rows.find((r) => r.result === 1 && r.cur_unit === c.currency);
      const v = row?.deal_bas_r ? Number(row.deal_bas_r.replace(/,/g, "")) : NaN;
      if (Number.isFinite(v)) history[ymd] = v;
    }
    const series = Object.entries(history)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-40);
    if (!series.length) return { note: "고시 전 / 비영업일", state: { history } };
    const [lastDay, last] = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2][1] : undefined;
    const at = (d: string) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T11:00:00+09:00`);
    const k = kstParts(ctx.now);
    const businessHours = k.dow >= 1 && k.dow <= 5 && k.h >= 9 && k.h < 18;
    return {
      quotes: [
        {
          symbol: c.symbol,
          name: c.name,
          price: last,
          changePct: pctChange(last, prev),
          currency: "KRW",
          spark: series.slice(-30).map(([, v]) => v),
          asOf: at(lastDay),
          source: "koreaexim",
          sort: c.sort,
          inTicker: c.inTicker,
        },
      ],
      metrics: series.map(([d, v]) => ({ metric: "fx_close", symbol: c.symbol, source: "koreaexim", at: at(d), value: v })),
      state: { history: Object.fromEntries(series) },
      nextRunInSec: businessHours ? ctx.source.pollIntervalSec : 6 * 3600,
      note: `${c.currency} ${last} (${lastDay})`,
    };
  },
});

const treasuryConfig = z.object({
  tenor: z.enum(["BC_3MONTH", "BC_2YEAR", "BC_5YEAR", "BC_10YEAR", "BC_30YEAR"]).default("BC_10YEAR"),
  symbol: z.string().regex(/^[A-Z0-9.-]{2,20}$/).default("US10Y"),
  name: z.string().min(1).max(30).default("美 10년물"),
  sort: z.number().int().min(0).max(999).optional(),
  inTicker: z.boolean().optional(),
});

export const treasuryAdapter = defineAdapter({
  key: "rates.treasury",
  label: "미 국채 금리 (미 재무부)",
  description: "미 재무부 일일 국채 수익률 곡선(XML, 공공 영역). 기본은 10년물이며 변동률은 금리 자체의 등락률입니다.",
  kind: "api",
  group: "market",
  configSchema: treasuryConfig,
  configExample: { tenor: "BC_10YEAR", symbol: "US10Y", name: "美 10년물", sort: 40, inTicker: true },
  defaultPollSec: 3 * 3600,
  timeoutMs: 150_000,
  async run(ctx) {
    const c = ctx.config;
    const months = [0, 1].map((back) => {
      const d = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - back, 1));
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    const points: Array<[string, number]> = [];
    for (const m of months) {
      const xml = await ctx.http.text(
        `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${m}`,
        { timeoutMs: 60_000 },
      );
      const doc = parseXml(xml) as { feed?: { entry?: unknown } };
      const entries = doc.feed?.entry ? (Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry]) : [];
      for (const e of entries as Array<{ content?: { "m:properties"?: Record<string, unknown> } }>) {
        const props = e.content?.["m:properties"] ?? {};
        const date = val(props["d:NEW_DATE"]).slice(0, 10);
        const y = Number(val(props[`d:${c.tenor}`]));
        if (date && Number.isFinite(y) && val(props[`d:${c.tenor}`]) !== "") points.push([date, y]);
      }
    }
    const series = [...new Map(points).entries()].sort(([a], [b]) => a.localeCompare(b));
    if (!series.length) throw new Error("no yields in the last two months");
    const [lastDate, last] = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2][1] : undefined;
    // the curve is published after the US close (~18:00 ET)
    const at = (d: string) => new Date(`${d}T22:00:00Z`);
    return {
      quotes: [
        { symbol: c.symbol, name: c.name, price: last, changePct: pctChange(last, prev), currency: "%", spark: series.slice(-30).map(([, v]) => v), asOf: at(lastDate), source: "treasury", sort: c.sort, inTicker: c.inTicker },
      ],
      metrics: series.map(([d, v]) => ({ metric: `us_yield_${c.tenor.slice(3).toLowerCase()}`, symbol: "US", source: "treasury", at: at(d), value: v })),
      note: `${c.tenor} ${last}% (${lastDate})`,
    };
  },
});

function val(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "object") return String((n as Record<string, unknown>)["#text"] ?? "");
  return String(n);
}

export const fearGreedAdapter = defineAdapter({
  key: "index.feargreed",
  label: "코인 공포·탐욕 지수 (alternative.me)",
  description: "비교 기준용 외부 지수(일 1회). 투자심리지수 그림자 운영 때 우리 지수와 견줘 봅니다. 화면에 쓸 땐 출처 표기.",
  kind: "api",
  group: "market",
  configSchema: z.object({}),
  configExample: {},
  defaultPollSec: 3 * 3600,
  async run(ctx) {
    const data = await ctx.http.json<{ data?: Array<{ value: string; timestamp: string }> }>(`https://api.alternative.me/fng/?limit=${ctx.state.backfilled ? 3 : 365}`);
    const metrics: MetricIn[] = (data.data ?? []).map((d) => ({ metric: "fear_greed", symbol: "CRYPTO", source: "alternative.me", at: new Date(Number(d.timestamp) * 1000), value: Number(d.value) }));
    return { metrics, state: { backfilled: true }, note: `${metrics.length} points, latest ${metrics[0]?.value ?? "?"}` };
  },
});

const datalabConfig = z.object({
  groups: z
    .array(z.object({ name: z.string().min(1).max(20), keywords: z.array(z.string().min(1).max(30)).min(1).max(20), symbol: z.string().max(12) }))
    .min(1)
    .max(5),
  days: z.number().int().min(7).max(90).default(35),
});

export const naverDatalabAdapter = defineAdapter({
  key: "naver.datalab",
  label: "네이버 검색어 트렌드",
  description: "네이버 데이터랩 검색어 트렌드(일별 상대값). 같은 그룹 묶음을 계속 써야 값이 서로 비교됩니다 (최대 5그룹).",
  kind: "api",
  group: "market",
  configSchema: datalabConfig,
  configExample: { groups: [{ name: "비트코인", keywords: ["비트코인", "BTC"], symbol: "BTC" }], days: 35 },
  envVars: [
    { name: "NAVER_CLIENT_ID", required: true, help: "네이버 개발자센터/API HUB 애플리케이션 Client ID" },
    { name: "NAVER_CLIENT_SECRET", required: true, help: "Client Secret" },
  ],
  defaultPollSec: 12 * 3600,
  async run(ctx) {
    const c = ctx.config;
    const end = ctx.now.toISOString().slice(0, 10);
    const start = new Date(ctx.now.getTime() - c.days * 86_400_000).toISOString().slice(0, 10);
    const res = await ctx.http.request("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-naver-client-id": ctx.secret("NAVER_CLIENT_ID")!,
        "x-naver-client-secret": ctx.secret("NAVER_CLIENT_SECRET")!,
      },
      body: JSON.stringify({ startDate: start, endDate: end, timeUnit: "date", keywordGroups: c.groups.map((g) => ({ groupName: g.name, keywords: g.keywords })) }),
      okStatuses: [401],
    });
    if (res.status === 401) throw new ConfigError("네이버 API 인증 실패 (Client ID/Secret 확인)");
    const data = JSON.parse(res.text) as { results?: Array<{ title: string; data: Array<{ period: string; ratio: number }> }> };
    const metrics: MetricIn[] = [];
    for (const r of data.results ?? []) {
      const g = c.groups.find((x) => x.name === r.title);
      if (!g) continue;
      for (const d of r.data) metrics.push({ metric: "search_ratio", symbol: g.symbol, source: "naver", at: new Date(`${d.period}T00:00:00+09:00`), value: d.ratio });
    }
    return { metrics, note: `${metrics.length} points` };
  },
});
