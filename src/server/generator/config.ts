import { modelInfo, parseEffort, type Effort } from "@/lib/ai/models";
import type { AiStatus } from "./types";

/**
 * Draft generator settings, from the environment:
 *   DRAFT_GENERATOR        mock (default) | claude
 *   DRAFT_MODEL            Claude model for drafts (default claude-opus-5-5)
 *   DRAFT_ASSIST_MODEL     model for the editor's assist buttons (default: DRAFT_MODEL)
 *   DRAFT_EFFORT           low | medium | high | xhigh | max (default: the model's own)
 *   DRAFT_LLM_MONTHLY_USD  monthly cap across drafts and assists (default 50)
 * Without ANTHROPIC_API_KEY the Claude generator writes mock drafts and says so.
 */

export const DEFAULT_DRAFT_MODEL = "claude-opus-5-5";

export interface DraftGeneratorConfig {
  kind: "mock" | "claude";
  model: string;
  assistModel: string;
  effort: Effort | undefined;
  budgetUsd: number;
  hasKey: boolean;
  /** the model ids are not in the price table — costs are estimated at the highest known price */
  unknownModels: string[];
}

export function draftGeneratorConfig(env: Record<string, string | undefined> = process.env): DraftGeneratorConfig {
  const model = env.DRAFT_MODEL?.trim() || DEFAULT_DRAFT_MODEL;
  const assistModel = env.DRAFT_ASSIST_MODEL?.trim() || model;
  const budget = Number(env.DRAFT_LLM_MONTHLY_USD ?? 50);
  return {
    kind: env.DRAFT_GENERATOR?.trim() === "claude" ? "claude" : "mock",
    model,
    assistModel,
    effort: parseEffort(env.DRAFT_EFFORT),
    budgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : 50,
    hasKey: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    unknownModels: [...new Set([model, assistModel])].filter((m) => !modelInfo(m).known),
  };
}

export function aiStatus(cfg = draftGeneratorConfig()): AiStatus {
  return {
    live: cfg.kind === "claude" && cfg.hasKey,
    kind: cfg.kind,
    draftModel: modelInfo(cfg.model).label,
    assistModel: modelInfo(cfg.assistModel).label,
  };
}
