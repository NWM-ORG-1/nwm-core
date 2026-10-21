/**
 * Phase-1 recommender: pure functions over article metadata, cheap enough to
 * run at render time and in the browser. Deliberately explainable; this is the
 * seam where a learned model plugs in later.
 */

export interface Rankable {
  slug: string;
  beat: string;
  tags: string[];
  tickers?: string[];
  storyId?: string | null;
  publishedAt: string;
  views: number;
}

const HOUR = 3_600_000;

function overlap(a: readonly string[] = [], b: readonly string[] = []) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a.map((s) => s.toLowerCase()));
  let n = 0;
  for (const s of b) if (set.has(s.toLowerCase())) n++;
  return n;
}

/** Content similarity + freshness + popularity relative to a seed article. */
export function relatedScore(seed: Rankable, c: Rankable): number {
  const sameStory = seed.storyId && seed.storyId === c.storyId ? 4 : 0;
  const beat = seed.beat === c.beat ? 2.5 : 0;
  const tags = overlap(seed.tags, c.tags) * 2;
  const tickers = overlap(seed.tickers, c.tickers) * 1.5;
  const gapH = Math.abs(new Date(seed.publishedAt).getTime() - new Date(c.publishedAt).getTime()) / HOUR;
  const fresh = 1.5 * Math.exp(-gapH / 24);
  const pop = Math.log10(Math.max(10, c.views)) / 3;
  return sameStory + beat + tags + tickers + fresh + pop;
}

export function related<T extends Rankable>(seed: Rankable, pool: T[], n = 6): T[] {
  return pool
    .filter((c) => c.slug !== seed.slug)
    .map((c) => [c, relatedScore(seed, c)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c]) => c);
}

/* ───────────────────── on-device personalisation ───────────────────── */

export interface ReadRecord {
  t: number; // epoch ms of last read
  beat: string;
  tags: string[];
  /** seconds actually spent */
  dwell: number;
  /** expected reading seconds of the article */
  expect: number;
  /** reached the end */
  done?: boolean;
}

export type ReadHistory = Record<string, ReadRecord>;

export interface Affinity {
  beats: Record<string, number>;
  tags: Record<string, number>;
  total: number;
}

/** Recency-weighted beat/tag affinity, weighted by how much of each piece was actually read. */
export function affinityFrom(history: ReadHistory, now: number): Affinity {
  const beats: Record<string, number> = {};
  const tags: Record<string, number> = {};
  let total = 0;
  for (const r of Object.values(history)) {
    const engagement = Math.min(1.5, Math.max(0.2, r.expect > 0 ? r.dwell / r.expect : 0.5)) + (r.done ? 0.3 : 0);
    const w = engagement * Math.exp(-(now - r.t) / (72 * HOUR));
    beats[r.beat] = (beats[r.beat] ?? 0) + w;
    for (const t of r.tags) tags[t.toLowerCase()] = (tags[t.toLowerCase()] ?? 0) + w;
    total += w;
  }
  return { beats, tags, total };
}

function decay(c: Rankable, now: number) {
  const ageH = (now - new Date(c.publishedAt).getTime()) / HOUR;
  return Math.exp(-Math.max(0, ageH) / 30);
}

export function personalRank<T extends Rankable>(pool: T[], history: ReadHistory, now: number, n = 6): T[] {
  const aff = affinityFrom(history, now);
  const unread = pool.filter((c) => !history[c.slug]);
  if (aff.total < 0.5) {
    // Cold start: what everyone is reading right now.
    return [...unread].sort((a, b) => b.views * decay(b, now) - a.views * decay(a, now)).slice(0, n);
  }
  return unread
    .map((c) => {
      const b = (aff.beats[c.beat] ?? 0) / aff.total;
      const g = c.tags.reduce((s, tag) => s + (aff.tags[tag.toLowerCase()] ?? 0), 0) / aff.total;
      const score = (2.2 * b + 1.4 * g + 0.25 * Math.log10(Math.max(10, c.views))) * decay(c, now);
      return [c, score] as const;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c]) => c);
}
