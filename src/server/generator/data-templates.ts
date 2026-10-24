import type { Block, Draft, KeyNumber, SourceRef } from "@/lib/content/blocks";
import type { Beat } from "@/db/schema";
import { fmtChange, fmtPrice } from "@/lib/format";
import { josa, named, particle } from "@/lib/josa";

/**
 * Mode (b) — fully automatic articles. Pure code: every number is filled in from
 * structured data and every sentence is fixed text, never written by a model
 * (this stays true in phase 3). The worker runs them on a schedule or on an
 * event; the newsroom can also make the manual ones on demand.
 */

export interface TemplateQuote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
}

export interface TemplateSentiment {
  scopeKey: string;
  label: string;
  score: number;
  change24h: number;
  bullish: number;
  bearish: number;
  volume: number;
  sources: { name: string; score: number; share: number }[];
  keywords: string[];
}

/** Latest reading of a market metric, and the reading about a day earlier when known. */
export interface MetricReading {
  value: number;
  at: Date;
  dayAgo?: number;
  source: string;
}

export interface MarketInputs {
  quotes: TemplateQuote[];
  metrics: Partial<Record<"kimchi" | "funding" | "longShort" | "fearGreed", MetricReading>>;
  /** hourly closes in USD, oldest first */
  hourly: Partial<Record<string, number[]>>;
}

export type DataTemplateId =
  | "crypto_daily"
  | "sentiment_daily"
  | "market_close"
  | "crypto_move"
  | "exchange_listed"
  | "exchange_delisted"
  | "exchange_warning"
  | "exchange_warning_lifted";

export type TemplateTrigger = { kind: "daily"; defaultTime: string } | { kind: "event"; detail: string } | { kind: "manual" };

export interface TemplateMeta {
  label: string;
  beat: Beat;
  description: string;
  trigger: TemplateTrigger;
  /** feed adapters whose data the template uses (experiment attribution, licence warnings) */
  adapters: string[];
  /** every article joins this running story */
  series?: { slug: string; title: string; summary: string };
  /** can be made on demand from the newsroom */
  manual: boolean;
}

const EXCHANGE_SERIES = {
  slug: "auto-exchange-markets",
  title: "거래소 거래지원·유의 종목",
  summary: "업비트·빗썸의 신규 거래지원, 거래지원 종료, 유의 종목 지정과 해제를 거래소 공개 마켓 목록으로 기록합니다.",
};

export const DATA_TEMPLATES: Record<DataTemplateId, TemplateMeta> = {
  crypto_daily: {
    label: "크립토 데일리",
    beat: "crypto",
    description: "BTC·ETH·SOL·XRP 시세, 김치 프리미엄, 펀딩비, 공포·탐욕 지수",
    trigger: { kind: "daily", defaultTime: "08:30" },
    adapters: ["market.binance", "market.krw", "market.bybit", "market.binance-futures", "index.feargreed"],
    series: { slug: "auto-crypto-daily", title: "크립토 데일리", summary: "매일 아침 주요 디지털자산 시세와 시장 지표를 데이터로 정리합니다." },
    manual: true,
  },
  sentiment_daily: {
    label: "투자심리 데일리",
    beat: "sentiment",
    description: "NWM 투자심리지수와 종목별 심리 (지수를 공개한 뒤부터)",
    trigger: { kind: "daily", defaultTime: "21:00" },
    adapters: ["html.list", "telegram.channel", "telegram.bot", "x.accounts"],
    series: { slug: "auto-sentiment-daily", title: "투자심리 데일리", summary: "NWM 투자심리지수의 하루 변화를 데이터로 정리합니다." },
    manual: true,
  },
  market_close: {
    label: "장 마감 시황",
    beat: "economy",
    description: "코스피·코스닥·원/달러·美 10년물 (지수 시세 라이선스가 있어야 합니다)",
    trigger: { kind: "manual" },
    adapters: [],
    manual: true,
  },
  crypto_move: {
    label: "급변동 속보",
    beat: "crypto",
    description: "비트코인·이더리움이 1시간 새 기준 이상 움직이면",
    trigger: { kind: "event", detail: "1시간 변동률이 기준 이상" },
    adapters: ["market.binance"],
    series: { slug: "auto-crypto-moves", title: "비트코인·이더리움 급변동", summary: "1시간 새 크게 움직인 순간을 시세 데이터로 기록합니다." },
    manual: false,
  },
  exchange_listed: {
    label: "신규 거래지원",
    beat: "crypto",
    description: "업비트·빗썸 마켓 목록에 새 마켓이 나타나면",
    trigger: { kind: "event", detail: "거래소 마켓 목록 변화" },
    adapters: ["exchange.markets"],
    series: EXCHANGE_SERIES,
    manual: false,
  },
  exchange_delisted: {
    label: "거래지원 종료",
    beat: "crypto",
    description: "업비트·빗썸 마켓 목록에서 마켓이 빠지면",
    trigger: { kind: "event", detail: "거래소 마켓 목록 변화" },
    adapters: ["exchange.markets"],
    series: EXCHANGE_SERIES,
    manual: false,
  },
  exchange_warning: {
    label: "유의 종목 지정",
    beat: "crypto",
    description: "업비트·빗썸이 유의(경고) 종목으로 지정하면",
    trigger: { kind: "event", detail: "거래소 마켓 상태 변화" },
    adapters: ["exchange.markets"],
    series: EXCHANGE_SERIES,
    manual: false,
  },
  exchange_warning_lifted: {
    label: "유의 종목 해제",
    beat: "crypto",
    description: "업비트·빗썸이 유의 종목 지정을 풀면",
    trigger: { kind: "event", detail: "거래소 마켓 상태 변화" },
    adapters: ["exchange.markets"],
    series: EXCHANGE_SERIES,
    manual: false,
  },
};

