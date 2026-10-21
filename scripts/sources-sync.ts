/**
 * Adds the catalog's feed sources (src/ingest/catalog) to the database.
 *
 *   npm run sources:sync              insert sources never seen before
 *   npm run sources:sync -- --update  also re-apply catalog fields to catalog rows
 *   npm run sources:sync -- --dry     show what would change
 */
import { closeDb } from "../src/db/client";
import { syncCatalog } from "../src/ingest/catalog/sync";

async function main() {
  const update = process.argv.includes("--update");
  const dryRun = process.argv.includes("--dry");
  const r = await syncCatalog({ update, dryRun });
  const tag = dryRun ? " (dry run)" : "";
  console.log(`✓ catalog sync${tag}: +${r.inserted.length} inserted, ${r.updated.length} updated, ${r.skipped.length} skipped`);
  if (r.inserted.length) console.log(`  inserted: ${r.inserted.join(", ")}`);
  if (r.updated.length) console.log(`  updated: ${r.updated.join(", ")}`);
  if (r.skipped.length) console.log(`  skipped (deleted earlier or edited by hand): ${r.skipped.join(", ")}`);
}

main()
  .catch((err) => {
    console.error("✗ catalog sync failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
