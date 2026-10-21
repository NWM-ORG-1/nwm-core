import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  articleRevisions,
  articles,
  candidateItems,
  candidates,
  feedItems,
  feedSources,
  staff,
  stories,
  type AiInvolvement,
  type CheckResult,
} from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { T } from "@/lib/cache-tags";
import { draftSchema, readSecondsFor, type Draft } from "@/lib/content/blocks";
import { ymdKST } from "@/lib/format";
import { logActivity } from "./activity";
import { blockingFailures, runChecks, type CheckItem } from "./checks";
import type { GenItem } from "./generator/types";
import { newArticleSlug } from "./slug";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Q = DB | Tx;

export class NewsroomError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid" | "blocked" | "conflict" | "state" = "invalid",
    public details?: unknown,
  ) {
    super(message);
    this.name = "NewsroomError";
  }
}

/* ───────────────────────────── loading ───────────────────────────── */

export interface CandidateItemRow {
  id: string;
  role: string;
  title: string;
  summary: string;
  url: string | null;
  lang: string;
  entities: string[];
  payload: Record<string, unknown>;
  publishedAt: Date | null;
  fetchedAt: Date;
  score: number;
  source: {
    id: string;
    name: string;
    kind: string;
    trustTier: number;
    signalOnly: boolean;
    licCommercialOk: boolean | null;
    licRedistributionOk: boolean | null;
    licVerbatimOk: boolean | null;
    licAttribution: string | null;
    licReviewedAt: Date | null;
    experimentId: string | null;
  };
}

export async function loadCandidateItems(q: Q, candidateId: string): Promise<CandidateItemRow[]> {
  const rows = await q
    .select({
      id: feedItems.id,
      role: candidateItems.role,
      title: feedItems.title,
      summary: feedItems.summary,
      url: feedItems.url,
      lang: feedItems.lang,
      entities: feedItems.entities,
      payload: feedItems.payload,
      publishedAt: feedItems.publishedAt,
      fetchedAt: feedItems.fetchedAt,
      score: feedItems.score,
      source: {
        id: feedSources.id,
        name: feedSources.name,
        kind: feedSources.kind,
        trustTier: feedSources.trustTier,
        signalOnly: feedSources.signalOnly,
        licCommercialOk: feedSources.licCommercialOk,
        licRedistributionOk: feedSources.licRedistributionOk,
        licVerbatimOk: feedSources.licVerbatimOk,
        licAttribution: feedSources.licAttribution,
        licReviewedAt: feedSources.licReviewedAt,
        experimentId: feedSources.experimentId,
      },
    })
    .from(candidateItems)
    .innerJoin(feedItems, eq(candidateItems.feedItemId, feedItems.id))
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(eq(candidateItems.candidateId, candidateId))
    .orderBy(sql`case when ${candidateItems.role} = 'primary' then 0 else 1 end`, desc(feedItems.score));
  return rows;
}

export function toGenItem(r: CandidateItemRow): GenItem {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    sourceName: r.source.name,
    sourceKind: r.source.kind,
    trustTier: r.source.trustTier,
    signalOnly: r.source.signalOnly,
    lang: r.lang,
    entities: r.entities,
    payload: r.payload,
    url: r.url,
  };
}

export function toCheckItem(r: CandidateItemRow): CheckItem {
  return {
    title: r.title,
    summary: r.summary,
    payload: r.payload,
    signalOnly: r.source.signalOnly,
    trustTier: r.source.trustTier,
    sourceName: r.source.name,
    lic: {
      commercialOk: r.source.licCommercialOk,
      verbatimOk: r.source.licVerbatimOk,
      reviewed: r.source.licReviewedAt != null,
    },
  };
}

export async function recentTitles(q: Q, hours = 72): Promise<string[]> {
  const rows = await q
    .select({ title: articles.title })
    .from(articles)
    .where(and(eq(articles.status, "published"), gte(articles.publishedAt, sql`now() - make_interval(hours => ${hours})`)))
    .limit(500);
  return rows.map((r) => r.title);
}

/* ───────────────────────────── checks ───────────────────────────── */

