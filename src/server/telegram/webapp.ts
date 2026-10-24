import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The newsroom bot's Telegram Mini App (the card's 미리보기 button). Telegram
 * opens the page with `initData` signed by a key derived from the bot token;
 * a valid one names the Telegram user, and an active editor linked to that
 * user gets a short-lived ticket for one draft. Inside Telegram nobody types
 * a password, and the page opened anywhere else, or by anyone else, shows
 * nothing. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

/**
 * Telegram makes fresh initData each time the button is pressed; older data is refused.
 * The page keeps it in the tab (sessionStorage) so a reload signs in again within this hour.
 */
export const INIT_DATA_MAX_AGE_SEC = 3600;
/** a ticket is spent on the page load right after it is made, then taken off the address */
export const TICKET_SEC = 5 * 60;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MiniAppUser {
  id: number;
  username?: string;
}

export function verifyInitData(initData: string, botToken: string, now = new Date(), maxAgeSec = INIT_DATA_MAX_AGE_SEC): MiniAppUser | null {
  if (!initData || initData.length > 8192 || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");
  // every other field, sorted by key, as key=value lines (the signature field included)
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", key).update(dataCheck).digest();
  if (!timingSafeEqual(Buffer.from(hash, "hex"), expected)) return null;

  const at = Number(params.get("auth_date"));
  const nowSec = now.getTime() / 1000;
  if (!Number.isFinite(at) || nowSec - at > maxAgeSec || at - nowSec > 300) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "null") as { id?: unknown; username?: unknown } | null;
    if (typeof user?.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    return { id: user.id, ...(typeof user.username === "string" ? { username: user.username } : {}) };
  } catch {
    return null;
  }
}

export interface Ticket {
  tgUserId: number;
  staffId: string;
  candidateId: string;
  /** Unix seconds */
  exp: number;
}

function sign(body: string, botToken: string): string {
  const key = createHmac("sha256", "NwmMiniAppTicket").update(botToken).digest();
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** "<Telegram user>.<editor>.<draft>.<expiry>.<signature>" — opens one draft's preview for five minutes */
export function makeTicket(t: Omit<Ticket, "exp">, botToken: string, now = new Date()): string {
  const body = `${t.tgUserId}.${t.staffId.toLowerCase()}.${t.candidateId.toLowerCase()}.${Math.floor(now.getTime() / 1000) + TICKET_SEC}`;
  return `${body}.${sign(body, botToken)}`;
}

export function readTicket(ticket: string | null | undefined, botToken: string, now = new Date()): Ticket | null {
  const m = /^(\d{1,16})\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(ticket ?? "");
  if (!m || !botToken || !UUID.test(m[2]) || !UUID.test(m[3])) return null;
  const want = Buffer.from(sign(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`, botToken));
  const got = Buffer.from(m[5]);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const exp = Number(m[4]);
  if (exp <= now.getTime() / 1000) return null;
  return { tgUserId: Number(m[1]), staffId: m[2], candidateId: m[3], exp };
}
