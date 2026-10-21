"use server";

import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { after } from "next/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { candidateItems, candidates, feedSources, marketQuotes, sentimentSnapshots, stories, type CheckResult } from "@/db/schema";
import { draftSchema, EMPTY_DRAFT, type Draft } from "@/lib/content/blocks";
import { dateKST, dateTimeKST } from "@/lib/format";
import { ASSIST_ACTION_LABEL, CANDIDATE_STATUS_LABEL } from "@/lib/labels";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { draftHash } from "../checks";
import { buildDataDraft, DATA_TEMPLATES, type DataTemplateId } from "../generator/data-templates";
import { getGenerator, type AssistResult } from "../generator";
import { cdnPurge, invalidateFromAction, refreshInBackground } from "../invalidate";
import { T } from "@/lib/cache-tags";
import {
  computeChecks,
  loadCandidateItems,
  NewsroomError,
  publishCandidate,
  toGenItem,
} from "../newsroom";
import { storySlugFrom } from "../slug";
import { fail, ok, type ActionState } from "./result";

const beat = z.enum(["ai", "crypto", "economy", "tech", "sentiment"]);
const id = z.uuid();

/** Feed adapters that supply each data template's tables (for experiment attribution). */
const TEMPLATE_ADAPTERS: Record<DataTemplateId, string[]> = {
  crypto_daily: ["market.ws", "market.api", "onchain.api"],
  market_close: ["market.ws", "market.api"],
  sentiment_daily: ["market.ws", "community.agg", "social.stream"],
};

/** checks without the legal sign-off (any draft change invalidates it) */
const dropLegal = sql`coalesce((select jsonb_agg(x) from jsonb_array_elements(${candidates.checks}) x where x->>'id' <> 'legal'), '[]'::jsonb)`;

async function loadCandidate(candidateId: string) {
  const c = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!c) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
  return c;
}

/* ───────────────────────── create ───────────────────────── */

/** Mode (c): an editor's idea, drafted with AI assistance. Used with useActionState. */
export async function createFromIdea(_prev: ActionState<{ id: string }>, form: FormData): Promise<ActionState<{ id: string }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        idea: z.string().trim().min(8, "아이디어를 8자 이상 적어주세요").max(1000),
        beat,
        draft: z.enum(["on", "off"]).default("on"),
      })
      .parse({ idea: form.get("idea"), beat: form.get("beat"), draft: form.get("draft") ?? "off" });

    const gen = p.draft === "on" ? await getGenerator().draftFromItems({ items: [], beat: p.beat, mode: "editor_idea", idea: p.idea }) : null;
    const [cand] = await db
      .insert(candidates)
      .values({
        status: gen ? "drafting" : "new",
        mode: "editor_idea",
        beat: p.beat,
        priority: 60,
        idea: p.idea,
        draft: gen?.draft ?? { ...EMPTY_DRAFT, title: p.idea.slice(0, 60) },
        aiNote: gen?.aiNote ?? null,
        generator: gen?.meta ?? null,
        assigneeId: me.id,
      })
      .returning({ id: candidates.id });
    await logActivity(db, { actorId: me.id, kind: "draft", entityType: "candidate", entityId: cand.id, summary: `아이디어 기획: ${p.idea.slice(0, 60)}` });
    refresh();
    return ok("기획 후보를 만들었습니다.", { id: cand.id });
  } catch (e) {
    return fail(e);
  }
}

