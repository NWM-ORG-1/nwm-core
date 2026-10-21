/** Development only: drops every table and re-applies migrations. */
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";

async function main() {
  if (process.env.NODE_ENV === "production" || /railway|rlwy/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("db:reset refuses to run against a production database");
  }
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  console.log("✓ schema dropped — run `npm run db:migrate && npm run db:seed`");
}

main()
  .catch((err) => {
    console.error("✗", err.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
