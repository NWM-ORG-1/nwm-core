import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { candidateItems, feedItems, feedSources, type Beat } from "@/db/schema";
import { sha } from "@/ingest/text";
import type { CheckItem } from "./checks";
import type { GenItem } from "./generator/types";

/**
 * Numbers the newsroom computed for a draft (a claim checked against price
 * history) are kept as items of an internal source and linked to the candidate,
 * so the editor sees where each figure came from and the checks find them.
 * The source is never collected.
 */
export const DERIVED_SOURCE = { slug: "nwm-desk-data", name: "NWM 데스크 계산" } as const;

type Tx = Pick<DB, "insert" | "select" | "delete">;

/** How the checks see a computed item before it is saved: our own, licensed, first-hand. */
export const derivedCheckItem = (i: GenItem): CheckItem => ({
  title: i.title,
  summary: i.summary,
  payload: i.payload,
  signalOnly: false,
  trustTier: 1,
  sourceName: DERIVED_SOURCE.name,
  lic: { commercialOk: true, verbatimOk: true, reviewed: true },
});

async function derivedSourceId(tx: Tx): Promise<string> {
  const [made] = await tx
    .insert(feedSources)
    .values({
      slug: DERIVED_SOURCE.slug,
      name: DERIVED_SOURCE.name,
      kind: "api",
      adapter: "manual",
      status: "paused",
      trustTier: 1,
      licCommercialOk: true,
      licRedistributionOk: true,
      licVerbatimOk: true,
      licAttribution: "NWM 계산 (원자료는 표에 적은 공개 시세)",
      licReviewedAt: new Date(),
      licReviewedBy: "NWM",
      notes: "AI 초안이 공개 데이터로 계산한 값을 담는 내부 소스입니다. 수집하지 않습니다.",
    })
    .onConflictDoNothing({ target: feedSources.slug })
    .returning({ id: feedSources.id });
  if (made) return made.id;
  const [row] = await tx.select({ id: feedSources.id }).from(feedSources).where(eq(feedSources.slug, DERIVED_SOURCE.slug));
  return row.id;
}

/** Saves the computed items and links them to the candidate as supporting material. */
export async function saveDerived(tx: Tx, candidateId: string, items: GenItem[] | undefined, beat: Beat | null): Promise<void> {
  if (!items?.length) return;
  const sourceId = await derivedSourceId(tx);
  for (const i of items) {
    const externalId = sha(`${i.title}|${i.summary}`, 24);
    const [row] = await tx
      .insert(feedItems)
      .values({
        sourceId,
        externalId,
        contentHash: externalId,
        url: i.url,
        title: i.title.slice(0, 300),
        summary: i.summary,
        lang: i.lang,
        payload: i.payload,
        entities: i.entities,
        beatGuess: beat,
        status: "promoted",
        publishedAt: i.publishedAt ?? new Date(),
      })
      .onConflictDoUpdate({ target: [feedItems.sourceId, feedItems.externalId], set: { status: "promoted" } })
      .returning({ id: feedItems.id });
    await tx.insert(candidateItems).values({ candidateId, feedItemId: row.id, role: "supporting" }).onConflictDoNothing();
  }
}

/** A regenerated draft brings its own numbers: the old computed items are unlinked first. */
export async function replaceDerived(tx: Tx, candidateId: string, items: GenItem[] | undefined, beat: Beat | null): Promise<void> {
  const old = await tx
    .select({ id: feedItems.id })
    .from(candidateItems)
    .innerJoin(feedItems, eq(candidateItems.feedItemId, feedItems.id))
    .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
    .where(and(eq(candidateItems.candidateId, candidateId), eq(feedSources.slug, DERIVED_SOURCE.slug)));
  if (old.length) await tx.delete(candidateItems).where(and(eq(candidateItems.candidateId, candidateId), inArray(candidateItems.feedItemId, old.map((o) => o.id))));
  await saveDerived(tx, candidateId, items, beat);
}
