import { clip } from "./text";

/**
 * What changed between two versions of a watched page
 * (adapters/generic/page-watch.ts): paragraphs added, removed or reworded,
 * the heading each change sits under, and the words that changed inside a
 * reworded paragraph. Pure functions, no I/O.
 */

export type Op = "same" | "del" | "add";

/** above this many cells the paragraph diff stops keeping order (rare: a rewritten document) */
const LCS_CELLS = 4_000_000;
const WORD_CELLS = 1_000_000;

/** Longest common subsequence as an edit script; deletions come before additions inside a change. */
export function editScript<T>(a: readonly T[], b: readonly T[]): Array<[Op, T]> {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const out: Array<[Op, T]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(["same", a[i]]);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) out.push(["del", a[i++]]);
    else out.push(["add", b[j++]]);
  }
  while (i < n) out.push(["del", a[i++]]);
  while (j < m) out.push(["add", b[j++]]);
  return out;
}

/** Paragraph diff: common head and tail first, then LCS on the middle (or plain set difference when huge). */
export function diffLines(a: readonly string[], b: readonly string[]): Array<[Op, string]> {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const midA = a.slice(s, ea);
  const midB = b.slice(s, eb);
  const mid = midA.length * midB.length <= LCS_CELLS ? editScript(midA, midB) : unordered(midA, midB);
  const same = (t: string): [Op, string] => ["same", t];
  return [...a.slice(0, s).map(same), ...mid, ...a.slice(ea).map(same)];
}

function unordered(a: string[], b: string[]): Array<[Op, string]> {
  const left = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const inB = left(b);
  const inA = left(a);
  const out: Array<[Op, string]> = [];
  for (const x of a) {
    const k = inB.get(x) ?? 0;
    if (k) inB.set(x, k - 1);
    else out.push(["del", x]);
  }
  for (const x of b) {
    const k = inA.get(x) ?? 0;
    if (k) inA.set(x, k - 1);
    else out.push(["add", x]);
  }
  return out;
}

export interface Change {
  kind: "reworded" | "added" | "removed";
  before?: string;
  after?: string;
  /** nearest heading-like paragraph above the change */
  under?: string;
}

/** a short line without closing punctuation: "12. Limitation of Liability", "제5조(책임의 제한)" */
export function isHeading(line: string): boolean {
  return line.length <= 90 && /\p{L}/u.test(line) && !/[.。!?;:,]$/.test(line) && line.split(" ").length <= 14;
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[\s\p{P}]+/u).filter((x) => x.length > 1));
}

/** Dice coefficient on word sets: how much of a paragraph survived the edit. */
export function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return (2 * both) / (x.size + y.size);
}

const PAIR = 0.5;

/** Groups an edit script into changes; a removed paragraph close to an added one is a rewording. */
export function changesOf(script: Array<[Op, string]>): Change[] {
  const out: Change[] = [];
  let heading: string | undefined;
  let dels: string[] = [];
  let adds: string[] = [];
  const flush = () => {
    const used = new Set<number>();
    const pairs = new Map<number, number>();
    let from = 0;
    for (let d = 0; d < dels.length; d++) {
      let best = -1;
      let score = PAIR;
      for (let k = from; k < adds.length; k++) {
        const o = overlap(dels[d], adds[k]);
        if (o >= score) [best, score] = [k, o];
      }
      if (best >= 0) {
        pairs.set(best, d);
        used.add(d);
        from = best + 1;
      }
    }
    for (let k = 0; k < adds.length; k++) {
      const d = pairs.get(k);
      out.push(d === undefined ? { kind: "added", after: adds[k], under: heading } : { kind: "reworded", before: dels[d], after: adds[k], under: heading });
    }
    for (let d = 0; d < dels.length; d++) if (!used.has(d)) out.push({ kind: "removed", before: dels[d], under: heading });
    dels = [];
    adds = [];
  };
  for (const [op, line] of script) {
    if (op === "same") {
      if (dels.length || adds.length) flush();
      if (isHeading(line)) heading = line;
    } else (op === "del" ? dels : adds).push(line);
  }
  if (dels.length || adds.length) flush();
  return out;
}

/** Japanese and Chinese run without spaces: compare characters there, words elsewhere. */
function tokens(s: string): { toks: string[]; sep: string } {
  const spaces = (s.match(/ /g) ?? []).length;
  return s.length > 40 && spaces / s.length < 0.02 ? { toks: [...s], sep: "" } : { toks: s.split(" "), sep: " " };
}

/**
 * A reworded paragraph as git's word diff: "… shall be [-entitled to-]{+responsible for+} any …",
 * with `context` words kept around each change and " … " between changes far apart.
 */
