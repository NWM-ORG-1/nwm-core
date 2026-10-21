/**
 * Applies SQL migrations from ./drizzle under a Postgres advisory lock so that
 * concurrent builds/deploys never race. Additive (expand/contract) migrations only.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db, rawSql } from "../src/db/client";

const LOCK_KEY = 7274;

async function main() {
  const sql = rawSql();
  const reserved = await sql.reserve();
  try {
    await reserved`select pg_advisory_lock(${LOCK_KEY})`;
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await reserved`select pg_advisory_unlock(${LOCK_KEY})`;
    reserved.release();
    await closeDb();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err);
  process.exit(1);
});
