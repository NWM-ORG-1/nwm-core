import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { lessonsFor, loadLessons } from "../desk/lessons";
import { loadDeskSettings } from "../desk/settings";
import { createClaudeGenerator } from "./claude";
import { draftGeneratorConfig } from "./config";
import { dbLedger } from "./ledger";
import { mockGenerator } from "./mock";
import type { DraftGenerator } from "./types";
import { VISION_MODEL } from "./visual";

let claude: DraftGenerator | null = null;

function claudeFromEnv(): DraftGenerator {
  const cfg = draftGeneratorConfig();
  // one retry: an editor is waiting, and a second failure falls back to the mock draft
  const client = cfg.hasKey ? new Anthropic({ maxRetries: 1, timeout: 120_000 }) : null;
  return createClaudeGenerator({
    create: client ? (body) => client.messages.create(body) : null,
    model: cfg.model,
    assistModel: cfg.assistModel,
    effort: cfg.effort,
    budgetUsd: cfg.budgetUsd,
    ledger: dbLedger(db),
    lessons: async (ctx) => lessonsFor(await loadLessons(db), ctx, new Date()),
    // the same 사진 재가공 switch as the AI desk
    visuals: async () => ({ model: VISION_MODEL, photos: (await loadDeskSettings(db)).imageRedraw }),
  });
}

export function getGenerator(): DraftGenerator {
  switch (draftGeneratorConfig().kind) {
    case "claude":
      return (claude ??= claudeFromEnv());
    default:
      return mockGenerator;
  }
}

export type { AssistAction, AssistResult, GenItem, GeneratedDraft } from "./types";
