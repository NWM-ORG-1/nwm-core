import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { articles, candidates, staff, telegramLinks, telegramMessages, type Beat, type CandidateStatus, type CheckResult } from "@/db/schema";
import { draftSchema, type Draft } from "@/lib/content/blocks";
import { clockKST, dateTimeKST } from "@/lib/format";
import { logActivity } from "../activity";
import type { StaffRow } from "../auth";
import { confirmLegalAs, noteInstruction, publishAs, rejectAs, saveDraftAs } from "../candidate-ops";
import { blockingFailures } from "../checks";
import { revisable } from "../generator/claude";
import type { GenItem } from "../generator/types";
import { countPendingCases, lessonWeight, loadLessons, MAX_LESSONS, scopeLabel } from "../desk/lessons";
import { loadDeskSettings } from "../desk/settings";
import { computeChecks, isPlaceholderStaff, loadCandidateItems, NewsroomError, toGenItem, type PublishResult } from "../newsroom";
import { addLessonAs, deleteLessonAs, requestDeskRunAs, requestLessonReviewAs, saveDeskSettingsAs, setIngestPausedAs, setLessonPinnedAs } from "../ops";
import { unchanged, type InlineKeyboard, type TgClient } from "./api";
import {
  ASK_EDIT,
  ASK_REASON,
  askOverride,
  cardKeyboard,
  cardText,
  escapeHtml,
  HELP,
  NOT_LINKED,
  parseCallback,
  parseQuickEdits,
  notesKeyboard,
  notesText,
  parseControl,
  parseNoteCommand,
  REJECT_REASONS,
  settingsKeyboard,
  settingsText,
  statusKeyboard,
  statusText,
  type CardInput,
  type CardOutcome,
  type Control,
} from "./format";
import { linkedEditor, linkWithCode, unlinkTelegram } from "./links";
import { loadStatus } from "./status";

/**
 * The newsroom bot: cards for drafts in 검토, and what editors do with them.
 * Every action runs as the editor linked to the Telegram user, through the
 * same operations as the newsroom (candidate-ops), with the same checks.
 */

/* ───────────────────────── Telegram types (the parts used) ───────────────────────── */

interface TgUser {
  id: number;
  username?: string;
}
interface TgChat {
  id: number;
  type: string;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  reply_to_message?: { message_id: number };
}
interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id: number; chat: TgChat };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

export type Revise = (input: { draft: Draft; items: GenItem[]; beat: Beat; instruction: string }) => Promise<Draft>;

export interface BotDeps {
  db: DB;
  tg: TgClient;
  /** site origin for links, e.g. https://newweb.media */
  site: string;
  /** after a publish: refresh the site's caches (called in the webhook request) */
  published: (r: PublishResult) => void;
  /** AI edits from an instruction; null when Claude is not available */
  revise: Revise | null;
}
type Ctx = Pick<BotDeps, "db" | "tg" | "site">;

/** Slow work (AI edits), run after the webhook has answered Telegram. */
export type Later = () => Promise<void>;

/* ───────────────────────── cards ───────────────────────── */

export interface Card extends CardInput {
  status: CandidateStatus;
  lockVersion: number;
  slug: string | null;
  publishedAt: Date | null;
  publishedBy: string | null;
  scheduledAt: Date | null;
  rejectReason: string | null;
}

