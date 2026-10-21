import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { SLUG_RE } from "@/data/public";
import { clientIp, WindowCounter } from "@/server/rate-limit";

/**
 * Cookieless reading signals: view / read (reached the end) / next (moved on).
 * Feeds article stats and the newsroom dashboard. No personal data is stored.
 */
const body = z.object({
  slug: z.string().regex(SLUG_RE),
  ev: z.enum(["view", "read", "next"]),
  dwell: z.number().min(0).max(3_600_000).optional(),
});

const perIp = new WindowCounter(60_000, 5_000);
// One view / read / next per reader, article and event in 30 minutes; repeats are no-ops.
const seen = new WindowCounter(30 * 60_000, 50_000);
const quiet = () => new Response(null, { status: 204 });
const originHost = (o: string) => {
  try {
    return new URL(o).host;
  } catch {
    return null; // "null" origins (sandboxed frames) never match
  }
};

export async function POST(req: NextRequest) {
  // Counted only from our own pages; other sites get a quiet no-op.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return quiet();
  const origin = req.headers.get("origin");
  if (origin && originHost(origin) !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) return quiet();

  const ip = clientIp(req.headers);
  if (perIp.hit(ip) > 30) return new Response(null, { status: 429 });
  let parsed;
  try {
    parsed = body.parse(JSON.parse(await req.text()));
  } catch {
    return new Response(null, { status: 400 });
  }
  const { slug, ev, dwell = 0 } = parsed;
  if (seen.hit(`${ip}|${slug}|${ev}`) > 1) return quiet();
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
  return quiet();
}
