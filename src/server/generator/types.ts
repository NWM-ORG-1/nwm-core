import type { Block, Draft } from "@/lib/content/blocks";
import type { Beat, CandidateMode, GeneratorMeta } from "@/db/schema";

/** What a generator sees of a feed item. */
export interface GenItem {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: string;
  trustTier: number;
  signalOnly: boolean;
  lang: string;
  entities: string[];
  payload: Record<string, unknown>;
  url: string | null;
  publishedAt?: Date | null;
  /** a post from a channel or account the newsroom follows (Telegram, X), not another outlet's article */
  social?: boolean;
}

export interface GeneratedDraft {
  draft: Draft;
  aiNote: string | null;
  meta: GeneratorMeta;
  /** material we computed for this draft (a price check): saved with the candidate as its source */
  derived?: GenItem[];
}

export type AssistAction = "headlines" | "tighten" | "why" | "numbers" | "next";

/** What the editor's AI tab says about who writes suggestions. */
export interface AiStatus {
  /** Claude is configured and has a key */
  live: boolean;
  kind: "mock" | "claude";
  /** model labels, e.g. "Claude Opus 5.5" */
  draftModel: string;
  assistModel: string;
}

export type AssistResult =
  | { action: "headlines"; titles: string[]; note: string }
  | { action: "tighten"; dek: string; blocks: Block[]; note: string }
  | { action: "why" | "numbers" | "next"; block: Block; note: string };

/**
 * Draft generator seam. Phase 1 ships a deterministic mock; phase 3 adds a
 * Claude-backed implementation behind the same interface (DRAFT_GENERATOR=claude).
 */
export interface DraftGenerator {
  id: string;
  version: string;
  draftFromItems(input: { items: GenItem[]; beat: Beat; mode: CandidateMode; idea?: string | null }): Promise<GeneratedDraft>;
  assist(input: { draft: Draft; beat: Beat; items: GenItem[]; action: AssistAction }): Promise<AssistResult>;
}
