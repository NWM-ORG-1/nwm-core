import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Job } from "../jobs";

/**
 * Daily clean-up (04:30 KST). Keeps the database small and honours source
 * licences: items past their retention go, post text goes after a week
 * (scores and counts stay), the run log keeps two weeks.
 */
export const retentionJob: Job = {
  name: "retention",
  everySec: 86_400,
  offsetSec: 19 * 3600 + 30 * 60, // 19:30 UTC
  async run() {
    const unlinked = sql`not exists (select 1 from candidate_items ci where ci.feed_item_id = fi.id)`;
    const expired = await db.execute(sql`
      delete from feed_items fi
      where fi.is_sample = false and fi.expires_at < now() and ${unlinked}`);
    const stale = await db.execute(sql`
      delete from feed_items fi
      where fi.is_sample = false and fi.status <> 'promoted'
        and fi.fetched_at < now() - interval '45 days' and ${unlinked}`);
    const purgedText = await db.execute(sql`
      update social_posts set text = null
      where text is not null and fetched_at < now() - interval '7 days'`);
    const oldPosts = await db.execute(sql`delete from social_posts where posted_at < now() - interval '120 days'`);
    const runs = await db.execute(sql`delete from ingest_runs where started_at < now() - interval '14 days'`);
    const metrics = await db.execute(sql`delete from market_metrics where at < now() - interval '400 days'`);
    const n = (r: { count?: number }) => r.count ?? 0;
    return {
      updated: n(purgedText),
      note: `items −${n(expired) + n(stale)}, posts −${n(oldPosts)} (text purged ${n(purgedText)}), runs −${n(runs)}, metrics −${n(metrics)}`,
    };
  },
};
