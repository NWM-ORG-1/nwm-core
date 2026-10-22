"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { AUTO_SETTINGS_KEY, AUTO_TEMPLATE_IDS, autoTemplateSettingSchema, mergeAutoSettings, type AutoTemplateId } from "../auto/settings";
import { DATA_TEMPLATES } from "../generator/data-templates";
import { fail, ok, type ActionState } from "./result";

const MODE_LABEL = { off: "끄기", review: "검토 후 발행", auto: "자동 발행" } as const;

/** One automatic article type: off / editor review / automatic, plus its time or threshold. */
export async function saveAutoSetting(input: { template: string; mode: string; time?: string; threshold?: number }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const template = z.enum(AUTO_TEMPLATE_IDS as [AutoTemplateId, ...AutoTemplateId[]]).parse(input.template);
    const setting = autoTemplateSettingSchema.parse({ mode: input.mode, time: input.time || undefined, threshold: input.threshold });
    await db.transaction(async (tx) => {
      const row = await tx.query.siteSettings.findFirst({ where: eq(siteSettings.key, AUTO_SETTINGS_KEY) });
      const value = { ...mergeAutoSettings(row?.value), [template]: setting };
      await tx
        .insert(siteSettings)
        .values({ key: AUTO_SETTINGS_KEY, value })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
      const extra = setting.time ? ` · ${setting.time}` : setting.threshold ? ` · ±${setting.threshold}%` : "";
      await logActivity(tx, {
        actorId: me.id,
        kind: "settings",
        entityType: "settings",
        entityId: AUTO_SETTINGS_KEY,
        summary: `자동 기사 ${DATA_TEMPLATES[template].label}: ${MODE_LABEL[setting.mode]}${extra}`,
        meta: { template, ...setting },
      });
    });
    refresh();
    return ok(setting.mode === "auto" ? "저장했습니다. 다음 기사부터 검토 없이 발행됩니다." : "저장했습니다. 워커가 1분 안에 반영합니다.");
  } catch (e) {
    return fail(e);
  }
}