/* ───────────────────────── shared text ───────────────────────── */

function row(q: TemplateQuote): string[] {
  return [q.name, fmtPrice(q.price, q.currency, q.symbol), fmtChange(q.changePct)];
}

function leader(qs: TemplateQuote[]) {
  return [...qs].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
}

function dir(v: number) {
  return v > 0 ? "올랐다" : v < 0 ? "내렸다" : "보합이었다";
}

function trend(v: number): "up" | "down" | "flat" {
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}

function signed(v: number, digits = 2) {
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;
}

/** alternative.me bands */
export function fearGreedBand(v: number): string {
  if (v <= 24) return "극단적 공포";
  if (v <= 46) return "공포";
  if (v <= 54) return "중립";
  if (v <= 75) return "탐욕";
  return "극단적 탐욕";
}

/** "14:05" in KST */
export function hhmmKST(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

const METRIC_SOURCE: Record<string, string> = { bybit: "바이비트", binance: "바이낸스", "alternative.me": "Alternative.me", derived: "NWM 계산" };

/* ───────────────────────── scheduled & manual ───────────────────────── */

export function buildDataDraft(
  id: DataTemplateId,
  data: { quotes: TemplateQuote[]; sentiment: TemplateSentiment[]; dateLabel: string; market?: MarketInputs },
): Draft | null {
  const by = (s: string) => data.quotes.find((q) => q.symbol === s);

  if (id === "crypto_daily") return cryptoDaily(data.market ?? { quotes: data.quotes, metrics: {}, hourly: {} }, data.dateLabel);

  if (id === "market_close") {
    const qs = ["KOSPI", "KOSDAQ", "USDKRW", "US10Y"].map(by).filter(Boolean) as TemplateQuote[];
    const kospi = by("KOSPI");
    if (!kospi) return null;
    return {
      title: `코스피 ${fmtPrice(kospi.price, kospi.currency)} 마감, ${fmtChange(kospi.changePct)}`,
      dek: `코스피는 전 거래일보다 ${Math.abs(kospi.changePct).toFixed(2)}% ${dir(kospi.changePct)}. 주요 지표를 한눈에 정리했다.`,
      blocks: [
        {
          type: "numbers",
          items: qs.slice(0, 3).map((q) => ({
            value: fmtPrice(q.price, q.currency, q.symbol),
            label: q.name,
            delta: fmtChange(q.changePct),
            trend: trend(q.changePct),
          })),
        },
        { type: "table", caption: `${data.dateLabel} 장 마감`, columns: ["지표", "종가", "등락"], rows: qs.map(row) },
      ],
      tags: ["시황", "장 마감"],
      tickers: ["KOSPI", "KOSDAQ", "USDKRW"].filter((s) => by(s)),
      sources: [{ name: "거래소 시세 집계", kind: "data" }],
      sentiment: null,
    };
  }

  if (id !== "sentiment_daily") return null;
  const index = data.sentiment.find((s) => s.scopeKey === "index");
  if (!index) return null;
  const assets = data.sentiment.filter((s) => s.scopeKey.startsWith("asset:")).sort((a, b) => b.volume - a.volume);
  const mover = [...assets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];
  return {
    title: `투자심리지수 ${Math.round(index.score)}, 하루 새 ${index.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(index.change24h))}`,
    dek: mover
      ? `커뮤니티 심리가 가장 크게 움직인 곳은 ${mover.label}(${mover.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(mover.change24h))})이다.`
      : "NWM 투자심리지수의 하루 변화를 정리했다.",
    blocks: [
      { type: "sentiment" },
      ...(assets.length
        ? [
            {
              type: "table" as const,
              caption: `${data.dateLabel} 종목별 심리 점수 (−100~100)`,
              columns: ["대상", "점수", "24h"],
              rows: assets.slice(0, 8).map((a) => [a.label, String(Math.round(a.score)), `${a.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(a.change24h))}`]),
            },
          ]
        : []),
      { type: "section", label: "context", text: "점수는 커뮤니티·소셜 언급의 긍정·부정 비율과 시장 지표를 함께 집계한 지표다. 개별 게시물은 인용하지 않는다." },
    ],
    tags: ["투자심리 데일리", ...index.keywords.slice(0, 2)],
    tickers: [],
    sources: [
      { name: "커뮤니티·소셜 집계", kind: "data" },
      { name: "투자심리지수 산출 방법", kind: "data", url: "/sentiment/method" },
    ],
    sentiment: {
      score: index.score,
      change24h: index.change24h,
      bullish: index.bullish,
      bearish: index.bearish,
      volume: index.volume,
      sources: index.sources,
      keywords: index.keywords,
    },
  };
}

function cryptoDaily(m: MarketInputs, dateLabel: string): Draft | null {
  const by = (s: string) => m.quotes.find((q) => q.symbol === s);
  const coins = ["BTC", "ETH", "SOL", "XRP"].map(by).filter(Boolean) as TemplateQuote[];
  if (coins.length < 2) return null;
  const btc = by("BTC");
  const krw = by("KRW-BTC");
  const lead = leader(coins);
  const { kimchi, funding, longShort, fearGreed } = m.metrics;
  const sources: SourceRef[] = [{ name: "바이낸스 현물 시세", kind: "data", url: "https://www.binance.com/" }];
  if (krw || kimchi) sources.push({ name: "업비트 원화 시세", kind: "data", url: "https://upbit.com/" });

  const why = [`24시간 기준 변동폭이 가장 큰 자산은 ${lead.name}(${fmtChange(lead.changePct)})이다.`];
  if (kimchi) {
    why.push(
      `업비트 비트코인 가격은 해외 시세를 원/달러 환율로 환산한 값보다 ${Math.abs(kimchi.value).toFixed(2)}% ${kimchi.value >= 0 ? "높다" : "낮다"}(김치 프리미엄).`,
    );
  }
  if (fearGreed) {
    const v = Math.round(fearGreed.value);
    const before = fearGreed.dayAgo != null ? Math.round(fearGreed.dayAgo) : null;
    const change = before == null || before === v ? "" : `, 하루 전 ${before}보다 ${Math.abs(v - before)} ${v > before ? "올랐다" : "내렸다"}`;
    why.push(`코인 공포·탐욕 지수는 ${v}(${fearGreedBand(v)})${change ? `${particle(String(v), "으로/로")}${change}` : "이다"}.`);
    sources.push({ name: "Alternative.me 공포·탐욕 지수", kind: "data", url: "https://alternative.me/crypto/fear-and-greed-index/" });
  }

  const numbers: KeyNumber[] = coins.slice(0, fearGreed ? 3 : 4).map((q) => ({
    value: fmtPrice(q.price, q.currency, q.symbol),
    label: q.name,
    delta: fmtChange(q.changePct),
    trend: trend(q.changePct),
  }));
  if (fearGreed) {
    const v = Math.round(fearGreed.value);
    const d = fearGreed.dayAgo != null ? v - Math.round(fearGreed.dayAgo) : null;
    numbers.push({ value: String(v), label: `공포·탐욕 (${fearGreedBand(v)})`, ...(d == null ? {} : { delta: signed(d, 0), trend: trend(d) }) });
  }

  const blocks: Block[] = [{ type: "why", items: why.slice(0, 3) }, { type: "numbers", items: numbers }];
  const btcHourly = m.hourly.BTC ?? [];
  if (btcHourly.length >= 6) {
    blocks.push({ type: "chart", title: "비트코인 24시간 (USD)", unit: "USD", points: btcHourly.slice(-25), source: "바이낸스 1시간 종가" });
  }
  const rows = coins.map((q) => [q.name, `${fmtPrice(q.price, q.currency, q.symbol)}달러`, fmtChange(q.changePct)]);
  if (krw) rows.push(["비트코인 (업비트)", `${fmtPrice(krw.price, "KRW")}원`, fmtChange(krw.changePct)]);
  blocks.push({ type: "table", caption: `${dateLabel} 주요 디지털자산`, columns: ["자산", "가격", "24h"], rows });

  const derivatives: string[] = [];
  if (funding) derivatives.push(`${METRIC_SOURCE[funding.source] ?? funding.source} BTC 무기한 선물 펀딩비 ${funding.value.toFixed(4)}%`);
  if (longShort) derivatives.push(`${METRIC_SOURCE[longShort.source] ?? longShort.source} BTC 롱·숏 계정 비율 ${longShort.value.toFixed(2)} (1보다 크면 롱 우세)`);
  if (derivatives.length) {
    blocks.push({ type: "section", label: "context", bullets: derivatives });
    const names = [...new Set([funding?.source, longShort?.source].filter(Boolean) as string[])].map((s) => METRIC_SOURCE[s] ?? s);
    sources.push({ name: `${names.join("·")} 파생상품 지표`, kind: "data" });
  }

  const title = btc
    ? lead.symbol === "BTC"
      ? `비트코인 ${fmtChange(btc.changePct)}, 주요 코인 중 변동 최대`
      : `비트코인 ${fmtChange(btc.changePct)}, ${lead.name} ${fmtChange(lead.changePct)}`
    : `${lead.name} ${fmtChange(lead.changePct)}, 주요 코인 중 변동 최대`;
  const dek = btc
    ? `비트코인은 ${fmtPrice(btc.price, btc.currency, btc.symbol)}달러로 24시간 전보다 ${Math.abs(btc.changePct).toFixed(2)}% ${dir(btc.changePct)}.${
        krw ? ` 업비트 원화 가격은 ${fmtPrice(krw.price, "KRW")}원이다.` : ""
      }`
    : `${josa(lead.name, "이/가")} 24시간 동안 가장 크게 움직였다.`;

  return {
    title,
    dek,
    blocks,
    tags: ["시황", "크립토 데일리"],
    tickers: coins.slice(0, 3).map((q) => q.symbol),
    sources,
    sentiment: null,
  };
}

/* ───────────────────────── events: sharp moves ───────────────────────── */

export interface MoveInput {
  symbol: string;
  name: string;
  /** USD, now */
  price: number;
  asOf: Date;
  /** an hourly close 45–90 minutes earlier, and when that hour ended */
  refPrice: number;
  refAt: Date;
  change24h: number;
  /** hourly closes in USD, oldest first */
  hourly: number[];
  krwPrice?: number;
  kimchi?: number;
  fearGreed?: number;
}

export function moveChangePct(i: Pick<MoveInput, "price" | "refPrice">): number {
  return (i.price / i.refPrice - 1) * 100;
}

export function buildCryptoMove(i: MoveInput): Draft {
  const c = moveChangePct(i);
  const up = c > 0;
  const usd = (v: number) => fmtPrice(v, "USD", i.symbol);
  const blocks: Block[] = [
    {
      type: "numbers",
      items: [
        { value: usd(i.price), label: `${i.name} (USD)` },
        { value: fmtChange(c), label: `${hhmmKST(i.refAt)} 종가 대비`, trend: trend(c) },
        { value: fmtChange(i.change24h), label: "24시간", trend: trend(i.change24h) },
        ...(i.krwPrice ? [{ value: fmtPrice(i.krwPrice, "KRW"), label: "업비트 원화 가격 (원)" }] : []),
      ],
    },
  ];
  if (i.hourly.length >= 6) {
    blocks.push({ type: "chart", title: `${i.name} 24시간 (USD)`, unit: "USD", points: [...i.hourly.slice(-24), i.price], source: "바이낸스 1시간 종가·현재가" });
  }
  const context: string[] = [];
  if (i.kimchi != null) context.push(`김치 프리미엄 ${signed(i.kimchi)}% (업비트 가격과 환율 환산 해외 가격의 차이)`);
  if (i.fearGreed != null) context.push(`코인 공포·탐욕 지수 ${Math.round(i.fearGreed)} (${fearGreedBand(i.fearGreed)})`);
  if (context.length) blocks.push({ type: "section", label: "context", bullets: context });
  blocks.push({ type: "section", label: "yes_but", text: "가격은 바이낸스 현물(USD) 기준이며 거래소마다 차이가 있을 수 있다." });

  const sources: SourceRef[] = [{ name: "바이낸스 현물 시세", kind: "data", url: "https://www.binance.com/" }];
  if (i.krwPrice || i.kimchi != null) sources.push({ name: "업비트 원화 시세", kind: "data", url: "https://upbit.com/" });
  if (i.fearGreed != null) sources.push({ name: "Alternative.me 공포·탐욕 지수", kind: "data", url: "https://alternative.me/crypto/fear-and-greed-index/" });

  return {
    title: `${i.name} 1시간 새 ${Math.abs(c).toFixed(2)}% ${up ? "상승" : "하락"}, ${usd(i.price)}달러`,
    dek: `${josa(i.name, "은/는")} ${hhmmKST(i.asOf)} 기준 ${usd(i.price)}달러로 ${hhmmKST(i.refAt)} 종가(${usd(i.refPrice)}달러)보다 ${Math.abs(c).toFixed(2)}% ${
      up ? "올랐다" : "내렸다"
    }. 24시간 기준으로는 ${fmtChange(i.change24h)}.`,
    blocks,
    tags: ["시황", "급변동"],
    tickers: [i.symbol],
    sources,
    sentiment: null,
    isBreaking: true,
  };
}

/* ───────────────────────── events: exchange markets ───────────────────────── */

export type ExchangeChange = "listed" | "delisted" | "warning" | "warning_lifted";
export type Exchange = "upbit" | "bithumb";

export interface ExchangeMarket {
  market: string;
  coin: string;
  quote: string;
  name: string | null;
}

export interface ExchangeEventInput {
  exchange: Exchange;
  change: ExchangeChange;
  markets: ExchangeMarket[];
  at: Date;
  /** KRW markets currently listed on each exchange, for "also traded on" lines */
  listedOn?: Partial<Record<Exchange, Set<string>>>;
}

export const EXCHANGE_TEMPLATE: Record<ExchangeChange, DataTemplateId> = {
  listed: "exchange_listed",
  delisted: "exchange_delisted",
  warning: "exchange_warning",
  warning_lifted: "exchange_warning_lifted",
};

const EXCHANGE_NAME: Record<Exchange, string> = { upbit: "업비트", bithumb: "빗썸" };
const EXCHANGE_NOTICE: Record<Exchange, string> = { upbit: "https://upbit.com/service_center/notice", bithumb: "https://www.bithumb.com/" };
const QUOTE_NAME: Record<string, string> = { KRW: "원화", BTC: "BTC", USDT: "USDT" };

export function buildExchangeEvent(e: ExchangeEventInput): Draft | null {
  if (!e.markets.length) return null;
  const ex = EXCHANGE_NAME[e.exchange];
  const coins = [...new Map(e.markets.map((m) => [m.coin, { coin: m.coin, name: m.name || m.coin, quotes: [] as string[] }])).values()];
  for (const m of e.markets) coins.find((c) => c.coin === m.coin)!.quotes.push(m.quote);
  const marketsOf = (quotes: string[]) => `${[...new Set(quotes)].map((q) => QUOTE_NAME[q] ?? q).join("·")} 마켓`;
  const first = coins[0];
  const single = coins.length === 1;
  const shortList = coins
    .slice(0, 3)
    .map((c) => c.name)
    .join("·");
  // "A(AAA), B(BBB) 2개" / "A(AAA), B(BBB), C(CCC) 등 5개"
  const longList = `${coins
    .slice(0, 3)
    .map((c) => named(c.name, c.coin))
    .join(", ")} ${coins.length > 3 ? "등 " : ""}${coins.length}개`;
  // no clock time in the copy: the article carries its own, and "11:41 확인" only reads as late next to the exchange's notice
  let title: string;
  let dek: string;
  let why: string;
  switch (e.change) {
    case "listed":
      title = single ? `${ex}, ${named(first.name, first.coin)} ${marketsOf(first.quotes)} 거래지원` : `${ex}, ${coins.length}종 거래지원… ${shortList}${coins.length > 3 ? " 등" : ""}`;
      dek = single
        ? `${josa(ex, "이/가")} ${marketsOf(first.quotes)}에 ${named(first.name, first.coin, "을/를")} 추가했다.`
        : `${josa(ex, "이/가")} ${longList} 자산을 마켓에 추가했다.`;
      why = `해당 자산을 ${ex}에서 거래할 수 있게 됐다는 뜻이다.`;
      break;
    case "delisted":
      title = single ? `${ex}, ${named(first.name, first.coin)} ${marketsOf(first.quotes)} 거래지원 종료` : `${ex}, ${coins.length}종 거래지원 종료… ${shortList}${coins.length > 3 ? " 등" : ""}`;
      dek = single
        ? `${ex} ${marketsOf(first.quotes)}에서 ${named(first.name, first.coin)}의 거래지원이 종료됐다.`
        : `${ex} 마켓에서 ${longList} 자산의 거래지원이 종료됐다.`;
      why = "해당 마켓에서는 더 이상 거래할 수 없다. 남은 자산의 출금 가능 기간은 거래소 공지를 따른다.";
      break;
    case "warning":
      title = single ? `${ex}, ${named(first.name, first.coin)} 유의 종목 지정` : `${ex}, ${coins.length}종 유의 종목 지정… ${shortList}${coins.length > 3 ? " 등" : ""}`;
      dek = single ? `${josa(ex, "이/가")} ${named(first.name, first.coin, "을/를")} 유의 종목으로 지정했다.` : `${josa(ex, "이/가")} ${longList} 종목을 유의 종목으로 지정했다.`;
      why = "유의 종목은 거래소가 투자자 보호를 위해 지정하며, 지정 사유가 해소되지 않으면 거래지원이 종료될 수 있다.";
      break;
    case "warning_lifted":
      title = single ? `${ex}, ${named(first.name, first.coin)} 유의 종목 지정 해제` : `${ex}, ${coins.length}종 유의 종목 지정 해제… ${shortList}${coins.length > 3 ? " 등" : ""}`;
      dek = single ? `${josa(ex, "이/가")} ${named(first.name, first.coin)}의 유의 종목 지정을 해제했다.` : `${josa(ex, "이/가")} ${longList} 종목의 유의 종목 지정을 해제했다.`;
      why = "거래소가 유의 종목 지정 사유가 해소됐다고 판단했다는 뜻이다.";
      break;
  }

  const blocks: Block[] = [
    { type: "why", items: [why] },
    {
      type: "table",
      caption: `${ex} ${DATA_TEMPLATES[EXCHANGE_TEMPLATE[e.change]].label}`,
      columns: ["자산", "티커", "마켓"],
      rows: coins.slice(0, 20).map((c) => [c.name, c.coin, marketsOf(c.quotes)]),
    },
  ];
  const other: Exchange = e.exchange === "upbit" ? "bithumb" : "upbit";
  const otherList = e.listedOn?.[other];
  if (otherList && e.change !== "warning_lifted") {
    const lines = coins.slice(0, 3).map((c) =>
      otherList.has(`KRW-${c.coin}`)
        ? `${EXCHANGE_NAME[other]}에서는 ${named(c.name, c.coin)} 원화 마켓이 거래 중이다.`
        : `${EXCHANGE_NAME[other]} 원화 마켓에는 ${named(c.name, c.coin, "이/가")} 없다.`,
    );
    blocks.push({ type: "section", label: "context", bullets: lines });
  }
  blocks.push({
    type: "next",
    items: [
      e.change === "warning_lifted"
        ? `해제 사유는 ${ex} 공지사항에서 확인할 수 있다.`
        : e.change === "listed"
          ? `거래 개시 시각과 입출금 일정은 ${ex} 공지사항에서 확인할 수 있다.`
          : `거래·입출금 일정과 사유는 ${ex} 공지사항에서 확인할 수 있다.`,
    ],
  });

  return {
    title,
    dek,
    blocks,
    tags: ["거래소", DATA_TEMPLATES[EXCHANGE_TEMPLATE[e.change]].label],
    tickers: coins.slice(0, 6).map((c) => c.coin),
    sources: [{ name: `${ex} 마켓 목록 (공개 API)`, kind: "data", url: EXCHANGE_NOTICE[e.exchange] }],
    sentiment: null,
    isBreaking: e.change !== "warning_lifted",
  };
}
