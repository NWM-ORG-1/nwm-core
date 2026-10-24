import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { siteSettings } from "@/db/schema";

/**
 * AI desk settings (뉴스룸 → AI 데스크). Every `cadenceMin` minutes the desk
 * reads new feed items, groups them into stories and judges each one; the best
 * become drafts in 검토, at most `dailyDrafts` a day — as soon as they clear the
 * bar, or spread over 07–23 KST (`pacing`). Desk
 * calls stop for the month at `monthlyBudgetUsd`; the newsroom-wide
 * DRAFT_LLM_MONTHLY_USD cap applies on top.
 */

export const DESK_SETTINGS_KEY = "desk";
/** run / reflect requests from the newsroom, picked up by the worker */
export const DESK_STATE_KEY = "desk.state";
/** the learned snapshot (src/server/desk/learn.ts) */
export const DESK_MODEL_KEY = "desk.model";

export const DESK_CADENCES = [30, 60, 120, 240] as const;
export const DESK_TRIAGE_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export const DESK_DRAFT_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
/** immediate: draft as soon as a story clears the bar · spread: the day's drafts over 07–23 KST */
export const DESK_PACINGS = ["immediate", "spread"] as const;

export const deskSettingsSchema = z.object({
  enabled: z.boolean(),
  dailyDrafts: z.number().int().min(0).max(50),
  pacing: z.enum(DESK_PACINGS),
  cadenceMin: z
    .number()
    .int()
    .refine((n) => (DESK_CADENCES as readonly number[]).includes(n), "30·60·120·240분 중 하나"),
  monthlyBudgetUsd: z.number().min(0).max(2000),
  /** a story needs this final score (0–100) to be drafted */
  minScore: z.number().int().min(0).max(100),
  /** share of the day's drafts that may go to little-tried topics just under the bar */
  exploreShare: z.number().min(0).max(0.5),
  triageModel: z.enum(DESK_TRIAGE_MODELS),
  draftModel: z.enum(DESK_DRAFT_MODELS),
  /** the weekly review may rewrite the editorial guide by itself */
  playbookAuto: z.boolean(),
});
export type DeskSettings = z.infer<typeof deskSettingsSchema>;

export const DESK_DEFAULTS: DeskSettings = {
  enabled: true,
  dailyDrafts: 10,
  pacing: "immediate",
  cadenceMin: 60,
  monthlyBudgetUsd: 40,
  minScore: 60,
  exploreShare: 0.2,
  triageModel: "claude-haiku-5-5",
  draftModel: "claude-opus-5-5",
  playbookAuto: true,
};

/** Stored values over the defaults; a malformed field falls back to its default. */
export function mergeDeskSettings(stored: unknown): DeskSettings {
  const out: DeskSettings = { ...DESK_DEFAULTS };
  if (!stored || typeof stored !== "object") return out;
  const shape = deskSettingsSchema.shape;
  for (const key of Object.keys(shape) as Array<keyof DeskSettings>) {
    const parsed = shape[key].safeParse((stored as Record<string, unknown>)[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

export async function loadDeskSettings(db: Pick<DB, "query">): Promise<DeskSettings> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, DESK_SETTINGS_KEY) });
  return mergeDeskSettings(row?.value);
}

export interface DeskState {
  /** the newsroom asked for a run now (ISO) */
  runRequestedAt?: string;
  /** the newsroom asked for a guide review now (ISO) */
  reflectRequestedAt?: string;
  /** the last guide review, whether or not it changed the guide (ISO) */
  reflectedAt?: string;
  /** the newsroom asked for the 편집 노트 to be brought up to date now (ISO) */
  lessonsRequestedAt?: string;
  /** the last 편집 노트 review (ISO) */
  lessonsAt?: string;
}

export async function loadDeskState(db: Pick<DB, "query">): Promise<DeskState> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, DESK_STATE_KEY) });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const iso = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : undefined);
  return {
    runRequestedAt: iso(v.runRequestedAt),
    reflectRequestedAt: iso(v.reflectRequestedAt),
    reflectedAt: iso(v.reflectedAt),
    lessonsRequestedAt: iso(v.lessonsRequestedAt),
    lessonsAt: iso(v.lessonsAt),
  };
}

/** Merged in the database, so the newsroom's requests and the worker's notes never overwrite each other. */
export async function patchDeskState(db: Pick<DB, "insert">, patch: DeskState): Promise<void> {
  const value = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await db
    .insert(siteSettings)
    .values({ key: DESK_STATE_KEY, value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`${siteSettings.value} || excluded.value`, updatedAt: new Date() } });
}
