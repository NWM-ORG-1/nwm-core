"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { articleCorrections, articleRevisions, articles, correctionRequests, stories } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { T } from "@/lib/cache-tags";
import { blockSchema, readSecondsFor } from "@/lib/content/blocks";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { cdnPurge, invalidateFromAction } from "../invalidate";
import { NewsroomError, refreshStoryStats } from "../newsroom";
import { fail, ok, type ActionState } from "./result";

const id = z.uuid();

async function loadArticle(articleId: string) {
  const a = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!a) throw new NewsroomError("기사를 찾을 수 없습니다.", "not_found");
  return a;
}

function publicTags(a: { slug: string; storyId: string | null }) {
  const tags: string[] = [T.feed, T.rel, T.article(a.slug), T.editors];
  if (a.storyId) tags.push(T.story(a.storyId));
  return tags;
}

function publicPaths(a: { slug: string; beat: keyof typeof BEATS }) {
  return ["/", BEATS[a.beat].path, "/latest", `/a/${a.slug}`];
}

export async function unpublishArticle(input: { id: string; reason: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, reason: z.string().trim().min(2).max(200) }).parse(input);
    const a = await loadArticle(p.id);
    if (a.status === "unpublished") throw new NewsroomError("이미 비공개 상태입니다.", "state");
    await db.transaction(async (tx) => {
      await tx.update(articles).set({ status: "unpublished", updatedAt: new Date() }).where(eq(articles.id, a.id));
      await refreshStoryStats(tx, a.storyId);
      await logActivity(tx, { actorId: me.id, kind: "unpublish", entityType: "article", entityId: a.id, summary: `비공개 전환: ${p.reason}` });
    });
    invalidateFromAction([...publicTags(a), T.corrections]);
    after(() => cdnPurge(publicPaths(a)));
    refresh();
    return ok("기사를 비공개로 전환했습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function republishArticle(input: { id: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id }).parse(input);
    const a = await loadArticle(p.id);
    if (a.status === "published") throw new NewsroomError("이미 공개 상태입니다.", "state");
    await db.transaction(async (tx) => {
      await tx.update(articles).set({ status: "published", updatedAt: new Date() }).where(eq(articles.id, a.id));
      await refreshStoryStats(tx, a.storyId);
      await logActivity(tx, { actorId: me.id, kind: "publish", entityType: "article", entityId: a.id, summary: "다시 공개" });
    });
    invalidateFromAction(publicTags(a));
    after(() => cdnPurge(publicPaths(a)));
    refresh();
    return ok("다시 공개했습니다.");
  } catch (e) {
    return fail(e);
  }
}

/**
 * Edit or correct a published article. Creates a new revision; a public
 * correction note is required unless the change is a silent typo fix (kind=null).
 * 언론중재법: corrections must also fix the original article — this does both.
 */
export async function reviseArticle(input: {
  id: string;
  title: string;
  dek: string;
  blocks: unknown[];
  reason: string;
  correction: null | { kind: "correction" | "clarification" | "update"; note: string };
  requestId?: string | null;
}): Promise<ActionState<{ revision: number }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        id,
        title: z.string().trim().min(1).max(120),
        dek: z.string().trim().min(1).max(300),
        blocks: z.array(blockSchema).min(1).max(16),
        reason: z.string().trim().min(2).max(200),
        correction: z
          .object({ kind: z.enum(["correction", "clarification", "update"]), note: z.string().trim().min(5).max(500) })
          .nullable(),
        requestId: z.uuid().nullable().optional(),
      })
      .parse(input);
    const a = await loadArticle(p.id);
    const revision = a.revision + 1;
    await db.transaction(async (tx) => {
      await tx
        .update(articles)
        .set({
          title: p.title,
          dek: p.dek,
          blocks: p.blocks,
          revision,
          readSeconds: readSecondsFor(p.title, p.dek, p.blocks),
          updatedAt: new Date(),
        })
        .where(eq(articles.id, a.id));
      await tx.insert(articleRevisions).values({
        articleId: a.id,
        revision,
        title: p.title,
        dek: p.dek,
        blocks: p.blocks,
        sources: a.sources,
        editedBy: me.id,
        reason: p.reason,
      });
      if (p.correction) {
        const [corr] = await tx
          .insert(articleCorrections)
          .values({ articleId: a.id, revision, kind: p.correction.kind, note: p.correction.note, createdBy: me.id })
          .returning({ id: articleCorrections.id });
        if (p.requestId) {
          await tx
            .update(correctionRequests)
            .set({ status: "accepted", resolvedAt: new Date(), correctionId: corr.id })
            .where(and(eq(correctionRequests.id, p.requestId), eq(correctionRequests.articleId, a.id)));
        }
      }
      await logActivity(tx, {
        actorId: me.id,
        kind: p.correction ? "correct" : "edit",
        entityType: "article",
        entityId: a.id,
        summary: `${p.correction ? "정정" : "수정"} r${revision}: ${p.reason}`,
      });
    });
    invalidateFromAction([...publicTags(a), T.corrections]);
    after(() => cdnPurge(publicPaths(a)));
    refresh();
    return ok(p.correction ? "정정을 게시했습니다." : "수정했습니다.", { revision });
  } catch (e) {
    return fail(e);
  }
}

