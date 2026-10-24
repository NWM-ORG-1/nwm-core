import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { telegramLinks } from "@/db/schema";
import { SITE } from "@/lib/site";
import { requireStaff } from "@/server/auth";
import { newsroomBotToken, telegramClient } from "@/server/telegram/api";

/** 설정 → 텔레그램: is the bot set up, is its webhook healthy, is this editor linked. Never the token. */

export interface TelegramPanelData {
  configured: boolean;
  bot: string | null;
  webhook: { ok: boolean; pending: number; lastError: string | null; lastErrorAt: string | null } | null;
  link: { username: string | null; linkedAt: string; notify: boolean } | null;
}

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
  last_error_date?: number;
}

/** A slow Telegram must not hold up the settings page. */
const within = <T>(p: Promise<T>, ms = 4000) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);

export async function getTelegramPanel(): Promise<TelegramPanelData> {
  await connection();
  const me = await requireStaff();
  const row = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.staffId, me.id) });
  const link = row?.linkedAt ? { username: row.tgUsername, linkedAt: row.linkedAt.toISOString(), notify: row.notify } : null;
  const tg = telegramClient(newsroomBotToken());
  if (!tg) return { configured: false, bot: null, webhook: null, link };
  const [info, hook] = await Promise.all([within(tg.call<{ username: string }>("getMe", {})), within(tg.call<WebhookInfo>("getWebhookInfo", {}))]);
  return {
    configured: true,
    bot: info?.username ?? null,
    webhook: hook
      ? {
          ok: hook.url === `${SITE.url}/api/telegram`,
          pending: hook.pending_update_count,
          lastError: hook.last_error_message ?? null,
          lastErrorAt: hook.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
        }
      : null,
    link,
  };
}
