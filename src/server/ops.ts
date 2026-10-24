import "server-only";
import { count, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { deskLessons, siteSettings } from "@/db/schema";
import { logActivity } from "./activity";
import type { StaffRow } from "./auth";
import { cleanLessonText, cleanScope, MAX_LESSONS } from "./desk/lessons";
import { DESK_SETTINGS_KEY, deskSettingsSchema, loadDeskSettings, patchDeskState, type DeskSettings } from "./desk/settings";
import { NewsroomError } from "./newsroom";

/**
 * Newsroom switches shared by the Server Actions and the Telegram bot: pause
 * collection, the AI desk's settings and run requests, and the 편집 노트.
 * Callers authenticate the editor (`me`); every change is in the activity log.
 */

export type Via = "telegram";
const viaMeta = (via?: Via) => (via ? { meta: { via } } : {});

/** The worker's kill switch: no collection and no periodic jobs (the AI desk included) until resumed. */
export async function setIngestPausedAs(db: DB, me: StaffRow, paused: boolean, via?: Via): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: "ingest", value: { paused } })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: { paused }, updatedAt: new Date() } });
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "ingest", summary: paused ? "전체 수집 일시정지" : "전체 수집 재개", ...viaMeta(via) });
}

export async function ingestPaused(db: Pick<DB, "query">): Promise<boolean> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, "ingest") });
  return Boolean((row?.value as { paused?: boolean } | undefined)?.paused);
}

/** Saves the AI desk's settings: the whole form from the newsroom, a field or two from the bot. */
export async function saveDeskSettingsAs(db: DB, me: StaffRow, patch: Partial<DeskSettings>, via?: Via): Promise<DeskSettings> {
  return db.transaction(async (tx) => {
    const prev = await loadDeskSettings(tx);
    const next = deskSettingsSchema.parse({ ...prev, ...patch });
    await tx
      .insert(siteSettings)
      .values({ key: DESK_SETTINGS_KEY, value: next })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } });
    const changed = (Object.keys(next) as Array<keyof DeskSettings>).filter((k) => next[k] !== prev[k]);
    await logActivity(tx, {
      actorId: me.id,
      kind: "settings",
      entityType: "settings",
      entityId: DESK_SETTINGS_KEY,
      summary: `AI 데스크 설정: ${next.enabled ? "켜짐" : "꺼짐"} · 하루 ${next.dailyDrafts}건 · ${next.cadenceMin}분마다 · 월 $${next.monthlyBudgetUsd}`,
      meta: { changed, ...next, ...(via ? { via } : {}) },
    });
    return next;
  });
}

/** Ask the worker for a desk pass now (it checks every minute; it runs even when the desk is off). */
export async function requestDeskRunAs(db: DB, me: StaffRow, via?: Via): Promise<void> {
  await patchDeskState(db, { runRequestedAt: new Date().toISOString() });
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: DESK_SETTINGS_KEY, summary: "AI 데스크 지금 실행 요청", ...viaMeta(via) });
}

/* ───────────────────────── 편집 노트 ───────────────────────── */

/** An editor's own note: pinned, so it never fades. */
export async function addLessonAs(db: DB, me: StaffRow, p: { text: string; scope?: string }, via?: Via): Promise<{ text: string; scope: string; total: number }> {
  const text = cleanLessonText(p.text);
  if (text.length < 5) throw new NewsroomError("노트가 너무 짧습니다.", "invalid");
  const [{ n }] = await db.select({ n: count() }).from(deskLessons);
  if (n >= MAX_LESSONS) throw new NewsroomError(`편집 노트는 ${MAX_LESSONS}개까지입니다. 하나를 지운 뒤 추가하세요.`, "state");
  const scope = cleanScope(p.scope ?? "all");
  await db.insert(deskLessons).values({ text, scope, pinned: true, origin: "editor", hits: 1, lastSeenAt: new Date() });
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 추가: ${text}`.slice(0, 300), ...viaMeta(via) });
  return { text, scope, total: n + 1 };
}

export async function updateLessonAs(db: DB, me: StaffRow, p: { id: string; text: string; scope?: string }, via?: Via): Promise<void> {
  const was = await db.query.deskLessons.findFirst({ where: eq(deskLessons.id, p.id) });
  if (!was) throw new NewsroomError("이미 없어진 노트입니다. 새로고침하세요.", "not_found");
  const text = cleanLessonText(p.text);
  if (text.length < 5) throw new NewsroomError("노트가 너무 짧습니다.", "invalid");
  const scope = cleanScope(p.scope ?? was.scope, was.scope.startsWith("source:") ? [was.scope.slice(7)] : []);
  await db.update(deskLessons).set({ text, scope, updatedAt: new Date() }).where(eq(deskLessons.id, p.id));
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 수정: ${text}`.slice(0, 300), ...viaMeta(via) });
}

/** Unpinning starts the clock again, so a note is not retired the moment it is let go. */
export async function setLessonPinnedAs(db: DB, me: StaffRow, id: string, pinned: boolean, via?: Via): Promise<void> {
  const now = new Date();
  const [hit] = await db
    .update(deskLessons)
    .set({ pinned, updatedAt: now, ...(pinned ? {} : { lastSeenAt: now }) })
    .where(eq(deskLessons.id, id))
    .returning({ id: deskLessons.id });
  if (!hit) throw new NewsroomError("이미 없어진 노트입니다.", "not_found");
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 ${pinned ? "고정" : "고정 해제"}`, ...viaMeta(via) });
}

export async function deleteLessonAs(db: DB, me: StaffRow, id: string, via?: Via): Promise<void> {
  const [gone] = await db.delete(deskLessons).where(eq(deskLessons.id, id)).returning({ text: deskLessons.text });
  if (gone) await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: `편집 노트 삭제: ${gone.text}`.slice(0, 300), ...viaMeta(via) });
}

export async function requestLessonReviewAs(db: DB, me: StaffRow, via?: Via): Promise<void> {
  await patchDeskState(db, { lessonsRequestedAt: new Date().toISOString() });
  await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "desk.lessons", summary: "편집 노트 정리 요청", ...viaMeta(via) });
}
