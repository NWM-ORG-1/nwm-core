/** Removes all sample (demo) content before launch: `npm run db:purge-samples` */
import { closeDb, db } from "../src/db/client";
import { purgeSamples } from "../src/db/seed/purge";

db.transaction(async (tx) => purgeSamples(tx))
  .then(() => console.log("✓ sample content removed"))
  .catch((err) => {
    console.error("✗ purge failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
