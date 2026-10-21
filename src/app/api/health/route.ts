import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";

export async function GET() {
  await connection();
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db timeout")), 2000)),
    ]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
