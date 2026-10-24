"use server";

import { count, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { deskLessons, siteSettings } from "@/db/schema";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { cleanLessonText, cleanScope, LESSON_CHARS, MAX_LESSONS } from "../desk/lessons";
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

/* ───────────────────────── 편집 노트 ───────────────────────── */

const lessonInput = z.object({
  id: z.uuid().optional(),
  text: z.string().trim().min(5, "노트가 너무 짧습니다").max(LESSON_CHARS, `${LESSON_CHARS}자 이내로 써 주세요`),
  scope: z.string().trim().max(100).default("all"),
});

/** An editor's own note (pinned: it never fades) or a fix to an existing one. */
export async function saveLesson(input: { id?: string; text: string; scope?: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = lessonInput.parse(input);
    const text = cleanLessonText(p.text);
    const now = new Date();
    if (p.id) {
      const was = await db.query.deskLessons.findFirst({ where: eq(deskLessons.id, p.id) });
      if (!was) return fail(new Error("이미 없어진 노트입니다. 새로고침하세요."));
      await db
        .update(deskLessons)
        .set({ text, scope: cleanScope(p.scope, was.scope.startsWith("source:") ? [was.scope.slice(7)] : []), updatedAt: now })
        .where(eq(deskLessons.id, p.id));
    } else {
      const [{ n }] = await db.select({ n: count() }).from(deskLessons);
      if (n >= MAX_LESSONS) return fail(new Error(`편집 노트는 ${MAX_LESSONS}개까지입니다. 하나를 지운 뒤 추가하세요.`));
      await db.insert(deskLessons).values({ text, scope: cleanScope(p.scope), pinned: true, origin: "editor", hits: 1, lastSeenAt: now });
    }
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 ${p.id ? "수정" : "추가"}: ${text}`.slice(0, 300) });
    refresh();
    return ok(p.id ? "노트를 고쳤습니다." : "노트를 추가했습니다. 직접 쓴 노트는 고정되어 사라지지 않습니다.");
  } catch (e) {
    return fail(e);
  }
}

/** A pinned note never fades; an unpinned one fades without new evidence. */
export async function setLessonPinned(input: { id: string; pinned: boolean }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id: z.uuid(), pinned: z.boolean() }).parse(input);
    // unpinning starts the clock again, so a note is not retired the moment it is let go
    await db
      .update(deskLessons)
      .set({ pinned: p.pinned, updatedAt: new Date(), ...(p.pinned ? {} : { lastSeenAt: new Date() }) })
      .where(eq(deskLessons.id, p.id));
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 ${p.pinned ? "고정" : "고정 해제"}` });
    refresh();
    return ok(p.pinned ? "고정했습니다." : "고정을 풀었습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLesson(input: { id: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id: z.uuid() }).parse(input);
    const [gone] = await db.delete(deskLessons).where(eq(deskLessons.id, p.id)).returning({ text: deskLessons.text });
    if (gone) await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 삭제: ${gone.text}`.slice(0, 300) });
    refresh();
    return ok("노트를 지웠습니다.");
  } catch (e) {
    return fail(e);
  }
}

/** Ask the worker to read the waiting edits now. */
export async function requestLessonReview(): Promise<ActionState> {
  try {
    const me = await requireStaff();
    await patchDeskState(db, { lessonsRequestedAt: new Date().toISOString() });
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: "편집 노트 정리 요청" });
    refresh();
    return ok("요청했습니다. 1시간 안에 쌓인 수정 사례를 읽고 노트를 정리합니다.");
  } catch (e) {
    return fail(e);
  }
}
