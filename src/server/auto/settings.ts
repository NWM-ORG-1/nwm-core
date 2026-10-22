import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { DATA_TEMPLATES, type DataTemplateId } from "../generator/data-templates";

/**
 * How each automatic article type runs, set in the newsroom (자동 기사):
 *  off    — never made by the worker
 *  review — made as a candidate in 검토, an editor publishes it
 *  auto   — made already scheduled for now; the publishing scheduler puts it
 *           out within a minute, or sends it back to 검토 if a check fails
 */

export const AUTO_SETTINGS_KEY = "auto.articles";

export type AutoMode = "off" | "review" | "auto";
export type AutoTemplateId = Exclude<DataTemplateId, "market_close">;

export const AUTO_TEMPLATE_IDS = (Object.keys(DATA_TEMPLATES) as DataTemplateId[]).filter((id): id is AutoTemplateId => DATA_TEMPLATES[id].trigger.kind !== "manual");

export const autoTemplateSettingSchema = z.object({
  mode: z.enum(["off", "review", "auto"]),
  /** daily types: "HH:MM" in KST */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  /** sharp moves: % change within an hour */
  threshold: z.number().min(1).max(30).optional(),
});
export type AutoTemplateSetting = z.infer<typeof autoTemplateSettingSchema>;
export type AutoSettings = Record<AutoTemplateId, AutoTemplateSetting>;

export const AUTO_DEFAULTS: AutoSettings = {
  crypto_daily: { mode: "review", time: "08:30" },
  sentiment_daily: { mode: "off", time: "21:00" },
  crypto_move: { mode: "review", threshold: 3 },
  exchange_listed: { mode: "review" },
  exchange_delisted: { mode: "review" },
  exchange_warning: { mode: "review" },
  exchange_warning_lifted: { mode: "review" },
};

/** Stored values over the defaults; anything malformed falls back to the default. */
export function mergeAutoSettings(stored: unknown): AutoSettings {
  const out = structuredClone(AUTO_DEFAULTS);
  if (!stored || typeof stored !== "object") return out;
  for (const id of AUTO_TEMPLATE_IDS) {
    const parsed = autoTemplateSettingSchema.partial().safeParse((stored as Record<string, unknown>)[id]);
    if (parsed.success) out[id] = { ...out[id], ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) };
  }
  return out;
}

export async function loadAutoSettings(db: Pick<DB, "query">): Promise<AutoSettings> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, AUTO_SETTINGS_KEY) });
  return mergeAutoSettings(row?.value);
}

/**
 * A daily type is due from its time (KST) until `graceMin` later, so a worker
 * that was down for most of the day does not put out a stale morning brief.
 */
export function dailySlot(now: Date, time: string, graceMin = 120): { due: boolean; ymd: string; at: Date } {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  const ymd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  const [h, m] = time.split(":").map(Number);
  const at = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), h, m) - 9 * 3_600_000);
  const late = now.getTime() - at.getTime();
  return { due: late >= 0 && late <= graceMin * 60_000, ymd, at };
}