export async function computeChecks(q: Q, candidateId: string, editorName: string | null): Promise<CheckResult[]> {
  const cand = await q.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!cand) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
  const items = await loadCandidateItems(q, candidateId);
  return runChecks({
    draft: cand.draft,
    mode: cand.mode,
    items: items.map(toCheckItem),
    recentTitles: await recentTitles(q),
    previous: cand.checks,
    editorName,
  });
}

/* ───────────────────────────── stories ───────────────────────────── */

export async function refreshStoryStats(q: Q, storyId: string | null | undefined) {
  if (!storyId) return;
  await q.execute(sql`
    update stories set
      article_count = (select count(*) from articles where story_id = ${storyId} and status = 'published'),
      last_published_at = (select max(published_at) from articles where story_id = ${storyId} and status = 'published')
    where id = ${storyId}`);
}

/* ───────────────────────────── publish ───────────────────────────── */

export function aiInvolvementFor(mode: string, usedGenerator: boolean): AiInvolvement {
  if (mode === "data_auto") return "auto";
  if (mode === "feed_draft") return "ai_draft_edited";
  return usedGenerator ? "ai_assisted" : "human";
}

export interface PublishResult {
  articleId: string;
  slug: string;
  beat: string;
  storyId: string | null;
  tags: string[];
  paths: string[];
}

const strictDraft = draftSchema.superRefine((d, ctx) => {
  if (!d.title.trim()) ctx.addIssue({ code: "custom", message: "제목이 비어 있습니다", path: ["title"] });
  if (!d.dek.trim()) ctx.addIssue({ code: "custom", message: "시그널(요약)이 비어 있습니다", path: ["dek"] });
  if (d.blocks.length === 0) ctx.addIssue({ code: "custom", message: "본문 블록이 없습니다", path: ["blocks"] });
});

/**
 * Publishes a candidate in one transaction: validates the draft, re-runs checks,
 * creates the article (+ revision 1), links the story and logs the activity.
 * Callers invalidate `result.tags` afterwards (updateTag from actions,
 * revalidateTag from route handlers).
 */
