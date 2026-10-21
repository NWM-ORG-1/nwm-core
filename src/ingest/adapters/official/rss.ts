import { z } from "zod";
import { passesKeywords } from "../../classify";
import { entrySummary, parseFeed } from "../../feed";
import { defineAdapter, ConfigError, type IngestItem } from "../../types";

const config = z.object({
  /** defaults to the source URL */
  url: z.url().optional(),
  /** some boards only answer a POST (산업통상부 RSS form) */
  method: z.enum(["GET", "POST"]).default("GET"),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  /** words that raise the inbox score */
  boost: z.array(z.string().min(1)).max(40).optional(),
  maxItems: z.number().int().min(1).max(200).default(40),
  maxAgeDays: z.number().int().min(1).max(90).default(7),
  summaryChars: z.number().int().min(0).max(2000).default(600),
  weight: z.number().min(0).max(1).default(0.4),
  encoding: z.string().max(20).optional(),
});

/** Generic RSS 2.0 / Atom / RDF feed — ministries, central banks, company blogs, GitHub releases. */
export const rssAdapter = defineAdapter({
  key: "rss",
  label: "RSS·Atom 피드",
  description: "표준 RSS/Atom 피드. 정부·기관 보도자료, 기업 블로그, GitHub releases.atom 등. ETag/Last-Modified로 변경분만 받습니다.",
  kind: "rss",
  group: "official",
  configSchema: config,
  configExample: { maxItems: 40, maxAgeDays: 7, include: [], exclude: [], boost: [] },
  defaultPollSec: 600,
  async run(ctx) {
    const c = ctx.config;
    const url = c.url ?? ctx.source.url;
    if (!url) throw new ConfigError("피드 URL이 없습니다 (소스 URL 또는 config.url)");
    const res = await ctx.http.request(url, {
      method: c.method,
      conditional: c.method === "GET",
      encoding: c.encoding,
      timeoutMs: 30_000,
      maxBytes: 12_000_000,
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    });
    if (res.notModified) return { notModified: true, note: "304" };
    const feed = parseFeed(res.text, res.url);
    const cutoff = ctx.now.getTime() - c.maxAgeDays * 86_400_000;
    const items: IngestItem[] = [];
    for (const e of feed.entries) {
      if (items.length >= c.maxItems) break;
      if (!e.title) continue;
      if (e.published && e.published.getTime() < cutoff) continue;
      if (!passesKeywords(`${e.title} ${e.summary}`, c.include, c.exclude)) continue;
      items.push({
        externalId: e.id,
        url: e.link,
        title: e.title,
        summary: entrySummary(e, c.summaryChars),
        publishedAt: e.published ?? e.updated ?? null,
        weight: c.weight,
        payload: {
          ...(e.authors.length ? { authors: e.authors.slice(0, 6) } : {}),
          ...(e.categories.length ? { categories: e.categories.slice(0, 8) } : {}),
          feed: feed.title,
        },
      });
    }
    return { items, note: `${feed.title || feed.format}: ${items.length}/${feed.entries.length}` };
  },
});