/** Mode (b): fully automatic data article from a code template. */
export async function createDataAuto(input: { template: string }): Promise<ActionState<{ id: string }>> {
  try {
    const me = await requireStaff();
    const template = z.enum(["crypto_daily", "market_close", "sentiment_daily"]).parse(input.template) as DataTemplateId;
    const quotes = await db.select().from(marketQuotes);
    const snaps = await db.select().from(sentimentSnapshots).orderBy(desc(sentimentSnapshots.at));
    const latest = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) if (!latest.has(s.scopeKey)) latest.set(s.scopeKey, s);
    const draft = buildDataDraft(template, {
      quotes,
      sentiment: [...latest.values()],
      dateLabel: dateKST(new Date()),
    });
    if (!draft) throw new NewsroomError("템플릿에 필요한 데이터가 없습니다.", "invalid");
    const meta = DATA_TEMPLATES[template];
    // attribute to the experiment of the active feed source that supplies this data
    const [src] = await db
      .select({ experimentId: feedSources.experimentId })
      .from(feedSources)
      .where(and(inArray(feedSources.adapter, TEMPLATE_ADAPTERS[template]), ne(feedSources.status, "error"), isNotNull(feedSources.experimentId)))
      .limit(1);
    const [cand] = await db
      .insert(candidates)
      .values({
        status: "review",
        mode: "data_auto",
        beat: meta.beat,
        priority: 40,
        experimentId: src?.experimentId ?? null,
        draft,
        generator: { id: `template:${template}`, version: "1", generatedAt: new Date().toISOString(), inputItemIds: [] },
        assigneeId: me.id,
      })
      .returning({ id: candidates.id });
    await logActivity(db, { actorId: me.id, kind: "draft", entityType: "candidate", entityId: cand.id, summary: `데이터 자동 기사 생성: ${meta.label}` });
    refresh();
    return ok(`${meta.label} 후보를 만들었습니다.`, { id: cand.id });
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── edit ───────────────────────── */

/** Optimistic-locked draft save. Returns the new lockVersion. */
export async function saveDraft(input: {
  id: string;
  lockVersion: number;
  draft: Draft;
  beat?: string;
  storyId?: string | null;
  priority?: number;
}): Promise<ActionState<{ lockVersion: number; savedAt: string }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        id,
        lockVersion: z.number().int().min(0),
        draft: draftSchema,
        beat: beat.optional(),
        storyId: z.uuid().nullable().optional(),
        priority: z.number().int().min(0).max(100).optional(),
      })
      .parse(input);

    const now = new Date();
    // A content change after sign-off voids the legal check and pulls a scheduled piece back to review.
    const same = sql`(${candidates.draft} = ${JSON.stringify(p.draft)}::jsonb)`;
    const updated = await db
      .update(candidates)
      .set({
        draft: p.draft,
        ...(p.beat ? { beat: p.beat } : {}),
        ...(p.storyId !== undefined ? { storyId: p.storyId } : {}),
        ...(p.priority !== undefined ? { priority: p.priority } : {}),
        updatedAt: now,
        lockVersion: sql`${candidates.lockVersion} + 1`,
        status: sql`(case when ${candidates.status} = 'new' then 'drafting'
                          when ${candidates.status} = 'scheduled' and not ${same} then 'review'
                          else ${candidates.status}::text end)::candidate_status`,
        scheduledAt: sql`case when ${candidates.status} = 'scheduled' and not ${same} then null else ${candidates.scheduledAt} end`,
        scheduledById: sql`case when ${candidates.status} = 'scheduled' and not ${same} then null else ${candidates.scheduledById} end`,
        checks: sql`case when ${same} then ${candidates.checks} else ${dropLegal} end`,
      })
      .where(and(eq(candidates.id, p.id), eq(candidates.lockVersion, p.lockVersion), ne(candidates.status, "published")))
      .returning({ lockVersion: candidates.lockVersion, status: candidates.status });

    if (!updated.length) {
      const exists = await db.query.candidates.findFirst({ where: eq(candidates.id, p.id), columns: { id: true, status: true } });
      if (!exists) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
      if (exists.status === "published") throw new NewsroomError("이미 발행된 후보입니다.", "state");
      throw new NewsroomError("다른 편집자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.", "conflict");
    }
    void me;
    return ok("저장됨", { lockVersion: updated[0].lockVersion, savedAt: now.toISOString() });
  } catch (e) {
    return fail(e);
  }
}

const STATUS_FLOW = ["new", "drafting", "review", "rejected"] as const;

