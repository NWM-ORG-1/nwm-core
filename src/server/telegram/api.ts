import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Telegram Bot API client for the newsroom bot. The token
 * (NEWSROOM_TELEGRAM_BOT_TOKEN, web service) is part of every request URL, so
 * errors carry Telegram's description or the kind of failure, never the URL.
 */

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type InlineKeyboard = InlineButton[][];

export interface TgClient {
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export function newsroomBotToken(env: Record<string, string | undefined> = process.env): string | null {
  return env.NEWSROOM_TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function telegramClient(token = newsroomBotToken()): TgClient | null {
  if (!token) return null;
  return {
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      let res: Response;
      try {
        res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        throw new TelegramError(`텔레그램에 연결하지 못했습니다 (${e instanceof Error ? e.name : "error"})`);
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
      if (!body?.ok) throw new TelegramError(body?.description ?? `HTTP ${res.status}`, body?.error_code ?? res.status);
      return body.result as T;
    },
  };
}

/** The webhook's secret_token, derived from the bot token: nothing more to configure. */
export function webhookSecret(token: string): string {
  return createHmac("sha256", token).update("nwm-newsroom-webhook").digest("hex");
}

export function validWebhookSecret(header: string | null, token: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(webhookSecret(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "message is not modified" is Telegram's answer to an edit that changes nothing. */
export function unchanged(e: unknown): boolean {
  return e instanceof TelegramError && /not modified/i.test(e.message);
}
