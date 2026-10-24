import "server-only";
import { and, eq, gte, inArray, ne, notExists, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { candidates, telegramMessages } from "@/db/schema";
import type { TgClient } from "./api";
import { loadCard, outcomeOf, refreshCard, sendCard, settleCards } from "./bot";
import { notifyChats } from "./links";

/**
 * Every minute (web scheduler, /api/internal/telegram-tick):
 *  - a card to each linked editor for every draft that reached 검토 from the
 *    AI desk or an automatic article type in the last 24 hours
 *  - cards whose draft was published, rejected, scheduled or edited in the
 *    newsroom are brought up to date
 */

const WINDOW_HOURS = 24;
const CARDS_PER_TICK = 12;

export async function telegramTick(d: { db: DB; tg: TgClient; site: string; pauseMs?: number }, now = new Date()): Promise<{ sent: number; updated: number }> {
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let sent = 0;
  for (const { chatId } of await notifyChats(d.db)) {
    const due = await d.db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.status, "review"),
          eq(candidates.isSample, false),
          gte(candidates.createdAt, new Date(now.getTime() - WINDOW_HOURS * 3_600_000)),
          or(sql`${candidates.generator} ? 'desk'`, sql`${candidates.generator}->>'id' like 'template:%'`),
          notExists(
            d.db
              .select({ one: sql`1` })
              .from(telegramMessages)
              .where(and(eq(telegramMessages.candidateId, candidates.id), eq(telegramMessages.chatId, chatId), eq(telegramMessages.kind, "card"))),
          ),
        ),
      )
      .orderBy(candidates.createdAt)
      .limit(CARDS_PER_TICK);
    for (const r of due) {
      const c = await loadCard(d.db, r.id);
      if (!c) continue;
      await sendCard(d, chatId, c);
      sent++;
      // Telegram asks for about one message a second per chat
      await pause(d.pauseMs ?? 1100);
    }
  }

  // cards whose draft moved on in the newsroom
  const stale = await d.db
    .select({ id: telegramMessages.id, candidateId: telegramMessages.candidateId, chatId: telegramMessages.chatId, messageId: telegramMessages.messageId })
    .from(telegramMessages)
    .innerJoin(candidates, eq(candidates.id, telegramMessages.candidateId))
    .where(
      and(
        eq(telegramMessages.kind, "card"),
        ne(telegramMessages.state, "done"),
        or(
          inArray(candidates.status, ["published", "rejected"]),
          and(eq(telegramMessages.state, "open"), eq(candidates.status, "scheduled")),
          and(eq(telegramMessages.state, "waiting"), ne(candidates.status, "scheduled")),
          ne(candidates.lockVersion, telegramMessages.lockVersion),
        ),
      ),
    )
    .limit(30);
  let updated = 0;
  const settled = new Set<string>();
  for (const m of stale) {
    if (!m.candidateId || settled.has(m.candidateId)) continue;
    const c = await loadCard(d.db, m.candidateId);
    if (!c) continue;
    if (c.status === "published" || c.status === "rejected") {
      await settleCards(d, c, outcomeOf(c)!);
      settled.add(c.candidateId);
    } else {
      await refreshCard(d, m, c);
    }
    updated++;
  }
  return { sent, updated };
}
