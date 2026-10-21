import { z } from "zod";
import { passesKeywords } from "../../classify";
import { parseDate } from "../../text";
import { defineAdapter, type IngestItem } from "../../types";

const config = z.object({
  minPoints: z.number().int().min(1).default(150),
  /** Algolia full-text query; empty = all stories */
  query: z.string().max(100).default(""),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  hitsPerPage: z.number().int().min(1).max(100).default(50),
});

interface HnHit {
  objectID: string;
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  created_at?: string;
  author?: string;
}

/** Hacker News stories above a points threshold (Algolia search API). */
export const hnAdapter = defineAdapter({
  key: "hn",
  label: "Hacker News 인기글",
  description: "점수 기준 이상인 HN 스토리. 개발자 커뮤니티 신호로만 쓰고(시그널 전용 권장) 원문은 링크된 1차 출처로 확인합니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: { minPoints: 150, query: "", hitsPerPage: 50 },
  defaultPollSec: 1800,
  async run(ctx) {
    const c = ctx.config;
    const params = new URLSearchParams({
      tags: "story",
      numericFilters: `points>=${c.minPoints}`,
      hitsPerPage: String(c.hitsPerPage),
      attributesToHighlight: "none",
    });
    if (c.query) params.set("query", c.query);
    const data = await ctx.http.json<{ hits?: HnHit[] }>(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
    const items: IngestItem[] = [];
    for (const h of data.hits ?? []) {
      if (!h.title) continue;
      if (!passesKeywords(h.title, c.include, c.exclude)) continue;
      const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
      const host = h.url ? safeHost(h.url) : "news.ycombinator.com";
      items.push({
        externalId: h.objectID,
        url: h.url || discussion,
        title: h.title,
        summary: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments · ${host}`,
        lang: "en",
        publishedAt: parseDate(h.created_at) ?? null,
        weight: Math.min(1, (h.points ?? 0) / 600),
        payload: { points: h.points ?? 0, comments: h.num_comments ?? 0, discussion, by: h.author },
      });
    }
    return { items, note: `${items.length} stories ≥${c.minPoints}` };
  },
});

function safeHost(u: string): string {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}