export async function publishCandidate(
  db: DB,
  opts: { candidateId: string; editorId: string | null; actorId: string | null; overrideReason?: string; now?: Date },
): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const [cand] = await tx.select().from(candidates).where(eq(candidates.id, opts.candidateId)).for("update");
    if (!cand) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
    if (cand.status === "published" || cand.status === "rejected") {
      throw new NewsroomError(`이미 ${cand.status === "published" ? "발행된" : "반려된"} 후보입니다.`, "state");
    }

    const parsed = strictDraft.safeParse(cand.draft);
    if (!parsed.success) {
      throw new NewsroomError(parsed.error.issues.map((i) => i.message).join(" · "), "invalid", parsed.error.issues);
    }
    const draft: Draft = parsed.data;

    const isAuto = cand.mode === "data_auto";
    const editor = opts.editorId ? await tx.query.staff.findFirst({ where: eq(staff.id, opts.editorId) }) : null;
    if (!isAuto && !editor) throw new NewsroomError("AI 초안·보조 기사는 책임 편집자가 필요합니다.", "invalid");

    let checks = await computeChecks(tx, cand.id, editor?.name ?? null);
    const failing = blockingFailures(checks);
    if (failing.length) {
      if (!opts.overrideReason?.trim()) {
        throw new NewsroomError(`필수 체크 미통과: ${failing.map((c) => c.message).join(" / ")}`, "blocked", failing);
      }
      const stamp = { by: editor?.name ?? "system", reason: opts.overrideReason.trim(), at: new Date().toISOString() };
      checks = checks.map((c) => (c.blocking && !c.ok && !c.overridden ? { ...c, overridden: stamp } : c));
    }

    const now = opts.now ?? new Date();
    const aiInvolvement = aiInvolvementFor(cand.mode, cand.generator != null);
    const beatLabel = BEATS[cand.beat].label;
    const byline =
      aiInvolvement === "auto"
        ? "NWM 데이터 데스크"
        : aiInvolvement === "ai_draft_edited"
          ? `NWM ${beatLabel} 데스크`
          : `글 · ${editor!.name}`;

    const slug = newArticleSlug(now);
    const [article] = await tx
      .insert(articles)
      .values({
        slug,
        beat: cand.beat,
        edition: cand.edition,
        storyId: cand.storyId,
        candidateId: cand.id,
        experimentId: cand.experimentId,
        title: draft.title,
        dek: draft.dek,
        blocks: draft.blocks,
        tags: draft.tags,
        tickers: draft.tickers,
        sources: draft.sources,
        sentiment: draft.sentiment ?? null,
        aiInvolvement,
        generator: cand.generator,
        authorId: aiInvolvement === "human" || aiInvolvement === "ai_assisted" ? (editor?.id ?? null) : null,
        editorId: isAuto ? null : (editor?.id ?? null),
        byline,
        status: "published",
        isBreaking: Boolean(draft.isBreaking),
        readSeconds: readSecondsFor(draft.title, draft.dek, draft.blocks),
        revision: 1,
        publishedAt: now,
        updatedAt: now,
      })
      .returning({ id: articles.id, slug: articles.slug });

    await tx.insert(articleRevisions).values({
      articleId: article.id,
      revision: 1,
      title: draft.title,
      dek: draft.dek,
      blocks: draft.blocks,
      sources: draft.sources,
      editedBy: editor?.id ?? null,
      reason: "최초 발행",
    });

    await tx
      .update(candidates)
      .set({ status: "published", articleId: article.id, checks, updatedAt: now, lockVersion: sql`${candidates.lockVersion} + 1` })
      .where(eq(candidates.id, cand.id));

    await refreshStoryStats(tx, cand.storyId);

    await logActivity(tx, {
      actorId: opts.actorId,
      kind: "publish",
      entityType: "article",
      entityId: article.id,
      summary: `발행: ${draft.title}`,
      meta: { slug, candidateId: cand.id, aiInvolvement, override: opts.overrideReason ?? null },
    });

    const tags = [T.feed, T.article(slug), T.editors, T.rel];
    const paths = ["/", BEATS[cand.beat].path, "/latest", `/a/${slug}`, `/d/${ymdKST(now)}`];
    if (cand.storyId) {
      tags.push(T.story(cand.storyId));
      const s = await tx.query.stories.findFirst({ where: eq(stories.id, cand.storyId) });
      if (s) paths.push(`/s/${s.slug}`);
    }
    return { articleId: article.id, slug, beat: cand.beat, storyId: cand.storyId, tags, paths };
  });
}

/** Scheduled candidates whose time has come. Row locks make concurrent runners safe. */
export async function publishDue(db: DB, now = new Date()): Promise<PublishResult[]> {
  const due = await db
    .select({ id: candidates.id, scheduledById: candidates.scheduledById })
    .from(candidates)
    .where(and(eq(candidates.status, "scheduled"), sql`${candidates.scheduledAt} <= ${now}`))
    .limit(20);
  const results: PublishResult[] = [];
  for (const d of due) {
    try {
      results.push(await publishCandidate(db, { candidateId: d.id, editorId: d.scheduledById, actorId: d.scheduledById, now }));
    } catch (err) {
      console.error("[scheduler] publish failed", d.id, err);
      await db
        .update(candidates)
        .set({ status: "review", aiNote: `예약 발행 실패: ${(err as Error).message}`.slice(0, 500), updatedAt: now })
        .where(eq(candidates.id, d.id));
    }
  }
  return results;
}

/** Feed items → generator/check inputs for a fresh candidate (before it exists). */
export async function loadItemsByIds(q: Q, ids: string[]) {
  if (!ids.length) return [];
  return q
    .select({
      id: feedItems.id,
      title: feedItems.title,
      summary: feedItems.summary,
      url: feedItems.url,
      lang: feedItems.lang,
      entities: feedItems.entities,
      payload: feedItems.payload,
      beatGuess: feedItems.beatGuess,
      score: feedItems.score,
      status: feedItems.status,
      source: {
        id: feedSources.id,
        name: feedSources.name,
        kind: feedSources.kind,
        trustTier: feedSources.trustTier,
        signalOnly: feedSources.signalOnly,
        experimentId: feedSources.experimentId,
      },
    })
    .from(feedItems)
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(inArray(feedItems.id, ids));
}
