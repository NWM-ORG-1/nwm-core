/**
 * Article text the AI desk fetched for a feed item that came with only a title
 * (src/ingest/fetch-body.ts). It lives in feed_items.payload under these keys.
 */
export const BODY_KEYS = ["body", "bodyFrom", "bodyUrl", "bodyAt", "bodyTried"] as const;

export function payloadBody(p: Record<string, unknown> | null | undefined): string {
  const b = p?.body;
  return typeof b === "string" ? b : "";
}
