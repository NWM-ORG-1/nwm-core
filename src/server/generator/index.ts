import { mockGenerator } from "./mock";
import type { DraftGenerator } from "./types";

export function getGenerator(): DraftGenerator {
  switch (process.env.DRAFT_GENERATOR ?? "mock") {
    // case "claude": return claudeGenerator  — phase 3
    default:
      return mockGenerator;
  }
}

export type { AssistAction, AssistResult, GenItem, GeneratedDraft } from "./types";