export async function moveCandidate(input: { id: string; status: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, status: z.enum(STATUS_FLOW) }).parse(input);
    const c = await loadCandidate(p.id);
    if (c.status === "published") throw new NewsroomError("발행된 후보는 이동할 수 없습니다.", "state");
    const moved = await db
      .update(candidates)
      .set({ status: p.status, scheduledAt: null, scheduledById: null, updatedAt: new Date(), lockVersion: sql`${candidates.lockVersion} + 1` })
      .where(and(eq(candidates.id, p.id), ne(candidates.status, "published")))
      .returning({ id: candidates.id });
    if (!moved.length) throw new NewsroomError("이미 발행된 후보입니다.", "state");
    await logActivity(db, { actorId: me.id, kind: "move", entityType: "candidate", entityId: p.id, summary: `상태 변경: ${CANDIDATE_STATUS_LABEL[c.status]} → ${CANDIDATE_STATUS_LABEL[p.status]}` });
    refresh();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function assignCandidate(input: { id: string; staffId: string | null }): Promise<ActionState> {
  try {
    await requireStaff();
    const p = z.object({ id, staffId: z.uuid().nullable() }).parse(input);
    await db.update(candidates).set({ assigneeId: p.staffId, updatedAt: new Date() }).where(eq(candidates.id, p.id));
    refresh();
    return ok("담당자를 바꿨습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function rejectCandidate(input: { id: string; reason: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, reason: z.string().trim().min(1).max(200) }).parse(input);
    const c = await loadCandidate(p.id);
    if (c.status === "published") throw new NewsroomError("발행된 후보는 반려할 수 없습니다.", "state");
    const rejected = await db
      .update(candidates)
      .set({ status: "rejected", aiNote: `반려: ${p.reason}`, scheduledAt: null, scheduledById: null, updatedAt: new Date(), lockVersion: sql`${candidates.lockVersion} + 1` })
      .where(and(eq(candidates.id, p.id), ne(candidates.status, "published")))
      .returning({ id: candidates.id });
    if (!rejected.length) throw new NewsroomError("발행된 후보는 반려할 수 없습니다.", "state");
    await logActivity(db, { actorId: me.id, kind: "reject", entityType: "candidate", entityId: p.id, summary: `반려: ${p.reason}` });
    refresh();
    return ok("반려했습니다.");
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── AI (mock in phase 1) ───────────────────────── */

/** Re-generate the whole draft from the linked items (replaces the draft). */
export async function regenerateDraft(input: { id: string }): Promise<ActionState<{ draft: Draft; lockVersion: number }>> {
  try {
    const me = await requireStaff();
    const p = z.object({ id }).parse(input);
    const c = await loadCandidate(p.id);
    if (c.status === "published") throw new NewsroomError("이미 발행된 후보입니다.", "state");
    const items = (await loadCandidateItems(db, c.id)).map(toGenItem);
    const gen = await getGenerator().draftFromItems({ items, beat: c.beat, mode: c.mode, idea: c.idea });
    const [u] = await db
      .update(candidates)
      .set({
        draft: gen.draft,
        aiNote: gen.aiNote,
        generator: gen.meta,
        status: c.status === "new" ? "drafting" : c.status === "scheduled" ? "review" : c.status,
        scheduledAt: null,
        scheduledById: null,
        checks: dropLegal,
        updatedAt: new Date(),
        lockVersion: sql`${candidates.lockVersion} + 1`,
      })
      .where(and(eq(candidates.id, c.id), ne(candidates.status, "published")))
      .returning({ lockVersion: candidates.lockVersion });
    await logActivity(db, { actorId: me.id, kind: "draft", entityType: "candidate", entityId: c.id, summary: `초안 생성 (${gen.meta.id})` });
    refresh();
    return ok("초안을 생성했습니다.", { draft: gen.draft, lockVersion: u.lockVersion });
  } catch (e) {
    return fail(e);
  }
}

/** Suggestion only — nothing is saved until the editor applies it in the editor. */
export async function assistDraft(input: { id: string; draft: Draft; action: string }): Promise<ActionState<AssistResult>> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, draft: draftSchema, action: z.enum(["headlines", "tighten", "why", "numbers", "next"]) }).parse(input);
    const c = await loadCandidate(p.id);
    const items = (await loadCandidateItems(db, c.id)).map(toGenItem);
    const result = await getGenerator().assist({ draft: p.draft, beat: c.beat, items, action: p.action });
    // generator involvement is recorded so the published label reads "AI 보조"
    if (!c.generator) {
      await db
        .update(candidates)
        .set({ generator: { id: getGenerator().id, version: getGenerator().version, generatedAt: new Date().toISOString(), inputItemIds: items.map((i) => i.id) } })
        .where(eq(candidates.id, c.id));
    }
    await logActivity(db, { actorId: me.id, kind: "assist", entityType: "candidate", entityId: c.id, summary: `AI 어시스트: ${ASSIST_ACTION_LABEL[p.action] ?? p.action}` });
    return ok(undefined, result);
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── checks ───────────────────────── */

export async function runCandidateChecks(input: { id: string }): Promise<ActionState<{ checks: CheckResult[] }>> {
  try {
    const me = await requireStaff();
    const p = z.object({ id }).parse(input);
    const checks = await computeChecks(db, p.id, me.name);
    await db.update(candidates).set({ checks }).where(eq(candidates.id, p.id));
    refresh();
    return ok("체크를 다시 실행했습니다.", { checks });
  } catch (e) {
    return fail(e);
  }
}

/** The legal check is a human confirmation; it survives re-runs until the draft is published. */
export async function confirmLegal(input: { id: string; confirmed: boolean }): Promise<ActionState<{ checks: CheckResult[] }>> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, confirmed: z.boolean() }).parse(input);
    const c = await loadCandidate(p.id);
    const legal: CheckResult = {
      id: "legal",
      ok: p.confirmed,
      blocking: true,
      message: p.confirmed ? `${me.name} 확인 (명예훼손·저작권·개인정보)` : "편집자가 직접 확인해야 합니다",
      ...(p.confirmed ? { draftHash: draftHash(c.draft) } : {}),
    };
    const prev = c.checks.filter((x) => x.id !== "legal");
    await db.update(candidates).set({ checks: [...prev, legal] }).where(eq(candidates.id, c.id));
    const checks = await computeChecks(db, c.id, me.name);
    await db.update(candidates).set({ checks }).where(eq(candidates.id, c.id));
    await logActivity(db, { actorId: me.id, kind: "check", entityType: "candidate", entityId: c.id, summary: p.confirmed ? "법률 검토 확인" : "법률 검토 해제" });
    refresh();
    return ok(undefined, { checks });
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── publish & schedule ───────────────────────── */