export async function loadCard(db: DB, id: string): Promise<Card | null> {
  const [r] = await db
    .select({ c: candidates, slug: articles.slug, publishedAt: articles.publishedAt, editor: staff.name })
    .from(candidates)
    .leftJoin(articles, eq(articles.id, candidates.articleId))
    .leftJoin(staff, eq(staff.id, articles.editorId))
    .where(eq(candidates.id, id))
    .limit(1);
  if (!r) return null;
  const c = r.c;
  const desk = c.generator?.desk;
  const open = c.status !== "published" && c.status !== "rejected";
  return {
    candidateId: c.id,
    draft: c.draft,
    beat: c.beat,
    mode: c.mode,
    desk: desk ? { score: desk.score, lowRisk: desk.lowRisk, explore: desk.explore } : null,
    // stored checks can be stale or missing (automatic drafts store none): what would block it now
    checks: open ? await computeChecks(db, c.id, null) : c.checks,
    aiNote: c.status === "rejected" ? null : c.aiNote,
    status: c.status,
    lockVersion: c.lockVersion,
    slug: r.slug,
    publishedAt: r.publishedAt,
    publishedBy: r.editor,
    scheduledAt: c.scheduledAt,
    rejectReason: c.status === "rejected" && c.aiNote?.startsWith("반려: ") ? c.aiNote.slice(4) : null,
  };
}

/** What a card should say it came to, or null while the draft is still open. */
export function outcomeOf(c: Card): CardOutcome | null {
  if (c.status === "published") return { kind: "published", by: c.publishedBy, at: c.publishedAt ? dateTimeKST(c.publishedAt) : "" };
  if (c.status === "rejected") return { kind: "rejected", reason: c.rejectReason ?? "", by: null };
  if (c.status === "scheduled" && c.scheduledAt) return { kind: "scheduled", at: dateTimeKST(c.scheduledAt) };
  return null;
}

