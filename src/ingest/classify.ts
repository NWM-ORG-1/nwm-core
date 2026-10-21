import type { Beat } from "@/db/schema";

/**
 * Deterministic triage until phase 3 brings a model: which beat an item
 * probably belongs to, which instruments it mentions, and how much it
 * deserves an editor's attention.
 */

const BEAT_WORDS: Record<Exclude<Beat, "sentiment">, RegExp> = {
  ai: /\b(AI|A\.I\.|LLMs?|GPT[-\w.]*|Claude|Gemini|Llama|OpenAI|Anthropic|DeepMind|Copilot|transformer|neural|diffusion|agentic|agents?|inference|fine-?tun\w*|benchmark|multimodal|reasoning model)\b|인공지능|생성형|초거대|거대언어|언어모델|머신러닝|딥러닝|에이전트|챗봇|추론 모델|파운데이션 모델/gi,
  crypto: /\b(bitcoin|BTC|ethereum|ETH|solana|SOL|XRP|stablecoins?|USDT|USDC|crypto\w*|blockchain|DeFi|NFTs?|tokens?|altcoins?|memecoin|ETF inflows?|on-?chain|wallets?|exchange listing)\b|비트코인|이더리움|솔라나|리플|가상자산|암호화폐|가상화폐|코인|블록체인|스테이블코인|디파이|토큰|업비트|빗썸|코인원|코빗|거래지원|상장폐지|유의종목|김치 ?프리미엄|김프/gi,
  economy: /\b(Fed|FOMC|rates?|inflation|CPI|PPI|GDP|payrolls?|unemployment|treasury|yields?|bonds?|tariffs?|exports?|imports?|earnings|revenue|guidance|IPO|merger|acquisition|8-K|10-Q|10-K|dividend|buyback|recession)\b|금리|기준금리|환율|물가|소비자물가|성장률|경상수지|무역수지|수출|수입|고용|실업|국채|증시|코스피|코스닥|주가|실적|매출|영업이익|순이익|공시|유상증자|무상증자|합병|인수|최대주주|자사주|배당|한국은행|금통위|연준|금융위|금감원|재정|예산|세제|부동산|가계부채/gi,
  tech: /\b(chips?|semiconductors?|HBM|DRAM|NAND|foundry|smartphones?|iPhone|Android|cloud|data ?centers?|security|vulnerabilit\w*|CVE-\d{4}-\d+|breach|ransomware|release|launch(es|ed)?|5G|6G|robot\w*|EVs?|batter(y|ies)|satellite|quantum|open source|GitHub|API)\b|반도체|파운드리|메모리|스마트폰|클라우드|데이터센터|보안|해킹|취약점|랜섬웨어|개인정보|플랫폼|통신|로봇|전기차|배터리|2차전지|우주|위성|양자|소프트웨어|출시|업데이트|오픈소스/gi,
};

export function guessBeat(title: string, summary: string, sourceBeats: readonly Beat[]): Beat | null {
  let best: Beat | null = null;
  let bestScore = 0;
  for (const beat of Object.keys(BEAT_WORDS) as Array<keyof typeof BEAT_WORDS>) {
    const re = BEAT_WORDS[beat];
    const inTitle = title.match(re)?.length ?? 0;
    const inBody = summary.slice(0, 1200).match(re)?.length ?? 0;
    const score = inTitle * 2 + Math.min(inBody, 6) + (sourceBeats.includes(beat) ? 1.5 : 0);
    if (score > bestScore) {
      best = beat;
      bestScore = score;
    }
  }
  if (bestScore >= 1.5) return best;
  return sourceBeats[0] ?? null;
}

/**
 * Instrument aliases → canonical ids shared by items, posts and quotes.
 * Tickers match case-sensitively (so "sol" or "Eth" in prose do not count);
 * names match case-insensitively. Cashtags ($XYZ) always count.
 */
