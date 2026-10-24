import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The newsroom signed in through the bot's Mini App (the card's 편집기 button):
 * a cookie naming the Telegram user and the editor it is linked to, signed with
 * a key derived from the bot token. proxy.ts checks the signature; every data
 * loader and Server Action (requireStaff) also checks that the link, the
 * editor and their login still stand. No "server-only" here: proxy.ts reads it.
 */

export const SESSION_COOKIE = "nwm_tg";
export const SESSION_SEC = 12 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TelegramSession {
  tgUserId: number;
  staffId: string;
  /** Unix seconds */
  exp: number;
}

export function sessionBotToken(env: Record<string, string | undefined> = process.env): string | null {
  return env.NEWSROOM_TELEGRAM_BOT_TOKEN?.trim() || null;
}

function sign(body: string, botToken: string): string {
  const key = createHmac("sha256", "NwmMiniAppSession").update(botToken).digest();
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** "<Telegram user>.<editor>.<expiry>.<signature>" */
export function makeSession(s: Omit<TelegramSession, "exp">, botToken: string, now = new Date()): string {
  const body = `${s.tgUserId}.${s.staffId.toLowerCase()}.${Math.floor(now.getTime() / 1000) + SESSION_SEC}`;
  return `${body}.${sign(body, botToken)}`;
}

export function readSession(value: string | null | undefined, botToken: string | null, now = new Date()): TelegramSession | null {
  const m = /^(\d{1,16})\.([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!m || !botToken || !UUID.test(m[2])) return null;
  const want = Buffer.from(sign(`${m[1]}.${m[2]}.${m[3]}`, botToken));
  const got = Buffer.from(m[4]);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const exp = Number(m[3]);
  if (exp <= now.getTime() / 1000) return null;
  return { tgUserId: Number(m[1]), staffId: m[2], exp };
}
