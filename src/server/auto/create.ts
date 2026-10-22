import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { candidateItems, candidates, feedItems, feedSources, stories, type CheckResult } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { logActivity } from "../activity";
import { draftHash } from "../checks";
import { DATA_TEMPLATES, type DataTemplateId } from "../generator/data-templates";

export const AUTO_LEGAL_NOTE = "자동 발행 설정 — 데이터 템플릿 사전 승인 (편집하면 다시 확인 필요)";

/** Does an automatic candidate with this key exist already (any status, rejected included)? */
export async function autoKeyExists(db: Pick<DB, "select">, key: string): Promise<boolean> {
  const [r] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(sql`${candidates.generator}->>'key' = ${key}`)
    .limit(1);
  return Boolean(r);
}

/**
 * Stores one automatic article as a candidate.
 *  review → in 검토 for an editor
 *  auto   → scheduled for now: the publishing scheduler (publish-due) puts it
 *           out within a minute, or sends it back to 검토 with the reason if a
 *           blocking check fails (e.g. a source licence not reviewed yet).
 * A key makes it at most once per key; returns null when it already exists.
 */
export async function createAutoCandidate(
  db: DB,
  input: {
    template: DataTemplateId;
    draft: Draft;
    mode: "review" | "auto";
    key: string | null;
    now: Date;
    itemIds?: string[];
    actorId?: string | null;
    note?: string | null;
  },
): Promise<{ id: string; status: "review" | "scheduled" } | null> {
  const meta = DATA_TEMPLATES[input.template];
  const auto = input.mode === "auto";
  return db.transaction(async (tx) => {
    // attribute to the experiment of an active source that supplies this data
    const [src] = meta.adapters.length
      ? await tx
          .select({ experimentId: feedSources.experimentId })
          .from(feedSources)
          .where(and(inArray(feedSources.adapter, meta.adapters), ne(feedSources.status, "error"), isNotNull(feedSources.experimentId)))
          .limit(1)
      : [];

    let storyId: string | null = null;
    if (meta.series) {
      await tx
        .insert(stories)
        .values({ slug: meta.series.slug, beat: meta.beat, title: meta.series.title, summary: meta.series.summary, status: "developing" })
        .onConflictDoNothing({ target: stories.slug });
      const s = await tx.query.stories.findFirst({ where: eq(stories.slug, meta.series.slug), columns: { id: true } });
      storyId = s?.id ?? null;
    }

    const [cand] = await tx
      .insert(candidates)
      .values({
        status: auto ? "scheduled" : "review",
        mode: "data_auto",
        beat: meta.beat,
        priority: meta.trigger.kind === "event" ? 70 : 40,
        experimentId: src?.experimentId ?? null,
        storyId,
        draft: input.draft,
        aiNote: input.note ?? null,
        generator: {
          id: `template:${input.template}`,
          version: "2",
          generatedAt: input.now.toISOString(),
          inputItemIds: input.itemIds ?? [],
          ...(input.key ? { key: input.key } : {}),
        },
        scheduledAt: auto ? input.now : null,
        assigneeId: input.actorId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: candidates.id });
    if (!cand) return null;

    if (auto) {
      // sign off the draft as stored: jsonb reorders keys, and publishing hashes what it reads back
      const [stored] = await tx.select({ draft: candidates.draft }).from(candidates).where(eq(candidates.id, cand.id));
      const checks: CheckResult[] = [{ id: "legal", ok: true, blocking: true, message: AUTO_LEGAL_NOTE, draftHash: draftHash(stored.draft) }];
      await tx.update(candidates).set({ checks }).where(eq(candidates.id, cand.id));
    }

    if (input.itemIds?.length) {
      await tx.insert(candidateItems).values(input.itemIds.map((feedItemId, i) => ({ candidateId: cand.id, feedItemId, role: i === 0 ? "primary" : "supporting" })));
      await tx.update(feedItems).set({ status: "promoted" }).where(and(inArray(feedItems.id, input.itemIds), eq(feedItems.status, "new")));
    }
    await logActivity(tx, {
      actorId: input.actorId ?? null,
      kind: "draft",
      entityType: "candidate",
      entityId: cand.id,
      summary: `자동 기사 ${auto ? "(자동 발행)" : "(검토 대기)"}: ${meta.label} — ${input.draft.title}`.slice(0, 300),
      meta: { template: input.template, key: input.key, mode: input.mode },
    });
    return { id: cand.id, status: auto ? "scheduled" : "review" };
  });
}
