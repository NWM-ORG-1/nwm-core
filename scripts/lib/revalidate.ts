/**
 * Tells a running server to drop cached pages after a script changed public data
 * (seed, purge). Uses the same bearer route as the phase-2 feed workers.
 * Without a reachable server (local build, Docker build) it only warns: pages then
 * refresh on their own revalidate window.
 */
import { T } from "../../src/lib/cache-tags";

export const ALL_LIST_TAGS = [T.feed, T.site, T.rel, T.editors, T.corrections, T.quotes, T.sentiment];

export async function revalidateLive(tags: string[]) {
  const base = process.env.REVALIDATE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!base || !secret) {
    console.warn("• live caches not refreshed: set NEXT_PUBLIC_SITE_URL (or REVALIDATE_URL) and INTERNAL_API_SECRET");
    return;
  }
  const unique = [...new Set(tags)];
  try {
    for (let i = 0; i < unique.length; i += 64) {
      const res = await fetch(new URL("/api/internal/revalidate", base), {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ tags: unique.slice(i, i + 64) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    console.log(`✓ live caches refreshed (${unique.length} tags) at ${base}`);
  } catch (err) {
    console.warn(`• live caches not refreshed (${base}): ${(err as Error).message}. Pages update within their revalidate window.`);
  }
}
