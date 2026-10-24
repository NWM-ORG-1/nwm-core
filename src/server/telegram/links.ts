import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { staff, telegramLinks } from "@/db/schema";
import type { StaffRow } from "../auth";

/**
 * Newsroom accounts linked to Telegram users. An editor makes a one-time code
 * in the newsroom (15 minutes); opening t.me/<bot>?start=<code> links the
 * Telegram user who opened it. Only a hash of the code is stored.
 */

export const LINK_CODE_MINUTES = 15;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export async function createLinkCode(db: DB, staffId: string, now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const code = randomBytes(18).toString("base64url"); // 24 characters, allowed in a /start parameter
  const expiresAt = new Date(now.getTime() + LINK_CODE_MINUTES * 60_000);
  await db
    .insert(telegramLinks)
    .values({ staffId, codeHash: hash(code), codeExpiresAt: expiresAt })
    .onConflictDoUpdate({ target: telegramLinks.staffId, set: { codeHash: hash(code), codeExpiresAt: expiresAt } });
  return { code, expiresAt };
}

/** /start <code>: links this Telegram user (and only this one) to the editor who made the code. */
export async function linkWithCode(
  db: DB,
  code: string,
  tg: { userId: number; chatId: number; username: string | null },
  now = new Date(),
): Promise<StaffRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(telegramLinks)
      .where(and(eq(telegramLinks.codeHash, hash(code)), gt(telegramLinks.codeExpiresAt, now)))
      .for("update");
    if (!row) return null;
    const me = await tx.query.staff.findFirst({ where: eq(staff.id, row.staffId) });
    if (!me?.active) return null;
    // one Telegram user acts for one editor
    await tx
      .update(telegramLinks)
      .set({ tgUserId: null, chatId: null, tgUsername: null, linkedAt: null })
      .where(and(eq(telegramLinks.tgUserId, tg.userId), ne(telegramLinks.staffId, row.staffId)));
    await tx
      .update(telegramLinks)
      .set({ tgUserId: tg.userId, chatId: tg.chatId, tgUsername: tg.username, linkedAt: now, codeHash: null, codeExpiresAt: null })
      .where(eq(telegramLinks.staffId, row.staffId));
    return me;
  });
}

/** The active editor a Telegram user acts for, and their chat. */
export async function linkedEditor(db: DB, tgUserId: number): Promise<{ me: StaffRow; chatId: number } | null> {
  const [row] = await db
    .select({ me: staff, chatId: telegramLinks.chatId })
    .from(telegramLinks)
    .innerJoin(staff, eq(staff.id, telegramLinks.staffId))
    .where(and(eq(telegramLinks.tgUserId, tgUserId), eq(staff.active, true)))
    .limit(1);
  return row?.chatId != null ? { me: row.me, chatId: row.chatId } : null;
}

export async function unlinkTelegram(db: DB, staffId: string): Promise<void> {
  await db
    .update(telegramLinks)
    .set({ tgUserId: null, chatId: null, tgUsername: null, linkedAt: null, codeHash: null, codeExpiresAt: null })
    .where(eq(telegramLinks.staffId, staffId));
}

/** Chats that get a card for each new draft. */
export async function notifyChats(db: DB): Promise<Array<{ staffId: string; chatId: number }>> {
  const rows = await db
    .select({ staffId: telegramLinks.staffId, chatId: telegramLinks.chatId })
    .from(telegramLinks)
    .innerJoin(staff, eq(staff.id, telegramLinks.staffId))
    .where(and(isNotNull(telegramLinks.chatId), eq(telegramLinks.notify, true), eq(staff.active, true)));
  return rows.flatMap((r) => (r.chatId != null ? [{ staffId: r.staffId, chatId: r.chatId }] : []));
}
