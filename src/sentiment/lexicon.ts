/**
 * Rule-based stance for Korean investment-community language (and a little
 * English). The fallback when a post may not go to an LLM (no consent, no key,
 * budget reached) and the baseline the LLM is checked against.
 */

export const LEXICON_ID = "lexicon-v1";

/** term → weight (positive = bullish). Longer terms are matched first. */
const RAW_TERMS: Array<[string, number]> = [
  // bullish
  ["가즈아", 2],
  ["가즈아아", 2],
  ["떡상", 2],
  ["폭등", 2],
  ["급등", 1.5],
  ["불장", 2],
  ["신고가", 2],
  ["풀매수", 2],
  ["투더문", 2],
  ["달까지", 2],
  ["상한가", 2],
  ["호재", 1.5],
  ["반등", 1],
  ["돌파", 1],
  ["상승", 1],
  ["오른다", 1],
  ["오를", 0.8],
  ["올랐", 0.8],
  ["영끌", 1],
  ["추매", 0.8],
  ["줍줍", 1],
  ["익절", 0.5],
  ["존버", 0.4],
  ["매수", 0.5],
  ["롱", 0.5],
  ["moon", 2],
  ["pump", 1.5],
  ["bullish", 1.5],
  ["bull", 1],
  ["ath", 1.5],
  ["long", 0.4],
  ["buy", 0.4],
  ["🚀", 2],
  ["📈", 1.5],
  // bearish
  ["떡락", -2],
  ["폭락", -2],
  ["급락", -1.5],
  ["하락장", -2],
  ["하한가", -2],
  ["나락", -2],
  ["한강", -2],
  ["망했", -2],
  ["망함", -2],
  ["끝났", -1.5],
  ["청산", -1.5],
  ["설거지", -1.5],
  ["악재", -1.5],
  ["물렸", -1],
  ["물림", -1],
  ["손절", -1],
  ["하락", -1],
  ["내린다", -1],
  ["빠진다", -1],
  ["빠졌", -0.8],
  ["거품", -1],
  ["고점", -0.5],
  ["매도", -0.5],
  ["숏", -0.5],
  ["공포", -1],
  ["dump", -1.5],
  ["crash", -2],
  ["bearish", -1.5],
  ["bear", -1],
  ["rekt", -2],
  ["short", -0.4],
  ["sell", -0.4],
  ["📉", -1.5],
  ["😭", -1],
];
const TERMS = [...RAW_TERMS].sort((a, b) => b[0].length - a[0].length);

const NEGATORS = ["안 ", "안", "못 ", "못", "않", "없", "not ", "no ", "never "];

export interface LexiconResult {
  stance: number;
  label: "bull" | "bear" | "neutral";
  hits: number;
}

export function lexiconScore(text: string): LexiconResult {
  const t = ` ${text.toLowerCase()} `;
  let sum = 0;
  let hits = 0;
  const used = new Array<boolean>(t.length).fill(false);
  for (const [term, w] of TERMS) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(term, from);
      if (at < 0) break;
      from = at + term.length;
      if (used[at]) continue;
      // English words must stand alone ("bull" ≠ "bullet")
      if (/^[a-z]+$/.test(term) && (/[a-z]/.test(t[at - 1] ?? "") || /[a-z]/.test(t[at + term.length] ?? ""))) continue;
      for (let i = at; i < at + term.length; i++) used[i] = true;
      const before = t.slice(Math.max(0, at - 4), at);
      const after = t.slice(at + term.length, at + term.length + 4);
      const negated = NEGATORS.some((n) => before.endsWith(n)) || /^(지 ?않|지 ?마|ㄴ다고\?)/.test(after);
      sum += negated ? -w * 0.7 : w;
      hits++;
    }
  }
  const stance = Math.tanh(sum / 2);
  return { stance: Math.round(stance * 1000) / 1000, label: stance > 0.2 ? "bull" : stance < -0.2 ? "bear" : "neutral", hits };
}
