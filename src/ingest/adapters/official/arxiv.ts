import { z } from "zod";
import { passesKeywords } from "../../classify";
import { parseFeed } from "../../feed";
import { clip } from "../../text";
import { defineAdapter, type IngestItem } from "../../types";

const config = z.object({
  categories: z.array(z.string().regex(/^[a-z-]+(\.[A-Z]{2})?$/)).min(1).max(8).default(["cs.AI", "cs.CL", "cs.LG"]),
  /** new = first appearance; cross / replace are re-announcements */
  announceTypes: z.array(z.enum(["new", "cross", "replace", "replace-cross"])).default(["new"]),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  maxItems: z.number().int().min(1).max(400).default(120),
  weight: z.number().min(0).max(1).default(0.25),
});

/**
 * arXiv daily announcements (RSS, one request per day is enough). Metadata and
 * abstracts are CC0; PDFs are never re-hosted — items link to the abstract page.
 */
export const arxivAdapter = defineAdapter({
  key: "arxiv",
  label: "arXiv 신규 논문",
  description: "rss.arxiv.org 일일 발표분. 분야(cs.AI 등)와 발표 유형(new/cross)으로 거르고, 키워드 필터를 권장합니다 (하루 수백 건).",
  kind: "rss",
  group: "official",
  configSchema: config,
  configExample: { categories: ["cs.AI", "cs.CL", "cs.LG"], announceTypes: ["new"], include: ["agent", "reasoning", "LLM"], maxItems: 120, weight: 0.25 },
  defaultPollSec: 6 * 3600,
  async run(ctx) {
    const c = ctx.config;
    const url = `https://rss.arxiv.org/rss/${c.categories.join("+")}`;
    const res = await ctx.http.request(url, { conditional: true, timeoutMs: 45_000, maxBytes: 25_000_000 });
    if (res.notModified) return { notModified: true };
    const feed = parseFeed(res.text, url);
    const seen = new Set<string>();
    const items: IngestItem[] = [];
    for (const e of feed.entries) {
      if (items.length >= c.maxItems) break;
      const type = e.extra["arxiv:announce_type"] ?? "new";
      if (!c.announceTypes.includes(type as (typeof c.announceTypes)[number])) continue;
      const id = /abs\/([^\s?#]+?)(v\d+)?$/.exec(e.link ?? "")?.[1] ?? e.id.replace(/^oai:arXiv\.org:/, "").replace(/v\d+$/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      const abstract = e.summary.replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s*/i, "").replace(/^Abstract:\s*/i, "");
      if (!passesKeywords(`${e.title} ${abstract}`, c.include, c.exclude)) continue;
      items.push({
        externalId: id,
        url: `https://arxiv.org/abs/${id}`,
        title: e.title,
        summary: clip(abstract.replace(/\s+/g, " "), 700),
        lang: "en",
        publishedAt: e.published ?? null,
        beatGuess: "ai",
        weight: c.weight,
        payload: {
          arxivId: id,
          announceType: type,
          categories: e.categories.slice(0, 6),
          authors: (e.authors[0] ?? "").split(/,\s*/).filter(Boolean).slice(0, 8),
          license: e.extra["dc:rights"],
        },
      });
    }
    return { items, note: `${items.length}/${feed.entries.length}` };
  },
});
