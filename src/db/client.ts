import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

/**
 * Railway builds cannot reach the private network, so `next build` prerenders
 * over DATABASE_PUBLIC_URL; the running server always uses DATABASE_URL.
 */
export function databaseUrl(): string {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const url = (isBuild && process.env.DATABASE_PUBLIC_URL) || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env.example");
  return url;
}

const g = globalThis as unknown as { __nwmSql?: postgres.Sql; __nwmDb?: DB };

function init(): DB {
  if (g.__nwmDb) return g.__nwmDb;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const sql = postgres(databaseUrl(), {
    max: isBuild ? 3 : 10,
    idle_timeout: 20,
    connect_timeout: 5,
    onnotice: () => {},
  });
  g.__nwmSql = sql;
  g.__nwmDb = drizzle(sql, { schema, casing: "snake_case" });
  return g.__nwmDb;
}

/** Lazily connected Drizzle instance (postgres.js only opens sockets on first query). */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop, receiver) {
    return Reflect.get(init(), prop, receiver);
  },
});

export function rawSql(): postgres.Sql {
  init();
  return g.__nwmSql!;
}

export async function closeDb() {
  await g.__nwmSql?.end({ timeout: 5 });
  g.__nwmSql = undefined;
  g.__nwmDb = undefined;
}

export { schema };