export async function setFeatured(input: { id: string; hours: number | null }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, hours: z.number().int().min(1).max(72).nullable() }).parse(input);
    const a = await loadArticle(p.id);
    const until = p.hours ? new Date(Date.now() + p.hours * 3_600_000) : null;
    await db.update(articles).set({ featuredUntil: until }).where(eq(articles.id, a.id));
    await logActivity(db, { actorId: me.id, kind: "feature", entityType: "article", entityId: a.id, summary: until ? `Top 지정 ${p.hours}시간` : "Top 지정 해제" });
    invalidateFromAction([T.feed]);
    refresh();
    return ok(until ? "Top에 지정했습니다." : "Top 지정을 해제했습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function attachStory(input: { id: string; storyId: string | null }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, storyId: z.uuid().nullable() }).parse(input);
    const a = await loadArticle(p.id);
    if (p.storyId) {
      const s = await db.query.stories.findFirst({ where: eq(stories.id, p.storyId) });
      if (!s) throw new NewsroomError("스토리를 찾을 수 없습니다.", "not_found");
    }
    await db.transaction(async (tx) => {
      await tx.update(articles).set({ storyId: p.storyId }).where(eq(articles.id, a.id));
      await refreshStoryStats(tx, a.storyId);
      await refreshStoryStats(tx, p.storyId);
      await logActivity(tx, { actorId: me.id, kind: "story", entityType: "article", entityId: a.id, summary: p.storyId ? "스토리 연결" : "스토리 해제" });
    });
    const tags = [...publicTags(a)];
    if (p.storyId) tags.push(T.story(p.storyId));
    invalidateFromAction(tags);
    refresh();
    return ok("스토리 연결을 바꿨습니다.");
  } catch (e) {
    return fail(e);
  }
}

/** Log an incoming correction request (언론중재법: answer in 3 days, publish within 7). */
export async function logCorrectionRequest(input: {
  articleId: string;
  requester: string;
  channel: string;
  claim: string;
}): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        articleId: id,
        requester: z.string().trim().min(1).max(120),
        channel: z.string().trim().min(1).max(40),
        claim: z.string().trim().min(5).max(2000),
      })
      .parse(input);
    const [r] = await db.insert(correctionRequests).values(p).returning({ id: correctionRequests.id });
    await logActivity(db, { actorId: me.id, kind: "request", entityType: "correction_request", entityId: r.id, summary: `정정 요청 접수 (${p.channel})` });
    refresh();
    return ok("정정 요청을 접수했습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function rejectCorrectionRequest(input: { id: string; note: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id, note: z.string().trim().min(2).max(500) }).parse(input);
    await db
      .update(correctionRequests)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(and(eq(correctionRequests.id, p.id), eq(correctionRequests.status, "open")));
    await logActivity(db, { actorId: me.id, kind: "request", entityType: "correction_request", entityId: p.id, summary: `정정 요청 기각: ${p.note}` });
    refresh();
    return ok("요청을 기각했습니다.");
  } catch (e) {
    return fail(e);
  }
}