const ASSETS: Array<{ id: string; tickers?: RegExp; names?: RegExp }> = [
  { id: "BTC", tickers: /\bBTC\b/, names: /비트코인|비코(?!인)|빗코|bitcoin/i },
  { id: "ETH", tickers: /\bETH\b(?! ?Z[uü]rich)/, names: /이더리움|이더(?!넷|리얼)|ethereum/i },
  { id: "SOL", tickers: /\bSOL\b/, names: /솔라나|solana/i },
  { id: "XRP", tickers: /\bXRP\b/, names: /리플|엑스알피/ },
  { id: "DOGE", tickers: /\bDOGE\b/, names: /도지코인|dogecoin/i },
  { id: "ADA", names: /에이다|카르다노|cardano/i },
  { id: "BNB", tickers: /\bBNB\b/, names: /바이낸스코인/ },
  { id: "USDT", tickers: /\bUSDT\b/, names: /테더(?!링)/ },
  { id: "USDC", tickers: /\bUSDC\b/ },
  { id: "005930", names: /삼성전자|삼전|005930/ },
  { id: "000660", names: /SK하이닉스|하이닉스|하닉|000660/ },
  { id: "005380", names: /현대차|현대자동차|005380/ },
  { id: "373220", names: /LG에너지솔루션|엘지엔솔|엘엔솔|373220/ },
  { id: "035420", names: /네이버|NAVER|035420/ },
  { id: "035720", names: /카카오(?!뱅크|페이|게임즈)|035720/ },
  { id: "068270", names: /셀트리온|068270/ },
  { id: "NVDA", tickers: /\bNVDA\b/, names: /엔비디아|nvidia/i },
  { id: "TSLA", tickers: /\bTSLA\b/, names: /테슬라|tesla/i },
  { id: "AAPL", tickers: /\bAAPL\b/, names: /애플(?!리케이션|워치)|\bapple inc/i },
  { id: "MSFT", tickers: /\bMSFT\b/, names: /마이크로소프트|microsoft/i },
  { id: "COIN", names: /코인베이스|coinbase/i },
  { id: "MSTR", tickers: /\bMSTR\b/, names: /마이크로스트래티지|microstrategy/i },
];

/** Instruments mentioned in a text (canonical ids, deduped, in order of first mention). */
export function extractAssets(text: string): string[] {
  const found: Array<[number, string]> = [];
  for (const a of ASSETS) {
    const at = Math.min(a.tickers?.exec(text)?.index ?? Infinity, a.names?.exec(text)?.index ?? Infinity);
    if (at !== Infinity) found.push([at, a.id]);
  }
  for (const m of text.matchAll(/(?<![\w$])\$([A-Z]{2,6})\b/g)) found.push([m.index ?? 0, m[1]]);
  found.sort((x, y) => x[0] - y[0]);
  return [...new Set(found.map(([, id]) => id))].slice(0, 12);
}

const BREAKING = /속보|긴급|\[단독\]|breaking|urgent|halt(ed)?|거래정지|매매정지|상장폐지|유의종목|투자주의|해킹|파산|bankrupt/i;

export interface ScoreInput {
  trustTier: number;
  signalOnly: boolean;
  /** adapter's own importance hint 0–1 */
  weight?: number;
  title: string;
  publishedAt?: Date | null;
  /** source config: words that make an item matter more */
  boost?: string[];
  duplicate?: boolean;
  now: Date;
}

/** 0–100 attention score for the inbox. */
export function scoreItem(i: ScoreInput): number {
  const tierBase = [0, 50, 40, 25, 15][i.trustTier] ?? 25;
  let s = tierBase + Math.round((i.weight ?? 0.3) * 35);
  if (i.boost?.length) {
    const t = i.title.toLowerCase();
    const hits = i.boost.filter((w) => w && t.includes(w.toLowerCase())).length;
    s += Math.min(20, hits * 10);
  }
  if (BREAKING.test(i.title)) s += 8;
  if (i.signalOnly) s -= 10;
  if (i.publishedAt) {
    const ageH = (i.now.getTime() - i.publishedAt.getTime()) / 3_600_000;
    if (ageH > 72) s -= 25;
    else if (ageH > 24) s -= 10;
  }
  if (i.duplicate) s = Math.min(s, 10);
  return Math.max(0, Math.min(100, s));
}

/** Free-text keyword filter used by many adapters' configs. */
export function passesKeywords(text: string, include?: string[], exclude?: string[]): boolean {
  const t = text.toLowerCase();
  if (exclude?.some((w) => w && t.includes(w.toLowerCase()))) return false;
  if (include?.length) return include.some((w) => w && t.includes(w.toLowerCase()));
  return true;
}
