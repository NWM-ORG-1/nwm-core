/**
 * Mock market data (sample). Phase 2 replaces this with market-data feeds that
 * write the same tables (`market_quotes`, `sentiment_snapshots`).
 */

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Random walk of n points ending at `last`, net move = changePct. */
export function walk(key: string, last: number, changePct: number, n = 32): number[] {
  const rnd = mulberry32(hash32(key));
  const first = last / (1 + changePct / 100);
  const amp = Math.abs(last - first) || Math.abs(last) * 0.004;
  const pts: number[] = [];
  let noise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    noise = noise * 0.7 + (rnd() - 0.5) * 0.9;
    pts.push(first + (last - first) * t + noise * amp * 0.6);
  }
  pts[n - 1] = last;
  return pts.map((p) => Math.round(p * 1000) / 1000);
}

export interface SeedQuote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: "USD" | "KRW" | "PT" | "%" | "";
  inTicker: boolean;
}

export const QUOTES: SeedQuote[] = [
  { symbol: "KOSPI", name: "코스피", price: 3218.42, changePct: 0.84, currency: "PT", inTicker: true },
  { symbol: "KOSDAQ", name: "코스닥", price: 912.37, changePct: -0.42, currency: "PT", inTicker: true },
  { symbol: "NASDAQ", name: "나스닥", price: 21894.1, changePct: 1.12, currency: "PT", inTicker: true },
  { symbol: "SPX", name: "S&P 500", price: 6788.55, changePct: 0.61, currency: "PT", inTicker: false },
  { symbol: "USDKRW", name: "원/달러", price: 1386.2, changePct: -0.31, currency: "KRW", inTicker: true },
  { symbol: "US10Y", name: "美 10년물", price: 4.12, changePct: -1.2, currency: "%", inTicker: true },
  { symbol: "BTC", name: "비트코인", price: 118240, changePct: 2.38, currency: "USD", inTicker: true },
  { symbol: "ETH", name: "이더리움", price: 4612.5, changePct: 3.94, currency: "USD", inTicker: true },
  { symbol: "SOL", name: "솔라나", price: 241.8, changePct: -1.76, currency: "USD", inTicker: true },
  { symbol: "XRP", name: "리플", price: 2.91, changePct: 0.55, currency: "USD", inTicker: false },
  { symbol: "GOLD", name: "금", price: 4126.4, changePct: 0.28, currency: "USD", inTicker: true },
  { symbol: "WTI", name: "WTI", price: 63.4, changePct: -0.84, currency: "USD", inTicker: false },
  // fictional listed companies / tokens used in sample articles
  { symbol: "HNBS", name: "한빛반도체", price: 184500, changePct: 3.21, currency: "KRW", inTicker: true },
  { symbol: "NURI", name: "누리AI랩", price: 52300, changePct: 7.84, currency: "KRW", inTicker: true },
  { symbol: "SEON", name: "세온모빌리티", price: 31750, changePct: -2.61, currency: "KRW", inTicker: true },
  { symbol: "ARAB", name: "아라뱅크", price: 27150, changePct: 1.12, currency: "KRW", inTicker: false },
  { symbol: "MIRR", name: "미르로보틱스", price: 88400, changePct: 4.55, currency: "KRW", inTicker: false },
  { symbol: "NOVA", name: "노바페이", price: 41200, changePct: -0.96, currency: "KRW", inTicker: false },
  { symbol: "DAON", name: "다온클라우드", price: 63900, changePct: 0.47, currency: "KRW", inTicker: false },
  { symbol: "HGYL", name: "한결전자", price: 112000, changePct: -0.71, currency: "KRW", inTicker: false },
  { symbol: "BWV", name: "블루웨이브", price: 1.84, changePct: -6.42, currency: "USD", inTicker: true },
  { symbol: "CORE", name: "코어브릿지", price: 0.412, changePct: 11.3, currency: "USD", inTicker: false },
];

export interface SeedSentimentScope {
  scopeKey: string;
  label: string;
  score: number;
  change24h: number;
  volume: number;
  keywords: string[];
}

export const SENTIMENT_SOURCES = ["X", "Reddit", "텔레그램", "국내 커뮤니티"] as const;

export const SENTIMENT_SCOPES: SeedSentimentScope[] = [
  { scopeKey: "index", label: "NWM 센티먼트 인덱스", score: 47, change24h: 8, volume: 214380, keywords: ["ETF 순유입", "HBM", "금리 인하", "로보택시", "레버리지", "메인넷"] },
  { scopeKey: "asset:BTC", label: "비트코인", score: 58, change24h: 9, volume: 48210, keywords: ["ETF 순유입", "12만 달러", "김프"] },
  { scopeKey: "asset:ETH", label: "이더리움", score: 64, change24h: 14, volume: 22940, keywords: ["스테이킹", "L2", "가스비"] },
  { scopeKey: "asset:SOL", label: "솔라나", score: 12, change24h: -11, volume: 15320, keywords: ["밈코인 피로", "네트워크 혼잡"] },
  { scopeKey: "asset:KOSPI", label: "코스피", score: 22, change24h: 7, volume: 16050, keywords: ["밸류업", "외국인 순매수", "환율"] },
  { scopeKey: "asset:NASDAQ", label: "나스닥", score: 35, change24h: 4, volume: 19870, keywords: ["AI 실적", "금리"] },
  { scopeKey: "asset:HNBS", label: "한빛반도체", score: 52, change24h: 18, volume: 27410, keywords: ["HBM 퀄", "증설", "목표가"] },
  { scopeKey: "asset:NURI", label: "누리AI랩", score: 71, change24h: 23, volume: 31880, keywords: ["오픈웨이트", "상한가", "벤치마크"] },
  { scopeKey: "asset:SEON", label: "세온모빌리티", score: -27, change24h: -15, volume: 25110, keywords: ["사고 조사", "시범운행 중단설"] },
];
