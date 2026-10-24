import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { feedItems } from "@/db/schema";
import { payloadBody } from "@/ingest/body";
import type { BodyFetcher } from "@/ingest/fetch-body";

/**
 * Before the desk writes from a feed item that came with little more than a
 * title, it reads the article itself: public-sector press pages always,
 * company sources once their licence is reviewed and allows commercial use.
 * The text is kept in the item's payload (`body`), so the editor's AI
 * buttons and later runs see it too; a failed attempt is not repeated.
 */

/** a feed summary shorter than this is "a title and a line" */
export const THIN_CHARS = 300;
/** less material than this (about one sentence beyond the headline) and the desk does not write the story */
export const MIN_MATERIAL = 30;
// "자세한 내용은 첨부파일을 참고하시기 바랍니다" says nothing about the story
const BOILERPLATE = /[^.。]*(첨부|붙임|별첨)[^.。]*(참고|참조|확인)[^.。]*[.。]?/g;

const PUBLIC_HOST = /(\.go\.kr|\.gov|(^|\.)(bok|boho|kisa|krcert|fss|kdi|kif)\.or\.kr)$/i;

export interface EnrichItem {
  id: string;
  url: string | null;
  summary: string;
  payload: Record<string, unknown>;
  source: { adapter: string; trustTier: number; signalOnly: boolean; licReviewedAt: Date | null; licCommercialOk: boolean | null };
}

export function mayFetchBody(i: EnrichItem): boolean {
  if (!i.url || i.source.signalOnly || i.source.trustTier !== 1 || i.source.adapter !== "rss") return false;
  if (i.summary.length >= THIN_CHARS || payloadBody(i.payload) || i.payload.bodyTried) return false;
  let host: string;
  try {
    host = new URL(i.url).hostname;
  } catch {
    return false;
  }
  return PUBLIC_HOST.test(host) || (i.source.licReviewedAt != null && i.source.licCommercialOk === true);
}

/** Fetches what is missing and stores it; returns how many items gained a body. */
export async function enrichItems(db: DB, items: EnrichItem[], fetchBody: BodyFetcher, now: Date): Promise<number> {
  let gained = 0;
  for (const it of items) {
    if (!mayFetchBody(it)) continue;
    const got = await fetchBody(it.url!).catch(() => null);
    const patch: Record<string, string> = got ? { body: got.text, bodyFrom: got.from, bodyUrl: got.url, bodyAt: now.toISOString() } : { bodyTried: now.toISOString() };
    await db
      .update(feedItems)
      .set({ payload: sql`${feedItems.payload} || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(feedItems.id, it.id));
    it.payload = { ...it.payload, ...patch };
    if (got) gained++;
  }
  return gained;
}

/** Characters of real material — feed summaries plus fetched article text — in the items the model may use. */
export function materialChars(items: Array<Pick<EnrichItem, "summary" | "payload" | "source"> & { title: string }>): number {
  const summary = (i: { title: string; summary: string }) => (i.summary.trim() === i.title.trim() ? 0 : i.summary.replace(BOILERPLATE, "").trim().length);
  return items.filter((i) => !i.source.signalOnly).reduce((n, i) => n + summary(i) + payloadBody(i.payload).length, 0);
}
