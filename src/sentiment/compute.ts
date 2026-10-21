import { clip, robustZ, toScore, type Prior } from "./stats";

/**
 * NWM sentiment index, method v1 (see /sentiment/method):
 *   social    — stance of posts in the last 24 h, weighted by source trust and
 *               engagement: ln((1+bull)/(1+bear))  (Antweiler & Frank 2004)
 *   market    — funding, long/short, open-interest change, kimchi premium,
 *               24 h return, realised volatility (inverted)
 *   attention — post volume against its own history, signed by the social mood
 * Each input → robust z (30-day median/MAD, clipped ±3; priors until history
 * exists) → weighted mean (0.40 / 0.45 / 0.15, missing parts dropped) →
 * 100·tanh(Z/2) → 6-hour half-life smoothing.
 */

export const METHOD = "v1";
export const WEIGHTS = { social: 0.4, market: 0.45, attention: 0.15 } as const;
/** an asset needs this many posts in 24 h to get its own reading */
export const MIN_POSTS_ASSET = 20;

export type Group = "국내 커뮤니티" | "텔레그램" | "X";

export interface PostIn {
  group: Group;
  trustTier: number;
  /** −1…1 */
  stance: number;
  engagement: { views?: number; comments?: number; likes?: number; shares?: number };
  llm: boolean;
  text: string | null;
}

const TIER_W = [0, 1.2, 1, 0.8, 0.6];

export function postWeight(p: PostIn): number {
  const e = p.engagement;
  const eng = 1 + Math.log10(1 + (e.views ?? 0) / 200 + (e.comments ?? 0) + (e.likes ?? 0) + (e.shares ?? 0));
  return (TIER_W[p.trustTier] ?? 0.6) * Math.min(3, eng) * (p.llm ? 1 : 0.7);
}

export interface SocialAggregate {
  raw: number;
  bullish: number;
  bearish: number;
  volume: number;
  groups: Array<{ name: Group; score: number; share: number }>;
}

export function socialAggregate(posts: PostIn[]): SocialAggregate {
  const sums = (list: PostIn[]) => {
    let bull = 0;
    let bear = 0;
    let neutral = 0;
    for (const p of list) {
      const w = postWeight(p);
      if (p.stance > 0) bull += w * p.stance;
      else if (p.stance < 0) bear += w * -p.stance;
      neutral += w * (1 - Math.abs(p.stance));
    }
    return { bull, bear, neutral, raw: Math.log((1 + bull) / (1 + bear)) };
  };
  const all = sums(posts);
  const total = all.bull + all.bear + all.neutral || 1;
  const byGroup = new Map<Group, PostIn[]>();
  for (const p of posts) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  return {
    raw: all.raw,
    bullish: Math.round((all.bull / total) * 1000) / 10,
    bearish: Math.round((all.bear / total) * 1000) / 10,
    volume: posts.length,
    groups: [...byGroup]
      .map(([name, list]) => ({ name, score: Math.round(100 * Math.tanh(sums(list).raw)), share: Math.round((list.length / posts.length) * 1000) / 1000 }))
      .sort((a, b) => b.share - a.share),
  };
}

/** Priors used until 30 days of history exist (typical ranges, not fitted). */
export const PRIORS: Record<string, Prior> = {
  social: { median: 0, scale: 0.5 },
  funding_rate: { median: 0.01, scale: 0.01 }, // % per 8 h
  long_short_ratio: { median: 1.5, scale: 0.4 },
  oi_change_24h: { median: 0, scale: 6 }, // %
  kimchi_premium: { median: 1, scale: 1.5 }, // %
  return_24h: { median: 0, scale: 3 }, // %
  volatility_24h: { median: 0.6, scale: 0.3 }, // % hourly σ
  volume: { median: 0, scale: 1 }, // replaced by history
};

export interface MarketInput {
  name: keyof typeof PRIORS;
  value: number;
  history: number[];
  /** +1: higher means greed; −1: higher means fear */
  sign: 1 | -1;
}

export interface Component {
  z: number;
  weight: number;
  mature: boolean;
  detail?: Record<string, unknown>;
}

export function marketComponent(inputs: MarketInput[]): Component | null {
  const parts = inputs
    .filter((i) => Number.isFinite(i.value))
    .map((i) => {
      const { z, mature } = robustZ(i.value, i.history, PRIORS[i.name]);
      return { name: i.name, value: round(i.value, 4), z: round(i.sign * z, 3), mature };
    });
  if (!parts.length) return null;
  const z = parts.reduce((a, p) => a + p.z, 0) / parts.length;
  return { z: clip(z), weight: WEIGHTS.market, mature: parts.every((p) => p.mature), detail: { inputs: parts } };
}

export function combine(parts: Partial<Record<keyof typeof WEIGHTS, Component | null>>): { z: number; coverage: number } {
  let sum = 0;
  let wsum = 0;
  for (const c of Object.values(parts)) {
    if (!c) continue;
    sum += c.z * c.weight;
    wsum += c.weight;
  }
  return { z: wsum ? sum / wsum : 0, coverage: wsum };
}

/** 0–1: sample size, which parts were available, and how mature their baselines are. */
export function confidence(volume: number, coverage: number, matureShare: number): number {
  const sample = Math.min(1, Math.sqrt(volume / 300));
  return round(Math.max(0, Math.min(1, sample * coverage * (0.5 + 0.5 * matureShare))), 3);
}

export const scoreFromZ = toScore;

const STOP = new Set(
  "그냥 진짜 이거 저거 그거 오늘 내일 어제 지금 이제 근데 그럼 그래서 아니 이게 뭐임 뭐냐 이번 다들 우리 너무 많이 조금 하나 있냐 없냐 있음 없음 하는 하고 해서 했다 한다 같은 같음 같다 그리고 때문 정도 시발 씨발 존나 졸라 ㅋㅋ ㅋㅋㅋ ㅎㅎ ㅠㅠ ㄹㅇ ㅇㅇ 갤러 the and for with that this from what about".split(" "),
);
const PROFANE = /시발|씨발|ㅅㅂ|ㅆㅂ|병신|ㅄ|븅신|좆|존나|졸라|ㅈㄴ|개새|새끼|닥쳐|미친|니미|엠창|느금|섹스|자지|보지/;

/**
 * Most frequent words across post texts — public chips, so profanity never
 * appears. `isNoise` drops words such as instrument names ("비트", "이더").
 */
export function topKeywords(texts: string[], k = 8, exclude: string[] = [], isNoise: (word: string) => boolean = () => false): string[] {
  const skip = new Set(exclude.map((w) => w.toLowerCase()));
  const counts = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const raw of t.split(/[^0-9A-Za-z가-힣$]+/)) {
      const w = raw.replace(/(은|는|이|가|을|를|에|의|도|로|으로|에서|이랑|랑|까지|부터|보다|처럼|만|좀|임|냐|네|요|다|함)$/u, "");
      if (w.length < 2 || /^\d+$/.test(w)) continue;
      const key = w.toLowerCase();
      if (STOP.has(key) || skip.has(key) || PROFANE.test(w) || seen.has(key) || isNoise(w)) continue;
      seen.add(key);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w]) => w);
}

function round(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
