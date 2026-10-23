"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { savePlaybookVersion } from "../desk/playbook";
import { DESK_SETTINGS_KEY, deskSettingsSchema, mergeDeskSettings, patchDeskState } from "../desk/settings";
import { fail, ok, type ActionState } from "./result";

/** AI desk settings: on/off, drafts a day, cadence, budget, bar, exploration, models, weekly review. */
export async function saveDeskSettings(input: unknown): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const next = deskSettingsSchema.parse(input);
    await db.transaction(async (tx) => {
      const row = await tx.query.siteSettings.findFirst({ where: eq(siteSettings.key, DESK_SETTINGS_KEY) });
      const prev = mergeDeskSettings(row?.value);
      await tx
        .insert(siteSettings)
        .values({ key: DESK_SETTINGS_KEY, value: next })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } });
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== prev[k]);
      await logActivity(tx, {
        actorId: me.id,
        kind: "settings",
        entityType: "settings",
        entityId: DESK_SETTINGS_KEY,
        summary: `AI 데스크 설정: ${next.enabled ? "켜짐" : "꺼짐"} · 하루 ${next.dailyDrafts}건 · ${next.cadenceMin}분마다 · 월 $${next.monthlyBudgetUsd}`,
        meta: { changed, ...next },
      });
    });
    refresh();
    return ok(next.enabled ? "저장했습니다. 다음 실행부터 반영됩니다." : "저장했습니다. AI 데스크가 쉽니다.");
  } catch (e) {
    return fail(e);
  }
}

/** Ask the worker for a pass now (it checks every minute). */
export async function requestDeskRun(): Promise<ActionState> {
  try {
    const me = await requireStaff();
    await patchDeskState(db, { runRequestedAt: new Date().toISOString() });
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: DESK_SETTINGS_KEY, summary: "AI 데스크 지금 실행 요청" });
    refresh();
    return ok("요청했습니다. 워커가 1분 안에 시작합니다.");
  } catch (e) {
    return fail(e);
  }
}

const playbookInput = z.object({
  body: z
    .string()
    .trim()
    .min(10, "지침이 너무 짧습니다")
    .max(3000, "3,000자 이내로 써 주세요"),
  notes: z.string().trim().max(500).default(""),
});

/** An editor's version of the editorial guide; the newest version is used from the next pass. */
export async function savePlaybook(input: { body: string; notes?: string }): Promise<ActionState<{ version: number }>> {
  try {
    const me = await requireStaff();
    const p = playbookInput.parse(input);
    const version = await db.transaction(async (tx) => {
      const v = await savePlaybookVersion(tx, { body: p.body, source: "editor", notes: p.notes || "편집자 수정", createdById: me.id });
      await logActivity(tx, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.playbook", summary: `AI 데스크 편집 지침 v${v} 저장`, meta: { version: v } });
      return v;
    });
    refresh();
    return ok(`지침 v${version}을 저장했습니다. 다음 실행부터 씁니다.`, { version });
  } catch (e) {
    return fail(e);
  }
}

/** Ask the worker to review the guide against reader response and editor calls now. */
export async function requestReflection(): Promise<ActionState> {
  try {
    const me = await requireStaff();
    await patchDeskState(db, { reflectRequestedAt: new Date().toISOString() });
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.playbook", summary: "AI 데스크 지침 검토 요청" });
    refresh();
    return ok("요청했습니다. 10분 안에 검토하고, 바꿀 점이 있으면 새 버전으로 저장합니다.");
  } catch (e) {
    return fail(e);
  }
}
