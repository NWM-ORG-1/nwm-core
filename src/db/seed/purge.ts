import { sql } from "drizzle-orm";
import type { DB } from "../client";

type Q = Pick<DB, "execute">;

/**
 * Removes every sample row. Real newsroom data is untouched. Sample staff who
 * edited real articles are kept (the named-editor constraint must hold).
 */
export async function purgeSamples(q: Q) {
  await q.execute(sql`delete from activity_log where meta->>'sample' = 'true'`);
  await q.execute(sql`delete from correction_requests where is_sample`);
  await q.execute(sql`delete from articles where is_sample`);
  await q.execute(sql`delete from candidates where is_sample`);
  await q.execute(sql`delete from feed_items where is_sample`);
  await q.execute(sql`delete from feed_sources where is_sample`);
  await q.execute(sql`delete from experiments where is_sample`);
  await q.execute(sql`delete from stories where is_sample`);
  await q.execute(sql`
    delete from staff s where s.is_sample
      and not exists (select 1 from articles a where a.editor_id = s.id or a.author_id = s.id)`);
  await q.execute(sql`delete from sentiment_snapshots where is_sample`);
  await q.execute(sql`delete from market_quotes where source = 'mock'`);
}
