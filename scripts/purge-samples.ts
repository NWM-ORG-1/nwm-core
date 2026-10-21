/** Removes all sample (demo) content before launch: `npm run db:purge-samples` */
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { siteSettings } from "../src/db/schema";
import { purgeSamples } from "../src/db/seed/purge";
import { T } from "../src/lib/cache-tags";
import { ALL_LIST_TAGS, revalidateLive } from "./lib/revalidate";

async function main() {
  const { slugs, storyIds } = await db.transaction(async (tx) => {
    // what is about to disappear, so its cached pages can be dropped too
    const a = await tx.execute<{ slug: string }>(sql`select slug from articles where is_sample`);
    const st = await tx.execute<{ id: string }>(sql`select id from stories where is_sample`);
    await purgeSamples(tx);
    // `db:seed --if-empty` (first-deploy builds) must never bring the samples back
    await tx
      .insert(siteSettings)
      .values({ key: "samples_purged", value: { at: new Date().toISOString() } })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: { at: new Date().toISOString() } } });
    return { slugs: a.map((r) => r.slug), storyIds: st.map((r) => r.id) };
  });
  console.log(`✓ sample content removed (${slugs.length} articles, ${storyIds.length} stories)`);
  await revalidateLive([...ALL_LIST_TAGS, ...slugs.map(T.article), ...storyIds.map(T.story)]);
}

main()
  .catch((err) => {
    console.error("✗ purge failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
