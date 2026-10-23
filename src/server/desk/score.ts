import type { CheckResult, DeskScores } from "@/db/schema";
import { CHECK_META } from "../checks";
import type { DeskModel, Effect } from "./types";

/**
 * The desk's arithmetic, kept pure for tests: the model's judgement as one
 * score, the learned adjustment, the exploration bonus, how many drafts the
 * day allows by now, which stories to draft, and the low-risk rules.
 */

export const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/** News value and reader interest first, then evidence, minus risk. */
export function baseScore(j: { news: number; interest: number; evidence: number; risk: number }): number {
  return clamp100(0.35 * j.news + 0.35 * j.interest + 0.2 * j.evidence + 0.1 * (100 - j.risk));
}

/** An effect pulled toward 0 by how little evidence it has. */
export function shrunk(e: Effect | undefined, k: number): number {
  return e && e.n > 0 ? (e.mean * e.n) / (e.n + k) : 0;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Learned adjustment in points (±15): what readers responded to, weighted by
 * how much the model trusts its reader data (nothing while it is still
 * collecting), and what editors kept or threw away among earlier desk drafts.
 */
export function priorPoints(m: DeskModel, s: { beat: string; topic: string; sources: string[] }): number {
  const reader = shrunk(m.reader.beat[s.beat], 5) + shrunk(m.reader.topic[s.topic], 5) + mean(s.sources.map((k) => shrunk(m.reader.source[k], 5)));
  const editor = 0.4 * shrunk(m.editor.beat[s.beat], 3) + 0.6 * shrunk(m.editor.topic[s.topic], 3);
  const pts = 6 * m.confidence * reader + 20 * editor;
  return Math.max(-15, Math.min(15, Math.round(pts)));
}

/** Bonus (0–6 points) for a topic with little evidence either way, so early guesses do not lock in. */
export function explorePoints(m: DeskModel, topic: string): number {
  if (!topic.trim()) return 0;
  const n = (m.reader.topic[topic]?.n ?? 0) + (m.editor.topic[topic]?.n ?? 0);
  return Math.round(6 / Math.sqrt(1 + n));
}

export function finalScores(j: { news: number; interest: number; evidence: number; risk: number }, prior: number, explore: number): DeskScores {
  const s = { news: clamp100(j.news), interest: clamp100(j.interest), evidence: clamp100(j.evidence), risk: clamp100(j.risk) };
  const base = baseScore(s);
  return { ...s, base, prior, explore, final: clamp100(base + prior + explore) };
}

/* ───────────────────────── the day's quota ───────────────────────── */

const DAY_START = 7; // KST
const DAY_END = 23;
/** A story this strong may run ahead of the pacing (never past the day's quota). */
export const BREAKING_SCORE = 88;

export function kstHour(now: Date): number {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return k.getUTCHours() + k.getUTCMinutes() / 60;
}

/** Start of today in KST, as a UTC instant. */
export function kstDayStart(now: Date): Date {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3_600_000);
}

/**
 * How many desk drafts the day allows by `now`: the quota spread over
 * 07:00–23:00 KST, slightly ahead of time, none before 07:00.
 */
export function pacedAllowance(daily: number, now: Date): number {
  if (daily <= 0) return 0;
  const h = kstHour(now);
  if (h < DAY_START) return 0;
  const f = Math.min(1, (h - DAY_START + 1) / (DAY_END - DAY_START));
  return Math.min(daily, Math.max(1, Math.ceil(daily * f)));
}

export interface Contender {
  key: string;
  final: number;
  explore: number;
  /** judged worth drafting and at or above the bar */
  eligible: boolean;
  /** judged worth drafting and at most 10 points under the bar (a possible exploration pick) */
  near: boolean;
}

/**
 * Slots for drafting now. `immediate`: anything over the bar until the day's
 * quota is used. `spread`: the paced allowance (breaking-strength stories may
 * still run ahead, see pickStories).
 */
export function draftSlots(s: { dailyDrafts: number; pacing: "immediate" | "spread" }, now: Date, done: number): { paced: number; daily: number } {
  const daily = Math.max(0, s.dailyDrafts - done);
  return { daily, paced: s.pacing === "spread" ? Math.max(0, pacedAllowance(s.dailyDrafts, now) - done) : daily };
}

/** Exploration picks (under the bar) the day allows: its share of the daily quota. */
export function exploreAllowance(dailyDrafts: number, exploreShare: number, exploredToday: number): number {
  return Math.max(0, Math.round(dailyDrafts * exploreShare) - exploredToday);
}

/**
 * Stories to draft now: the best by final score, with a few slots for
 * little-tried topics just under the bar — never more than the day's
 * exploration share (`exploreLeft`), so the bar itself does not move.
 * Breaking-strength stories may use the rest of the day's quota early.
 */
export function pickStories(c: Contender[], o: { paced: number; daily: number; exploreShare: number; exploreLeft: number }): string[] {
  const picks: string[] = [];
  const has = (k: string) => picks.includes(k);
  const best = c.filter((x) => x.eligible).sort((a, b) => b.final - a.final);
  const under = c.filter((x) => !x.eligible && x.near && x.explore > 0).sort((a, b) => b.explore + b.final - (a.explore + a.final));
  const slots = Math.max(0, Math.min(o.paced, o.daily));
  const reserve = slots >= 2 ? Math.min(Math.round(slots * o.exploreShare), o.exploreLeft, under.length) : 0;

  for (const x of best) {
    if (picks.length >= slots - reserve) break;
    picks.push(x.key);
  }
  for (const x of under.slice(0, Math.max(0, reserve))) {
    if (picks.length >= slots) break;
    picks.push(x.key);
  }
  for (const x of best) {
    if (picks.length >= slots) break;
    if (!has(x.key)) picks.push(x.key);
  }
  for (const x of best) {
    if (picks.length >= o.daily) break;
    if (!has(x.key) && x.final >= BREAKING_SCORE) picks.push(x.key);
  }
  return picks;
}

/* ───────────────────────── low risk ───────────────────────── */

export interface LowRiskInput {
  scores: Pick<DeskScores, "risk" | "evidence">;
  /** primary first */
  items: Array<{ trustTier: number; signalOnly: boolean; licReviewed: boolean; licCommercialOk: boolean | null }>;
  checks: CheckResult[];
}

/**
 * Would this draft be safe to publish without an editor? Automatic publishing
 * is not switched on; editors see the result so the rules can earn trust first.
 */
export function lowRisk(i: LowRiskInput): { ok: boolean; why: string[] } {
  const usable = i.items.filter((x) => !x.signalOnly);
  const fails: string[] = [];
  if (i.scores.risk > 20) fails.push(`위험 점수 ${i.scores.risk} (20 이하여야 함)`);
  if (i.scores.evidence < 70) fails.push(`근거 점수 ${i.scores.evidence} (70 이상이어야 함)`);
  if (!usable.length || usable[0].trustTier !== 1) fails.push("주 자료가 공식·1차 출처가 아님");
  if (usable.some((x) => !x.licReviewed || x.licCommercialOk === false)) fails.push("라이선스를 검토하지 않았거나 상업 이용이 안 되는 출처 포함");
  const bad = i.checks.filter((c) => c.id !== "legal" && c.id !== "ai_label" && !c.ok);
  if (bad.length) fails.push(`체크 미통과: ${bad.map((c) => CHECK_META[c.id].label).join(", ")}`);
  return { ok: fails.length === 0, why: fails.length ? fails : ["위험·근거·출처·체크 기준을 모두 통과"] };
}
