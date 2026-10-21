import type { Block, SentimentSnapshot, SourceRef } from "@/lib/content/blocks";
import type { AiInvolvement, Beat } from "@/db/schema";

/**
 * Serializable shapes handed to pages and client components. Dates are ISO
 * strings. Keep cards small: they are embedded in RSC payloads for lists.
 */

export interface ArticleCard {
  id: string;
  slug: string;
  beat: Beat;
  title: string;
  dek: string;
  aiInvolvement: AiInvolvement;
  publishedAt: string;
  readSeconds: number;
  isBreaking: boolean;
  featured: boolean;
  storyId: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  tags: string[];
  tickers: string[];
  /** views over the last 7 days */
  views: number;
  sentimentScore: number | null;
  isSample: boolean;
}

export interface PersonRef {
  name: string;
  slug: string;
  title: string;
}

export interface CorrectionDTO {
  kind: "correction" | "clarification" | "update";
  note: string;
  publishedAt: string;
  revision: number;
}

export interface StoryRef {
  id: string;
  slug: string;
  title: string;
  status: "developing" | "settled";
  articleCount: number;
}

export interface ArticleFull extends ArticleCard {
  blocks: Block[];
  sources: SourceRef[];
  sentiment: SentimentSnapshot | null;
  byline: string;
  editor: PersonRef | null;
  author: PersonRef | null;
  updatedAt: string;
  revision: number;
  corrections: CorrectionDTO[];
  story: StoryRef | null;
}

export interface StoryDTO extends StoryRef {
  beat: Beat;
  summary: string;
  lastPublishedAt: string | null;
}

export interface TimelineEntry {
  slug: string;
  title: string;
  dek: string;
  publishedAt: string;
  aiInvolvement: AiInvolvement;
}

export interface QuoteDTO {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  spark: number[];
}

export interface SentimentPoint {
  at: string;
  score: number;
}

export interface SentimentDTO {
  scopeKey: string;
  label: string;
  score: number;
  change24h: number;
  bullish: number;
  bearish: number;
  volume: number;
  sources: SentimentSnapshot["sources"];
  keywords: string[];
  history: SentimentPoint[];
  /** false = seeded sample data */
  live: boolean;
  /** time of the latest reading */
  at: string;
  /** 0–1, null for samples */
  confidence: number | null;
}

/** Compact search record: [slug, title, dek(≤60), beat, publishedEpochMinutes] */
export type SearchRecord = [string, string, string, Beat, number];

/** /api/pulse payload — the only live data on public pages. */
export interface Pulse {
  at: string;
  latest: Array<{ s: string; t: string; b: Beat; p: string }>;
  /** src: provider id for the credit line ("binance", "upbit", "ecb", …; "mock" for samples) */
  quotes: Array<{ s: string; n: string; p: number; c: number; cur: string; src: string }>;
  senti: { score: number; ch: number } | null;
}
