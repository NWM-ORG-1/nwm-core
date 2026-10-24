import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { SITE } from "@/lib/site";
import { internalAuthorized } from "@/server/internal-auth";
import { telegramClient } from "@/server/telegram/api";
import { telegramTick } from "@/server/telegram/notify";

/** Draft cards for linked editors and their updates. Called every minute by instrumentation.ts. */
let running = false;

export async function POST(req: NextRequest) {
  if (!internalAuthorized(req.headers.get("authorization"))) return new Response(null, { status: 401 });
  const tg = telegramClient();
  if (!tg) return Response.json({ skipped: "NEWSROOM_TELEGRAM_BOT_TOKEN is not set" });
  if (running) return Response.json({ skipped: "previous tick still running" });
  running = true;
  try {
    return Response.json(await telegramTick({ db, tg, site: SITE.url }));
  } catch (e) {
    console.error("[telegram] tick failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "tick failed" }, { status: 500 });
  } finally {
    running = false;
  }
}
