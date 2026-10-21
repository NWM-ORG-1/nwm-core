import { z } from "zod";
import { clip, parseDate } from "../../text";
import { defineAdapter, type IngestItem } from "../../types";

const config = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  minUpvotes: z.number().int().min(0).default(0),
});

interface HfPaper {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    ai_summary?: string;
    upvotes?: number;
    publishedAt?: string;
    submittedOnDailyAt?: string;
    authors?: Array<{ name?: string }>;
    githubRepo?: string;
  };
  title?: string;
  publishedAt?: string;
  numComments?: number;
  organization?: { fullname?: string; name?: string };
}

/** Hugging Face Daily Papers — the community's pick of the day's AI papers. */
export const hfPapersAdapter = defineAdapter({
  key: "hf.papers",
  label: "Hugging Face Daily Papers",
  description: "커뮤니티가 고른 그날의 AI 논문(평일 20여 편). 추천 수가 오르면 점수도 함께 올라갑니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: { limit: 50, minUpvotes: 0 },
  defaultPollSec: 3600,
  async run(ctx) {
    const c = ctx.config;
    const list = await ctx.http.json<HfPaper[]>(`https://huggingface.co/api/daily_papers?limit=${c.limit}`, { timeoutMs: 30_000 });
    if (!Array.isArray(list)) throw new Error("unexpected daily_papers response");
    const items: IngestItem[] = [];
    for (const row of list) {
      const p = row.paper ?? {};
      const id = p.id;
      const title = p.title ?? row.title;
      if (!id || !title) continue;
      const upvotes = p.upvotes ?? 0;
      if (upvotes < c.minUpvotes) continue;
      items.push({
        externalId: id,
        url: `https://huggingface.co/papers/${id}`,
        title,
        summary: clip((p.ai_summary || p.summary || "").replace(/\s+/g, " "), 700),
        lang: "en",
        // the day it was featured, so the inbox shows it as fresh
        publishedAt: parseDate(p.submittedOnDailyAt ?? row.publishedAt ?? p.publishedAt) ?? null,
        beatGuess: "ai",
        weight: Math.min(1, 0.3 + Math.log10(1 + upvotes) / 3),
        payload: {
          arxiv: `https://arxiv.org/abs/${id}`,
          upvotes,
          comments: row.numComments ?? 0,
          org: row.organization?.fullname ?? row.organization?.name,
          authors: (p.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 8),
          ...(p.githubRepo ? { github: p.githubRepo } : {}),
        },
      });
    }
    return { items, note: `${items.length} papers` };
  },
});
