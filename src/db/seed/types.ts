import type { Block, Draft, SentimentSnapshot, SourceRef } from "@/lib/content/blocks";
import type { AiInvolvement, Beat, CandidateMode, CandidateStatus, CheckId, SourceKind, SourceStatus } from "../schema";

/**
 * Sample (demo) content. Every record is written with `is_sample = true` and
 * relative times (`ago` = minutes before the moment the seed runs), so the demo
 * always looks live and `npm run db:purge-samples` removes all of it.
 *
 * Content rules: companies with concrete events are fictional (한빛반도체, 누리AI랩 …);
 * real indices/coins/institutions only in generic, analytic framing; no real people.
 */

/** Sample staff logins (fictional people). */
export type StaffKey = "desk-ai" | "desk-market" | "desk-data" | "desk-sentiment";

export interface SeedStaff {
  login: StaffKey;
  name: string;
  slug: string;
  title: string;
  bio: string;
}

export interface SeedStory {
  key: string;
  slug: string;
  beat: Beat;
  title: string;
  summary: string;
  status: "developing" | "settled";
}

export interface SeedCorrection {
  /** minutes after publication */
  after: number;
  kind: "correction" | "clarification" | "update";
  /** public note shown under the article */
  note: string;
  /** the original (pre-correction) title/dek, stored as revision 1 */
  before?: { title?: string; dek?: string };
}

export interface SeedArticle {
  /** stable key, unique across all sample articles (kebab-case, english) */
  key: string;
  beat: Beat;
  /** minutes before seed time */
  ago: number;
  /** SeedStory.key */
  story?: string;
  title: string;
  /** the "signal": 1–2 sentences */
  dek: string;
  blocks: Block[];
  tags: string[];
  tickers: string[];
  sources: SourceRef[];
  sentiment?: SentimentSnapshot;
  ai: AiInvolvement;
  /** required unless ai is "auto" or "human" */
  editor?: StaffKey;
  author?: StaffKey;
  byline: string;
  breaking?: boolean;
  unpublished?: boolean;
  /** approximate total views over the last 7 days */
  views?: number;
  corrections?: SeedCorrection[];
}

export interface SeedExperiment {
  code: "H1" | "H2" | "H3" | "H4";
  name: string;
  hypothesis: string;
  primaryMetric: string;
  colorSlot: 1 | 2 | 3 | 4;
}

export interface SeedSource {
  slug: string;
  name: string;
  kind: SourceKind;
  url?: string;
  beats: Beat[];
  lang: "ko" | "en";
  status: SourceStatus;
  experiment: SeedExperiment["code"];
  adapter: string;
  pollIntervalSec: number;
  trustTier: 1 | 2 | 3 | 4;
  signalOnly?: boolean;
  license: {
    commercialOk: boolean | null;
    redistributionOk: boolean | null;
    verbatimOk: boolean | null;
    attribution?: string;
    retentionDays?: number;
    termsUrl?: string;
    /** false → shows as "라이선스 미검토" */
    reviewed: boolean;
  };
  /** minutes since last fetch */
  lastAgo: number;
  lastError?: string;
}

export interface SeedFeedItem {
  /** stable key, also used as external_id */
  key: string;
  source: string; // SeedSource.slug
  ago: number;
  title: string;
  summary: string;
  url?: string;
  lang: "ko" | "en";
  beat: Beat;
  score: number; // 0–100
  entities: string[];
  status: "new" | "promoted" | "dismissed";
  dismissedReason?: string;
  payload?: Record<string, unknown>;
}

export interface SeedCandidate {
  key: string;
  status: CandidateStatus;
  mode: CandidateMode;
  beat: Beat;
  priority: number;
  /** minutes since creation */
  ago: number;
  idea?: string;
  /** SeedFeedItem.key[]; first = primary */
  items: string[];
  story?: string;
  draft: Draft;
  aiNote?: string;
  assignee?: StaffKey;
  /** minutes from now, status "scheduled" only */
  scheduledIn?: number;
  /** checks that already pass */
  passed?: CheckId[];
  /** SeedArticle.key, status "published" only */
  article?: string;
}
