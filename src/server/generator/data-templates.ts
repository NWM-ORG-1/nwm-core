import type { Block, Draft } from "@/lib/content/blocks";
import type { Beat } from "@/db/schema";
import { fmtChange, fmtPrice } from "@/lib/format";

/**
 * Mode (b) — fully automatic articles. Pure code: every number is filled in from
 * structured data, never written by a model (this stays true in phase 3).
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

export type DataTemplateId = "crypto_daily" | "market_close" | "sentiment_daily";

export const DATA_TEMPLATES: Record<DataTemplateId, { label: string; beat: Beat; description: string }> = {
  crypto_daily: { label: "크립토 데일리", beat: "crypto", description: "BTC·ETH·SOL·XRP 시세와 24시간 변동" },
  market_close: { label: "장 마감 시황", beat: "economy", description: "코스피·코스닥·원/달러·美 10년물" },
  sentiment_daily: { label: "센티먼트 데일리", beat: "sentiment", description: "NWM 센티먼트 인덱스와 종목별 심리" },
};

function row(q: TemplateQuote): string[] {
  return [q.name, fmtPrice(q.price, q.currency, q.symbol), fmtChange(q.changePct)];
}

function leader(qs: TemplateQuote[]) {
  return [...qs].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
}

function dir(v: number) {
  return v > 0 ? "올랐다" : v < 0 ? "내렸다" : "보합이었다";
}

export function buildDataDraft(
  id: DataTemplateId,
  data: { quotes: TemplateQuote[]; sentiment: TemplateSentiment[]; dateLabel: string },
): Draft | null {
  const by = (s: string) => data.quotes.find((q) => q.symbol === s);

  if (id === "crypto_daily") {
    const qs = ["BTC", "ETH", "SOL", "XRP"].map(by).filter(Boolean) as TemplateQuote[];
    if (qs.length < 2) return null;
    const btc = by("BTC");
    const lead = leader(qs);
    const blocks: Block[] = [
      { type: "why", items: [`24시간 기준 변동폭이 가장 큰 자산은 ${lead.name}(${fmtChange(lead.changePct)})이다.`] },
      {
        type: "numbers",
        items: qs.slice(0, 3).map((q) => ({
          value: fmtPrice(q.price, q.currency, q.symbol),
          label: q.name,
          delta: fmtChange(q.changePct),
          trend: q.changePct > 0 ? "up" : q.changePct < 0 ? "down" : "flat",
        })),
      },
      { type: "table", caption: `${data.dateLabel} 주요 디지털자산 (USD)`, columns: ["자산", "가격", "24h"], rows: qs.map(row) },
    ];
    return {
      title: btc ? `비트코인 ${fmtChange(btc.changePct)}, ${lead.name} 변동 최대` : `${lead.name} 변동 최대`,
      dek: btc
        ? `비트코인은 ${fmtPrice(btc.price, btc.currency, btc.symbol)}달러로 24시간 전보다 ${Math.abs(btc.changePct).toFixed(2)}% ${dir(btc.changePct)}.`
        : `${lead.name}이 24시간 동안 가장 크게 움직였다.`,
      blocks,
      tags: ["시황", "크립토 데일리"],
      tickers: qs.slice(0, 3).map((q) => q.symbol),
      sources: [{ name: "거래소 시세 집계", kind: "data" }],
      sentiment: null,
    };
  }

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
            trend: q.changePct > 0 ? "up" : q.changePct < 0 ? "down" : "flat",
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

  // sentiment_daily
  const index = data.sentiment.find((s) => s.scopeKey === "index");
  if (!index) return null;
  const assets = data.sentiment.filter((s) => s.scopeKey.startsWith("asset:")).sort((a, b) => b.volume - a.volume);
  const mover = [...assets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];
  return {
    title: `센티먼트 인덱스 ${Math.round(index.score)}, 하루 새 ${index.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(index.change24h))}`,
    dek: mover
      ? `커뮤니티 심리가 가장 크게 움직인 곳은 ${mover.label}(${mover.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(mover.change24h))})이다.`
      : "NWM 센티먼트 인덱스의 하루 변화를 정리했다.",
    blocks: [
      { type: "sentiment" },
      {
        type: "table",
        caption: `${data.dateLabel} 종목별 심리 점수 (−100~100)`,
        columns: ["대상", "점수", "24h"],
        rows: assets.slice(0, 8).map((a) => [a.label, String(Math.round(a.score)), `${a.change24h >= 0 ? "+" : "−"}${Math.abs(Math.round(a.change24h))}`]),
      },
      { type: "section", label: "context", text: "점수는 커뮤니티·소셜 언급의 긍정·부정 비율을 집계한 지표다. 개별 게시물은 인용하지 않는다." },
    ],
    tags: ["센티먼트 데일리", ...index.keywords.slice(0, 2)],
    tickers: [],
    sources: [{ name: "커뮤니티·소셜 집계", kind: "data" }],
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
