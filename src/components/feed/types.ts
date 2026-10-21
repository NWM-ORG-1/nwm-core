import type { ArticleCard } from "@/data/dto";
import type { AiInvolvement, Beat } from "@/db/schema";

/** Compact card for client-side lists (river, For You, reader queue). */
export interface MiniCard {
  s: string; // slug
  t: string; // title
  d: string; // dek
  b: Beat;
  p: string; // publishedAt ISO
  r: number; // read seconds
  ai: AiInvolvement;
  br?: 1; // breaking
  st?: string; // story title
  sid?: string; // story id
  tg: string[]; // tags
  v: number; // views (7d)
}

export function toMini(c: ArticleCard): MiniCard {
  return {
    s: c.slug,
    t: c.title,
    d: c.dek,
    b: c.beat,
    p: c.publishedAt,
    r: c.readSeconds,
    ai: c.aiInvolvement,
    ...(c.isBreaking ? { br: 1 as const } : {}),
    ...(c.storyTitle ? { st: c.storyTitle } : {}),
    ...(c.storyId ? { sid: c.storyId } : {}),
    tg: c.tags.slice(0, 4),
    v: c.views,
  };
}