export function wordDiff(before: string, after: string, context = 8): string {
  const a = tokens(before);
  const b = tokens(after);
  const sep = a.sep && b.sep;
  if (a.toks.length * b.toks.length > WORD_CELLS) return `이전: “${clip(before, 400)}” → 이후: “${clip(after, 400)}”`;
  const runs: Array<{ op: Op; toks: string[] }> = [];
  for (const [op, t] of editScript(a.toks, b.toks)) {
    const last = runs.at(-1);
    if (last?.op === op) last.toks.push(t);
    else runs.push({ op, toks: [t] });
  }
  const parts: string[] = [];
  runs.forEach((r, n) => {
    const text = (xs: string[]) => xs.join(sep);
    if (r.op === "del") return void parts.push(`[-${text(r.toks)}-]`);
    if (r.op === "add") return void parts.push(`{+${text(r.toks)}+}`);
    const first = n === 0;
    const last = n === runs.length - 1;
    if (first && r.toks.length > context) parts.push(`… ${text(r.toks.slice(-context))}`);
    else if (last && r.toks.length > context) parts.push(`${text(r.toks.slice(0, context))} …`);
    else if (!first && !last && r.toks.length > context * 2) parts.push(`${text(r.toks.slice(0, context))} … ${text(r.toks.slice(-context))}`);
    else parts.push(text(r.toks));
  });
  return parts.join(sep || "");
}

const SHORT = 240;

/** One change as a line the inbox and the drafting model can read even with line breaks folded. */
export function renderChange(c: Change, n: number): string {
  const where = c.under ? ` · ‘${clip(c.under, 60)}’ 아래` : "";
  if (c.kind === "added") return `[추가 ${n}${where}] “${clip(c.after ?? "", 1200)}”`;
  if (c.kind === "removed") return `[삭제 ${n}${where}] “${clip(c.before ?? "", 1200)}”`;
  const before = c.before ?? "";
  const after = c.after ?? "";
  const body = before.length <= SHORT && after.length <= SHORT ? `이전: “${before}” → 이후: “${after}”` : wordDiff(before, after);
  return `[수정 ${n}${where}] ${body}`;
}

export function countChanges(cs: Change[]): { reworded: number; added: number; removed: number } {
  return {
    reworded: cs.filter((c) => c.kind === "reworded").length,
    added: cs.filter((c) => c.kind === "added").length,
    removed: cs.filter((c) => c.kind === "removed").length,
  };
}

/** characters actually changed — a reworded paragraph counts only its changed words */
export function changedChars(cs: Change[]): number {
  let n = 0;
  for (const c of cs) {
    if (c.kind !== "reworded") n += (c.after ?? c.before ?? "").length;
    else {
      const a = tokens(c.before ?? "");
      const b = tokens(c.after ?? "");
      if (a.toks.length * b.toks.length > WORD_CELLS) n += Math.abs((c.after ?? "").length - (c.before ?? "").length) + 1;
      else for (const [op, t] of editScript(a.toks, b.toks)) if (op !== "same") n += t.length;
    }
  }
  return n;
}

/* ── document dates ── */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const DATE = String.raw`(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+${MONTH},?\s+\d{4})`;
const LABEL = String.raw`(?:effective(?:\s+(?:date|as\s+of|on|from))?|last\s+(?:updated|modified|revised|changed)|(?:date\s+)?(?:updated|revised|modified)(?:\s+on)?|version\s+date|시행일자?|개정일자?|최종\s*(?:수정|개정|변경)일?|공고일자?|적용일자?|변경일자?|施行日|最終更新日?|改定日|更新日)`;
const LABEL_FIRST = new RegExp(String.raw`${LABEL}[^\d\n]{0,24}?${DATE}`, "gi");
const DATE_FIRST = new RegExp(String.raw`${DATE}\.?\s*(?:부터\s*)?(?:시행|적용)`, "gi");

/** "October 20, 2026" · "2026. 10. 20" · "2026년 10월 20일" → "2026-10-20" */
export function isoDay(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let y: number;
  let mo: number;
  let d: number;
  let m = /(\d{4})\s*(?:[-./]|년|年)\s*(\d{1,2})\s*(?:[-./]|월|月)\s*(\d{1,2})/.exec(s);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) [y, mo, d] = [Number(m[3]), Number(m[1]), Number(m[2])]; // US: 10/23/2026
  else if ((m = /([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s))) [y, mo, d] = [Number(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2])];
  else if ((m = /(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s))) [y, mo, d] = [Number(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1])];
  else return null;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface DocDate {
  /** as the page says it, e.g. "Last updated: October 20, 2026" */
  label: string;
  iso: string | null;
}

/** The document's own date: the latest "effective / last updated / 시행일" date on the page. */
export function docDate(text: string): DocDate | null {
  const found: DocDate[] = [];
  for (const re of [LABEL_FIRST, DATE_FIRST]) {
    for (const m of text.matchAll(re)) {
      found.push({ label: clip(m[0].replace(/\s+/g, " "), 80), iso: isoDay(m[1]) });
      if (found.length >= 60) break;
    }
  }
  if (!found.length) return null;
  const dated = found.filter((f) => f.iso);
  if (!dated.length) return found[0];
  return dated.reduce((best, f) => (f.iso! > best.iso! ? f : best));
}
