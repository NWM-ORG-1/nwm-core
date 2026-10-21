import "server-only";
import { revalidateTag, updateTag } from "next/cache";

/** From a Server Action: expire now; the editor's next read waits for fresh data. */
export function invalidateFromAction(tags: Iterable<string>) {
  for (const t of new Set(tags)) updateTag(t);
}

/**
 * Background refresh: stale content keeps being served while it re-renders.
 * Used for related-article rails after a publish (not urgent, touches every article page).
 */
export function refreshInBackground(tags: Iterable<string>) {
  for (const t of new Set(tags)) revalidateTag(t, "max");
}

/** From a Route Handler (scheduler, workers): `updateTag` is action-only. */
export function invalidateFromRoute(tags: Iterable<string>) {
  for (const t of new Set(tags)) revalidateTag(t, { expire: 0 });
}

/**
 * CDN purge hook. No-op until a CDN is put in front of HTML (phase 2):
 * set CDN_PURGE_URL + CDN_PURGE_TOKEN and adapt the payload to the provider.
 */
export async function cdnPurge(paths: Iterable<string>) {
  const url = process.env.CDN_PURGE_URL;
  const token = process.env.CDN_PURGE_TOKEN;
  const list = [...new Set(paths)];
  if (!url || !token || list.length === 0) return;
  try {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ files: list.map((p) => `${site}${p}`) }),
    });
  } catch (err) {
    console.error("[cdn] purge failed", err);
  }
}
