import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { SLUG_RE } from "@/data/public";

/**
 * Cookieless reading signals: view / read (reached the end) / next (moved on).
 * Feeds article stats and the newsroom dashboard. No personal data is stored.
 */
const body = z.object({
  slug: z.string().regex(SLUG_RE),
  ev: z.enum(["view", "read", "next"]),
  dwell: z.number().min(0).max(3_600_000).optional(),
});

const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n += 1;
  return h.n > 120;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return new Response(null, { status: 429 });
  let parsed;
  try {
    parsed = body.parse(JSON.parse(await req.text()));
  } catch {
    return new Response(null, { status: 400 });
  }
  const { slug, ev, dwell = 0 } = parsed;
  await db.execute(sql`
    insert into article_stats_daily (article_id, day, views, reads, nexts, dwell_ms)
    select a.id, (now() at time zone 'Asia/Seoul')::date,
           ${ev === "view" ? 1 : 0}, ${ev === "read" ? 1 : 0}, ${ev === "next" ? 1 : 0}, ${Math.round(dwell)}
      from articles a where a.slug = ${slug} and a.status = 'published'
    on conflict (article_id, day) do update set
      views = article_stats_daily.views + excluded.views,
      reads = article_stats_daily.reads + excluded.reads,
      nexts = article_stats_daily.nexts + excluded.nexts,
      dwell_ms = article_stats_daily.dwell_ms + excluded.dwell_ms`);
  return new Response(null, { status: 204 });
}
