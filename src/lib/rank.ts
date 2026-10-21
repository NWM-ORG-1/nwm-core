/**
 * Front-page ranking. Articles that belong to the same story are clustered so a
 * burst of automated updates becomes one entry ("업데이트 N건") instead of
 * flooding the top of the page.
 */

export interface RankCard {
  slug: string;
  storyId?: string | null;
  publishedAt: string;
  views: number;
  isBreaking: boolean;
  featured: boolean;
}

export interface Cluster<T extends RankCard> {
  key: string;
  lead: T;
  members: T[]; // newest first, includes lead
  score: number;
}

const HOUR = 3_600_000;

export function articleScore(c: RankCard, now: number): number {
  const ageH = Math.max(0, (now - new Date(c.publishedAt).getTime()) / HOUR);
  let s = Math.exp(-ageH / 6) * (1 + Math.log10(c.views + 10) / 3);
  if (c.isBreaking && ageH < 3) s += 2;
  if (c.featured) s += 3;
  return s;
}

export function clusterTop<T extends RankCard>(cards: T[], now: number, n = 6): Cluster<T>[] {
  const groups = new Map<string, T[]>();
  for (const c of cards) {
    const key = c.storyId ? `story:${c.storyId}` : `a:${c.slug}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const clusters: Cluster<T>[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    let lead = members[0];
    let best = -Infinity;
    for (const m of members) {
      const s = articleScore(m, now);
      if (s > best) {
        best = s;
        lead = m;
      }
    }
    // A story with several fresh updates gets a modest boost.
    const fresh = members.filter((m) => now - new Date(m.publishedAt).getTime() < 24 * HOUR).length;
    clusters.push({ key, lead, members, score: best + 0.15 * Math.max(0, fresh - 1) });
  }
  return clusters.sort((a, b) => b.score - a.score).slice(0, n);
}
