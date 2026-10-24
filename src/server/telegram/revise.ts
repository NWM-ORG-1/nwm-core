import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import { reviseDraft } from "../generator/claude";
import { draftGeneratorConfig } from "../generator/config";
import { aiMonthSpendUsd, dbLedger } from "../generator/ledger";
import type { Revise } from "./bot";

let client: Anthropic | null = null;

/** AI edits from the bot, on the editor's assist model and within the newsroom's monthly cap; null without a key. */
export function botReviser(): Revise | null {
  const cfg = draftGeneratorConfig();
  if (!cfg.hasKey) return null;
  const c = (client ??= new Anthropic({ maxRetries: 1, timeout: 120_000 }));
  return async (input) => {
    if ((await aiMonthSpendUsd(db)) >= cfg.budgetUsd) throw new Error(`이번 달 AI 한도($${cfg.budgetUsd})를 다 썼습니다`);
    const r = await reviseDraft({ create: (body) => c.messages.create(body), ledger: dbLedger(db), model: cfg.assistModel, effort: cfg.effort }, input);
    return r.draft;
  };
}
