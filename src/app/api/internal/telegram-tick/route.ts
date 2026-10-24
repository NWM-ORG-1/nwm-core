import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { SITE } from "@/lib/site";
import { internalAuthorized } from "@/server/internal-auth";
import { telegramClient } from "@/server/telegram/api";
import { BOT_COMMANDS } from "@/server/telegram/format";
import { telegramTick } from "@/server/telegram/notify";

/** Draft cards for linked editors and their updates. Called every minute by instrumentation.ts. */
let running = false;
/** the command menu follows the code: set once per deploy, so a bot linked earlier gets new commands too */
let commandsSet = false;

export async function POST(req: NextRequest) {
  if (!internalAuthorized(req.headers.get("authorization"))) return new Response(null, { status: 401 });
  const tg = telegramClient();
  if (!tg) return Response.json({ skipped: "NEWSROOM_TELEGRAM_BOT_TOKEN is not set" });
  if (running) return Response.json({ skipped: "previous tick still running" });
  running = true;
  try {
    if (!commandsSet) {
      await tg.call("setMyCommands", { commands: BOT_COMMANDS }).catch((e) => console.error("[telegram] setMyCommands failed:", e instanceof Error ? e.message : e));
      commandsSet = true;
    }
    return Response.json(await telegramTick({ db, tg, site: SITE.url }));
  } catch (e) {
    console.error("[telegram] tick failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "tick failed" }, { status: 500 });
  } finally {
    running = false;
  }
}
