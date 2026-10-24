"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { telegramLinks } from "@/db/schema";
import { SITE } from "@/lib/site";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { NewsroomError } from "../newsroom";
import { newsroomBotToken, telegramClient, TelegramError, webhookSecret, type TgClient } from "../telegram/api";
import { createLinkCode, unlinkTelegram } from "../telegram/links";
import { fail, ok, type ActionState } from "./result";

function bot(): { token: string; tg: TgClient } {
  const token = newsroomBotToken();
  const tg = telegramClient(token);
  if (!token || !tg) throw new NewsroomError("NEWSROOM_TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.", "invalid");
  return { token, tg };
}

/** Telegram's own refusals are worth showing; the request never contains secrets in its message. */
function telegramFail(e: unknown) {
  return fail(e instanceof TelegramError ? new NewsroomError(`텔레그램: ${e.message}`, "invalid") : e);
}

/** Points the bot at this site and makes a one-time link for the signed-in editor. */
export async function createTelegramLink(): Promise<ActionState<{ url: string; expiresAt: string }>> {
  try {
    const me = await requireStaff();
    const { token, tg } = bot();
    if (!SITE.url.startsWith("https://")) throw new NewsroomError("텔레그램 웹훅은 https 주소만 받습니다 (NEXT_PUBLIC_SITE_URL).", "invalid");
    await tg.call("setWebhook", { url: `${SITE.url}/api/telegram`, secret_token: webhookSecret(token), allowed_updates: ["message", "callback_query"] });
    const info = await tg.call<{ username: string }>("getMe", {});
    const { code, expiresAt } = await createLinkCode(db, me.id);
    return ok(undefined, { url: `https://t.me/${info.username}?start=${code}`, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    return telegramFail(e);
  }
}

export async function unlinkMyTelegram(): Promise<ActionState> {
  try {
    const me = await requireStaff();
    await unlinkTelegram(db, me.id);
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "telegram", summary: "텔레그램 연결 해제" });
    refresh();
    return ok("연결을 끊었습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function setMyTelegramNotify(input: { on: boolean }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ on: z.boolean() }).parse(input);
    await db.update(telegramLinks).set({ notify: p.on }).where(eq(telegramLinks.staffId, me.id));
    refresh();
    return ok(p.on ? "새 초안 알림을 받습니다." : "새 초안 알림을 껐습니다.");
  } catch (e) {
    return fail(e);
  }
}

export async function sendTelegramTest(): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const { tg } = bot();
    const link = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.staffId, me.id) });
    if (!link?.chatId) throw new NewsroomError("아직 텔레그램과 연결되지 않았습니다.", "state");
    await tg.call("sendMessage", { chat_id: link.chatId, text: "뉴스룸에서 보낸 테스트 메시지입니다. 이 채팅으로 초안 카드가 옵니다." });
    return ok("보냈습니다. 텔레그램을 확인하세요.");
  } catch (e) {
    return telegramFail(e);
  }
}
