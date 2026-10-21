"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { candidateItems, candidates, feedItems } from "@/db/schema";
import { EMPTY_DRAFT } from "@/lib/content/blocks";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { getGenerator } from "../generator";
import { loadItemsByIds, NewsroomError } from "../newsroom";
import { fail, ok, type ActionState } from "./result";

const beat = z.enum(["ai", "crypto", "economy", "tech", "sentiment"]);
const ids = z.array(z.uuid()).min(1).max(50);

/**
 * Promote feed items to candidates. `merge` clusters all selected items into a
 * single candidate (first = primary); otherwise one candidate per item.
 * With `draft`, the generator writes a first draft immediately.
 */
export async function promoteItems(input: {
  ids: string[];
  merge: boolean;
  mode?: "feed_draft" | "data_auto";
  beat?: string;
  draft?: boolean;
}): Promise<ActionState<{ candidateIds: string[] }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({ ids, merge: z.boolean(), mode: z.enum(["feed_draft", "data_auto"]).default("feed_draft"), beat: beat.optional(), draft: z.boolean().default(true) })
      .parse(input);

    const rows = await loadItemsByIds(db, p.ids);
    const fresh = rows.filter((r) => r.status === "new");
    if (!fresh.length) throw new NewsroomError("승격할 수 있는 새 항목이 없습니다.", "state");
    const order = new Map(p.ids.map((id, i) => [id, i]));
    fresh.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const groups = p.merge ? [fresh] : fresh.map((r) => [r]);
    const generator = getGenerator();
    const created: string[] = [];

    for (const group of groups) {
      const primary = group[0];
      const b = p.beat ?? primary.beatGuess ?? "tech";
      const gen = p.draft
        ? await generator.draftFromItems({
            beat: b as never,
            mode: p.mode,
            items: group.map((r) => ({
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
            })),
          })
        : null;

      const id = await db.transaction(async (tx) => {
        const [cand] = await tx
          .insert(candidates)
          .values({
            status: gen ? "drafting" : "new",
            mode: p.mode,
            beat: b as never,
            priority: Math.max(...group.map((r) => r.score)),
            experimentId: primary.source.experimentId,
            draft: gen?.draft ?? { ...EMPTY_DRAFT, title: primary.title.slice(0, 120) },
            aiNote: gen?.aiNote ?? null,
            generator: gen?.meta ?? null,
            assigneeId: me.id,
          })
          .returning({ id: candidates.id });
        await tx.insert(candidateItems).values(group.map((r, i) => ({ candidateId: cand.id, feedItemId: r.id, role: i === 0 ? "primary" : "supporting" })));
        await tx
          .update(feedItems)
          .set({ status: "promoted" })
          .where(and(inArray(feedItems.id, group.map((r) => r.id)), eq(feedItems.status, "new")));
        await logActivity(tx, {
          actorId: me.id,
          kind: "promote",
          entityType: "candidate",
          entityId: cand.id,
          summary: `후보 생성 (${group.length}건 묶음): ${primary.title.slice(0, 60)}`,
          meta: { items: group.map((r) => r.id), merge: p.merge },
        });
        return cand.id;
      });
      created.push(id);
    }

    refresh();
    return ok(`후보 ${created.length}건을 만들었습니다.`, { candidateIds: created });
  } catch (e) {
    return fail(e);
  }
}

export async function dismissItems(input: { ids: string[]; reason: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ ids, reason: z.string().trim().min(1).max(120) }).parse(input);
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(feedItems)
        .set({ status: "dismissed", dismissedReason: p.reason })
        .where(and(inArray(feedItems.id, p.ids), eq(feedItems.status, "new")))
        .returning({ id: feedItems.id });
      for (const u of updated) {
        await logActivity(tx, { actorId: me.id, kind: "dismiss", entityType: "feed_item", entityId: u.id, summary: `기각: ${p.reason}` });
      }
    });
    refresh();
    return ok(`${p.ids.length}건을 기각했습니다.`);
  } catch (e) {
    return fail(e);
  }
}

export async function restoreItems(input: { ids: string[] }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ ids }).parse(input);
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(feedItems)
        .set({ status: "new", dismissedReason: null })
        .where(and(inArray(feedItems.id, p.ids), eq(feedItems.status, "dismissed")))
        .returning({ id: feedItems.id });
      for (const u of updated) {
        await logActivity(tx, { actorId: me.id, kind: "restore", entityType: "feed_item", entityId: u.id, summary: "기각 취소" });
      }
    });
    refresh();
    return ok("인박스로 되돌렸습니다.");
  } catch (e) {
    return fail(e);
  }
}