/** Publish the draft version the editor reviewed (`lockVersion`); any newer change is refused. */
export async function publishNow(input: { id: string; overrideReason?: string; lockVersion?: number }): Promise<ActionState<{ slug: string }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({ id, overrideReason: z.string().trim().max(300).optional(), lockVersion: z.number().int().min(0).optional() })
      .parse(input);
    const res = await publishCandidate(db, {
      candidateId: p.id,
      editorId: me.id,
      actorId: me.id,
      overrideReason: p.overrideReason,
      expectedLockVersion: p.lockVersion,
    });
    if (!res) throw new NewsroomError("발행할 수 없는 상태입니다.", "state");
    invalidateFromAction(res.tags);
    refreshInBackground([T.rel]);
    after(() => cdnPurge(res.paths));
    refresh();
    return ok("발행했습니다.", { slug: res.slug });
  } catch (e) {
    return fail(e);
  }
}

export async function scheduleCandidate(input: { id: string; at: string; lockVersion?: number }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, at: z.iso.datetime({ offset: true }), lockVersion: z.number().int().min(0).optional() }).parse(input);
    const at = new Date(p.at);
    if (at.getTime() < Date.now() + 60_000) throw new NewsroomError("예약 시각은 1분 이후여야 합니다.", "invalid");
    const c = await loadCandidate(p.id);
    if (c.status === "published" || c.status === "rejected") throw new NewsroomError("예약할 수 없는 상태입니다.", "state");
    // Validate now so a scheduled piece cannot silently fail later.
    const checks = await computeChecks(db, c.id, me.name);
    const blocking = checks.filter((x) => x.blocking && !x.ok && !x.overridden);
    if (blocking.length) throw new NewsroomError(`필수 체크 미통과: ${blocking.map((x) => x.message).join(" / ")}`, "blocked");
    const scheduled = await db
      .update(candidates)
      .set({ status: "scheduled", scheduledAt: at, scheduledById: me.id, checks, updatedAt: new Date(), lockVersion: sql`${candidates.lockVersion} + 1` })
      .where(
        and(
          eq(candidates.id, c.id),
          eq(candidates.lockVersion, p.lockVersion ?? c.lockVersion),
          ne(candidates.status, "published"),
          ne(candidates.status, "rejected"),
        ),
      )
      .returning({ id: candidates.id });
    if (!scheduled.length) throw new NewsroomError("다른 편집자가 초안을 바꿨습니다. 새로고침 후 다시 예약하세요.", "conflict");
    await logActivity(db, { actorId: me.id, kind: "schedule", entityType: "candidate", entityId: c.id, summary: `예약 발행: ${dateTimeKST(at)}` });
    refresh();
    return ok("예약했습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function unscheduleCandidate(input: { id: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id }).parse(input);
    await db
      .update(candidates)
      .set({ status: "review", scheduledAt: null, scheduledById: null, updatedAt: new Date(), lockVersion: sql`${candidates.lockVersion} + 1` })
      .where(and(eq(candidates.id, p.id), eq(candidates.status, "scheduled")));
    await logActivity(db, { actorId: me.id, kind: "schedule", entityType: "candidate", entityId: p.id, summary: "예약 취소" });
    refresh();
    return ok("예약을 취소했습니다.");
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── stories ───────────────────────── */

export async function createStory(input: { title: string; beat: string; summary?: string }): Promise<ActionState<{ id: string; slug: string }>> {
  try {
    const me = await requireStaff();
    const p = z.object({ title: z.string().trim().min(2).max(80), beat, summary: z.string().trim().max(300).optional() }).parse(input);
    const [s] = await db
      .insert(stories)
      .values({ title: p.title, beat: p.beat, summary: p.summary ?? "", slug: storySlugFrom(p.title) })
      .returning({ id: stories.id, slug: stories.slug });
    await logActivity(db, { actorId: me.id, kind: "story", entityType: "story", entityId: s.id, summary: `스토리 생성: ${p.title}` });
    refresh();
    return ok("스토리를 만들었습니다.", s);
  } catch (e) {
    return fail(e);
  }
}

/** Remove a feed item from a candidate (it goes back to the inbox). */
export async function detachItem(input: { id: string; itemId: string }): Promise<ActionState> {
  try {
    await requireStaff();
    const p = z.object({ id, itemId: z.uuid() }).parse(input);
    await db.transaction(async (tx) => {
      const [c] = await tx.select({ status: candidates.status }).from(candidates).where(eq(candidates.id, p.id)).for("update");
      if (!c) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
      if (c.status === "published") throw new NewsroomError("발행된 후보의 원천 자료는 분리할 수 없습니다.", "state");
      const removed = await tx
        .delete(candidateItems)
        .where(and(eq(candidateItems.candidateId, p.id), eq(candidateItems.feedItemId, p.itemId)))
        .returning({ id: candidateItems.feedItemId });
      if (removed.length) await tx.execute(sql`update feed_items set status = 'new' where id = ${p.itemId} and status = 'promoted'`);
    });
    refresh();
    return ok("원천 자료를 분리했습니다.");
  } catch (e) {
    return fail(e);
  }
}