const HTML = { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as const;

async function send(d: Ctx, chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<number> {
  const m = await d.tg.call<{ message_id: number }>("sendMessage", { chat_id: chatId, text, ...HTML, ...extra });
  return m.message_id;
}

const keyboardFor = (d: Ctx, c: Card, mode: Parameters<typeof cardKeyboard>[1]) =>
  cardKeyboard({ candidateId: c.candidateId, lockVersion: c.lockVersion, site: d.site, slug: c.slug }, mode);

export async function sendCard(d: Ctx, chatId: number, c: Card): Promise<void> {
  const messageId = await send(d, chatId, cardText(c), { reply_markup: { inline_keyboard: keyboardFor(d, c, "open") } });
  await d.db.insert(telegramMessages).values({ candidateId: c.candidateId, chatId, messageId, kind: "card", lockVersion: c.lockVersion });
}

/** Rewrites a card (text and buttons); a deleted or unchanged message is not an error. */
async function editCard(d: Ctx, chatId: number, messageId: number, text: string, keyboard: InlineKeyboard): Promise<void> {
  try {
    await d.tg.call("editMessageText", { chat_id: chatId, message_id: messageId, text, ...HTML, reply_markup: { inline_keyboard: keyboard } });
  } catch (e) {
    if (!unchanged(e)) console.error("[telegram] could not update a card:", e instanceof Error ? e.message : e);
  }
}

async function setKeyboard(d: Ctx, chatId: number, messageId: number, keyboard: InlineKeyboard): Promise<void> {
  try {
    await d.tg.call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
  } catch (e) {
    if (!unchanged(e)) throw e;
  }
}

/** Shows the outcome on every open card of this candidate, in every editor's chat. */
export async function settleCards(d: Ctx, c: Card, outcome: CardOutcome): Promise<void> {
  const open = await d.db
    .select()
    .from(telegramMessages)
    .where(and(eq(telegramMessages.candidateId, c.candidateId), ne(telegramMessages.state, "done")));
  for (const m of open) {
    if (m.kind === "card") await editCard(d, m.chatId, m.messageId, cardText(c, outcome), keyboardFor(d, c, "done"));
    await d.db.update(telegramMessages).set({ state: "done" }).where(eq(telegramMessages.id, m.id));
  }
}

/** A card brought up to date in place: the current draft and open buttons, or a scheduled note while it waits. */
export async function refreshCard(d: Ctx, m: { id: string; chatId: number; messageId: number }, c: Card): Promise<void> {
  const scheduled = c.status === "scheduled" && c.scheduledAt;
  await editCard(d, m.chatId, m.messageId, cardText(c, scheduled ? outcomeOf(c)! : undefined), scheduled ? [] : keyboardFor(d, c, "open"));
  await d.db
    .update(telegramMessages)
    .set({ lockVersion: c.lockVersion, state: scheduled ? "waiting" : "open" })
    .where(eq(telegramMessages.id, m.id));
}

/** After an edit: old cards say so, and each chat that had one gets the new version. */
async function reissueCards(d: Ctx, c: Card, chatId: number): Promise<void> {
  const open = await d.db
    .select()
    .from(telegramMessages)
    .where(and(eq(telegramMessages.candidateId, c.candidateId), eq(telegramMessages.kind, "card"), eq(telegramMessages.state, "open")));
  const chats = new Set([chatId, ...open.map((m) => m.chatId)]);
  for (const m of open) {
    await editCard(d, m.chatId, m.messageId, cardText(c, { kind: "replaced" }), []);
    await d.db.update(telegramMessages).set({ state: "done" }).where(eq(telegramMessages.id, m.id));
  }
  for (const chat of chats) await sendCard(d, chat, c);
}

async function ask(d: Ctx, chatId: number, c: Card, kind: "ask_edit" | "ask_reason" | "ask_override", text: string): Promise<void> {
  const messageId = await send(d, chatId, text, { reply_markup: { force_reply: true, input_field_placeholder: "답장으로 적어 주세요" } });
  await d.db.insert(telegramMessages).values({ candidateId: c.candidateId, chatId, messageId, kind, lockVersion: c.lockVersion });
}

/* ───────────────────────── actions ───────────────────────── */

/**
 * 발행 from a card: the editor confirms the legal check for the version they
 * read, then it is published as them. Other blocking checks need a reason,
 * asked for as a reply.
 */
async function publishFromCard(d: BotDeps, me: StaffRow, chatId: number, c: Card, lockVersion: number, overrideReason?: string): Promise<{ slug?: string; failing?: CheckResult[] }> {
  if (isPlaceholderStaff(me)) {
    throw new NewsroomError("책임 편집자의 실명이 아직 없습니다. 뉴스룸 → 설정 → ‘내 편집자 프로필’에서 이름을 입력한 뒤 발행하세요.", "invalid");
  }
  if (!overrideReason) {
    const checks = await confirmLegalAs(d.db, me, c.candidateId, true, "telegram", lockVersion);
    const failing = blockingFailures(checks);
    if (failing.length) return { failing };
  }
  const res = await publishAs(d.db, me, { id: c.candidateId, lockVersion, overrideReason, via: "telegram" });
  d.published(res);
  const fresh = await loadCard(d.db, c.candidateId);
  if (fresh) await settleCards(d, fresh, outcomeOf(fresh) ?? { kind: "published", by: me.name, at: clockKST(new Date()) });
  return { slug: res.slug };
}

async function reject(d: BotDeps, me: StaffRow, c: Card, reason: string): Promise<void> {
  const r = reason.trim().slice(0, 200);
  await rejectAs(d.db, me, { id: c.candidateId, reason: r, via: "telegram" });
  const fresh = await loadCard(d.db, c.candidateId);
  if (fresh) await settleCards(d, fresh, { kind: "rejected", reason: r, by: me.name });
}

/** A new version of the draft from Telegram: saved, re-checked, and sent as a new card. */
async function saveEdit(d: BotDeps, me: StaffRow, chatId: number, c: Card, draft: Draft, summary: string): Promise<void> {
  await saveDraftAs(d.db, { id: c.candidateId, lockVersion: c.lockVersion, draft });
  const checks = await computeChecks(d.db, c.candidateId, me.name);
  await d.db.update(candidates).set({ checks }).where(eq(candidates.id, c.candidateId));
  await logActivity(d.db, { actorId: me.id, kind: "edit", entityType: "candidate", entityId: c.candidateId, summary: summary.slice(0, 300), meta: { via: "telegram" } });
  const fresh = await loadCard(d.db, c.candidateId);
  if (fresh) await reissueCards(d, fresh, chatId);
}

async function onEdit(d: BotDeps, me: StaffRow, chatId: number, c: Card, text: string): Promise<Later | null> {
  const quick = parseQuickEdits(text);
  if (quick) {
    const next = draftSchema.safeParse({ ...c.draft, ...quick });
    if (!next.success) {
      await send(d, chatId, `고치지 못했습니다: ${escapeHtml(next.error.issues.map((i) => i.message).join(", "))} (제목 120자, 요약 300자 이내)`);
      return null;
    }
    await saveEdit(d, me, chatId, c, next.data, `텔레그램에서 수정: ${Object.keys(quick).map((k) => (k === "title" ? "제목" : "요약")).join("·")}`);
    return null;
  }
  if (!d.revise) {
    await send(d, chatId, "지금은 AI 수정을 쓸 수 없습니다 (키 또는 이번 달 한도). <code>제목: …</code> / <code>요약: …</code> 형식이나 🖊 편집기를 쓰세요.");
    return null;
  }
  if (c.mode === "data_auto" || !revisable(c.draft)) {
    await send(d, chatId, "표·차트·인용이 있는 초안은 AI로 통째 고치지 않습니다. <code>제목: …</code> / <code>요약: …</code> 형식이나 🖊 편집기를 쓰세요.");
    return null;
  }
  await send(d, chatId, "고치는 중입니다. 30초쯤 걸립니다…");
  const revise = d.revise;
  return async () => {
    try {
      const items = await loadCandidateItems(d.db, c.candidateId);
      const draft = await revise({ draft: c.draft, items: items.map(toGenItem), beat: c.beat, instruction: text });
      await saveEdit(d, me, chatId, c, draft, `텔레그램에서 AI 수정: ${text.slice(0, 120)}`);
      await noteInstruction(d.db, c.candidateId, text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await send(d, chatId, `고치지 못했습니다: ${escapeHtml(msg.slice(0, 300))}`).catch(() => {});
    }
  };
}

/* ───────────────────────── control panels ───────────────────────── */

type Panel = "status" | "settings" | "notes";

async function panel(d: BotDeps, me: StaffRow, view: Panel, confirmId?: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const now = new Date();
  if (view === "status") {
    const [s, link] = await Promise.all([loadStatus(d.db, now), d.db.query.telegramLinks.findFirst({ where: eq(telegramLinks.staffId, me.id) })]);
    return { text: statusText(s, now), keyboard: statusKeyboard(s, link?.notify ?? true) };
  }
  if (view === "settings") {
    const s = await loadDeskSettings(d.db);
    return { text: settingsText(s), keyboard: settingsKeyboard(s) };
  }
  const [lessons, waiting] = await Promise.all([loadLessons(d.db), countPendingCases(d.db)]);
  const notes = lessons
    .sort((x, y) => lessonWeight(y, now) - lessonWeight(x, now))
    .map((l) => ({ id: l.id, text: l.text, scopeLabel: scopeLabel(l.scope), hits: l.hits, pinned: l.pinned, origin: l.origin, fading: !l.pinned && lessonWeight(l, now) < 1 }));
  return { text: notesText(notes, { max: MAX_LESSONS, waiting }), keyboard: notesKeyboard(notes, confirmId) };
}

/** Sends a panel, or redraws the one whose button was pressed. */
async function showPanel(d: BotDeps, me: StaffRow, chatId: number, view: Panel, messageId?: number, confirmId?: string): Promise<void> {
  const p = await panel(d, me, view, confirmId);
  if (messageId) await editCard(d, chatId, messageId, p.text, p.keyboard);
  else await send(d, chatId, p.text, { reply_markup: { inline_keyboard: p.keyboard } });
}

async function onControl(d: BotDeps, me: StaffRow, chatId: number, messageId: number, c: Control, answer: (text?: string, alert?: boolean) => Promise<unknown>): Promise<void> {
  try {
    switch (c.kind) {
      case "view":
        await answer();
        return await showPanel(d, me, chatId, c.view, messageId);
      case "desk":
        await saveDeskSettingsAs(d.db, me, { enabled: c.on }, "telegram");
        await answer(c.on ? "AI 데스크를 켰습니다." : "AI 데스크를 껐습니다. 수집은 계속됩니다.");
        return await showPanel(d, me, chatId, "status", messageId);
      case "run":
        await requestDeskRunAs(d.db, me, "telegram");
        return void (await answer("요청했습니다. 워커가 1분 안에 한 번 실행합니다 (꺼져 있어도 한 번 돕니다)."));
      case "ingest":
        await setIngestPausedAs(d.db, me, !c.on, "telegram");
        await answer(c.on ? "수집을 다시 시작합니다." : "수집과 AI 데스크를 멈췄습니다 (30초 안에 반영). 카드 알림은 계속 옵니다.");
        return await showPanel(d, me, chatId, "status", messageId);
      case "notify":
        await d.db.update(telegramLinks).set({ notify: c.on }).where(eq(telegramLinks.staffId, me.id));
        await logActivity(d.db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "telegram", summary: c.on ? "텔레그램 카드 알림 켬" : "텔레그램 카드 알림 끔", meta: { via: "telegram" } });
        await answer(c.on ? "새 초안 카드를 다시 보냅니다." : "새 초안 카드를 보내지 않습니다. /status 에서 다시 켤 수 있습니다.");
        return await showPanel(d, me, chatId, "status", messageId);
      case "set":
        await saveDeskSettingsAs(d.db, me, c.patch, "telegram");
        await answer("저장했습니다. 다음 실행부터 반영됩니다.");
        return await showPanel(d, me, chatId, "settings", messageId);
      case "min": {
        const s = await loadDeskSettings(d.db);
        const minScore = Math.min(100, Math.max(0, s.minScore + c.delta));
        await saveDeskSettingsAs(d.db, me, { minScore }, "telegram");
        await answer(`기준 점수 ${minScore}`);
        return await showPanel(d, me, chatId, "settings", messageId);
      }
      case "note":
        if (c.op === "del") {
          await answer("한 번 더 누르면 지웁니다.");
          return await showPanel(d, me, chatId, "notes", messageId, c.id);
        }
        if (c.op === "rm") {
          await deleteLessonAs(d.db, me, c.id, "telegram");
          await answer("지웠습니다.");
        } else {
          await setLessonPinnedAs(d.db, me, c.id, c.op === "pin", "telegram");
          await answer(c.op === "pin" ? "고정했습니다. 이 노트는 빠지지 않습니다." : "고정을 풀었습니다. 근거가 끊기면 저절로 빠집니다.");
        }
        return await showPanel(d, me, chatId, "notes", messageId);
      case "review":
        await requestLessonReviewAs(d.db, me, "telegram");
        await answer("요청했습니다. 1시간 안에 쌓인 수정 사례를 읽고 정리합니다.");
        return await showPanel(d, me, chatId, "notes", messageId);
    }
  } catch (e) {
    if (!(e instanceof NewsroomError)) console.error("[telegram] control failed:", e instanceof Error ? e.message : e);
    await answer(e instanceof NewsroomError ? e.message : "처리하지 못했습니다. 잠시 후 다시 시도하세요.", true);
  }
}

/* ───────────────────────── updates ───────────────────────── */

export async function handleUpdate(d: BotDeps, u: TgUpdate): Promise<Later | null> {
  if (u.callback_query) return onCallback(d, u.callback_query);
  if (u.message) return onMessage(d, u.message);
  return null;
}

async function onCallback(d: BotDeps, q: TgCallback): Promise<Later | null> {
  const answer = (text?: string, alert = false) =>
    d.tg.call("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) }).catch(() => {});
  const editor = await linkedEditor(d.db, q.from.id);
  if (!editor) {
    await answer(NOT_LINKED, true);
    return null;
  }
  const ctl = parseControl(q.data);
  if (ctl) {
    if (q.message) await onControl(d, editor.me, q.message.chat.id, q.message.message_id, ctl, answer);
    else await answer();
    return null;
  }
  const a = parseCallback(q.data);
  if (!a || !q.message) {
    await answer();
    return null;
  }
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;
  const c = await loadCard(d.db, a.id);
  if (!c) {
    await answer("후보를 찾을 수 없습니다. 삭제됐을 수 있습니다.", true);
    return null;
  }
  if (c.status === "published" || c.status === "rejected") {
    await answer(c.status === "published" ? "이미 발행된 초안입니다." : "이미 반려된 초안입니다.");
    await settleCards(d, c, outcomeOf(c) ?? { kind: "gone" });
    return null;
  }
  const me = editor.me;

  try {
    switch (a.action) {
      case "pub": {
        // confirm the version this card shows, not whatever is current
        const [row] = await d.db
          .select({ lockVersion: telegramMessages.lockVersion })
          .from(telegramMessages)
          .where(and(eq(telegramMessages.chatId, chatId), eq(telegramMessages.messageId, messageId)));
        await setKeyboard(d, chatId, messageId, cardKeyboard({ candidateId: c.candidateId, lockVersion: row?.lockVersion ?? c.lockVersion, site: d.site }, "confirm"));
        await answer("명예훼손·저작권·개인정보를 확인했다면 ‘법률 검토 확인 · 발행’을 누르세요.");
        return null;
      }
      case "back":
        await setKeyboard(d, chatId, messageId, keyboardFor(d, c, "open"));
        await answer();
        return null;
      case "rej":
        await setKeyboard(d, chatId, messageId, keyboardFor(d, c, "reject"));
        await answer("반려 사유를 고르세요.");
        return null;
      case "edit":
        await answer();
        await ask(d, chatId, c, "ask_edit", ASK_EDIT);
        return null;
      case "rj":
        if (a.reason === 0) {
          await answer();
          await ask(d, chatId, c, "ask_reason", ASK_REASON);
          return null;
        }
        await reject(d, me, c, REJECT_REASONS[a.reason - 1]);
        await answer("반려했습니다.");
        return null;
      case "ok": {
        if (c.lockVersion !== a.lockVersion) {
          await answer("초안이 그사이 바뀌었습니다. 새 카드를 보냅니다.", true);
          await reissueCards(d, c, chatId);
          return null;
        }
        const r = await publishFromCard(d, me, chatId, c, a.lockVersion);
        if (r.failing) {
          await setKeyboard(d, chatId, messageId, keyboardFor(d, c, "open"));
          await ask(d, chatId, c, "ask_override", askOverride(r.failing));
          await answer("필수 체크에 걸려 사유가 필요합니다.");
          return null;
        }
        await answer("발행했습니다.");
        return null;
      }
    }
  } catch (e) {
    if (!(e instanceof NewsroomError)) console.error("[telegram] action failed:", e instanceof Error ? e.message : e);
    await answer(e instanceof NewsroomError ? e.message : "처리하지 못했습니다. 잠시 후 다시 시도하세요.", true);
  }
  return null;
}

async function onMessage(d: BotDeps, m: TgMessage): Promise<Later | null> {
  if (m.chat.type !== "private" || !m.from) return null;
  const chatId = m.chat.id;
  const text = (m.text ?? "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const me = await linkWithCode(d.db, code, { userId: m.from.id, chatId, username: m.from.username ?? null });
      if (!me) {
        await send(d, chatId, "연결 링크가 맞지 않거나 만료됐습니다(15분). 뉴스룸 → 설정 → 텔레그램에서 새 링크를 만드세요.");
        return null;
      }
      await logActivity(d.db, {
        actorId: me.id,
        kind: "settings",
        entityType: "settings",
        entityId: "telegram",
        summary: `텔레그램 연결${m.from.username ? ` (@${m.from.username})` : ""}`,
      });
      await send(d, chatId, `${escapeHtml(me.name)} 님 계정과 연결했습니다. 검토할 초안이 생기면 여기로 카드를 보냅니다.\n\n${HELP}`);
      return null;
    }
    const linked = await linkedEditor(d.db, m.from.id);
    await send(d, chatId, linked ? HELP : NOT_LINKED);
    return null;
  }

  const editor = await linkedEditor(d.db, m.from.id);
  if (!editor) {
    await send(d, chatId, NOT_LINKED);
    return null;
  }
  const me = editor.me;
  if (text === "/stop") {
    await unlinkTelegram(d.db, me.id);
    await logActivity(d.db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "telegram", summary: "텔레그램 연결 해제" });
    await send(d, chatId, "연결을 끊었습니다. 다시 받으려면 뉴스룸 → 설정 → 텔레그램에서 새 링크를 만드세요.");
    return null;
  }
  if (text === "/help" || !text) {
    await send(d, chatId, HELP);
    return null;
  }
  if (/^\/status(@\w+)?$/.test(text) || text === "상태") {
    await showPanel(d, me, chatId, "status");
    return null;
  }
  if (/^\/settings(@\w+)?$/.test(text) || text === "설정") {
    await showPanel(d, me, chatId, "settings");
    return null;
  }
  if (/^\/notes(@\w+)?$/.test(text) || text === "노트") {
    await showPanel(d, me, chatId, "notes");
    return null;
  }
  const note = parseNoteCommand(text);
  if (note) {
    if (!note.text) {
      await send(d, chatId, "노트 내용을 함께 보내 주세요. 예: <code>/note 경제: 정부 발표 기사는 제목에 핵심 수치를 앞세운다</code>");
      return null;
    }
    try {
      const r = await addLessonAs(d.db, me, note, "telegram");
      await send(d, chatId, `노트를 추가했습니다 (${escapeHtml(scopeLabel(r.scope))} · 고정 · ${r.total}/${MAX_LESSONS}). 다음 초안부터 반영됩니다. /notes 로 목록을 봅니다.`);
    } catch (e) {
      await send(d, chatId, escapeHtml(e instanceof NewsroomError ? e.message : "추가하지 못했습니다. 잠시 후 다시 시도하세요."));
    }
    return null;
  }

  const replyTo = m.reply_to_message?.message_id;
  const [row] = replyTo
    ? await d.db
        .select()
        .from(telegramMessages)
        .where(and(eq(telegramMessages.chatId, chatId), eq(telegramMessages.messageId, replyTo)))
    : [];
  if (!row?.candidateId) {
    await send(d, chatId, "어느 초안에 대한 말인지 모르겠습니다. 초안 카드나 질문 메시지에 <b>답장</b>으로 보내 주세요.");
    return null;
  }
  const c = await loadCard(d.db, row.candidateId);
  if (!c || c.status === "published" || c.status === "rejected") {
    await send(d, chatId, "이미 처리된 초안입니다.");
    return null;
  }

  try {
    switch (row.kind) {
      case "card":
      case "ask_edit":
        return await onEdit(d, me, chatId, c, text);
      case "ask_reason":
        await reject(d, me, c, text);
        await send(d, chatId, "반려했습니다.");
        return null;
      case "ask_override": {
        if (row.state !== "open" || row.lockVersion == null) {
          await send(d, chatId, "이 질문은 지났습니다. 카드의 ✅ 발행을 다시 눌러 주세요.");
          return null;
        }
        const r = await publishFromCard(d, me, chatId, c, row.lockVersion, text.slice(0, 300));
        await send(d, chatId, `발행했습니다. ${d.site}/a/${r.slug}`);
        return null;
      }
      default:
        return null;
    }
  } catch (e) {
    if (!(e instanceof NewsroomError)) console.error("[telegram] reply failed:", e instanceof Error ? e.message : e);
    await send(d, chatId, escapeHtml(e instanceof NewsroomError ? e.message : "처리하지 못했습니다. 잠시 후 다시 시도하세요.")).catch(() => {});
    return null;
  }
}
