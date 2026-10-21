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
}

export interface GeneratedDraft {
  draft: Draft;
  aiNote: string | null;
  meta: GeneratorMeta;
}

export type AssistAction = "headlines" | "tighten" | "why" | "numbers" | "next";

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
