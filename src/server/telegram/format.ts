import type { Beat, CandidateMode, CheckResult } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO, type Block, type Draft } from "@/lib/content/blocks";
import { CHECK_META } from "../checks";
import type { InlineKeyboard } from "./api";

/**
 * The newsroom bot's draft card: text (Telegram HTML), buttons, and the
 * parsing of what comes back (button data, quick edits). Pure, for tests.
 */

/** Telegram allows 4,096 characters; leave room for the outcome line and markup. */
const BODY_BUDGET = 3600;

export const REJECT_REASONS = ["홍보성", "기사 가치 낮음", "중복", "사실 확인 어려움"] as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Draft text, escaped, with its only markup (**bold**) as <b>. */
export function richText(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

export interface CardInput {
  candidateId: string;
  draft: Draft;
  beat: Beat;
  mode: CandidateMode;
  desk: { score: number; lowRisk: boolean; explore?: boolean } | null;
  checks: CheckResult[];
  aiNote: string | null;
}

export type CardOutcome =
  | { kind: "published"; by: string | null; at: string }
  | { kind: "rejected"; reason: string; by: string | null }
  | { kind: "scheduled"; at: string }
  | { kind: "replaced" }
  | { kind: "gone" };

function outcomeLine(o: CardOutcome): string {
  switch (o.kind) {
    case "published":
      return `✅ <b>발행됨</b>${o.by ? ` · ${escapeHtml(o.by)}` : ""} · ${escapeHtml(o.at)}`;
    case "rejected":
      return `🗑 <b>반려</b> · ${escapeHtml(o.reason)}${o.by ? ` · ${escapeHtml(o.by)}` : ""}`;
    case "scheduled":
      return `⏰ <b>예약 발행</b> · ${escapeHtml(o.at)}`;
    case "replaced":
      return "✏️ 고친 초안을 아래에 새로 보냈습니다";
    case "gone":
      return "— 후보가 삭제됐습니다";
  }
}

function header(c: CardInput): string {
  const beat = BEATS[c.beat].label;
  if (c.desk) {
    const flags = [c.desk.lowRisk ? "저위험" : null, c.desk.explore ? "탐색" : null].filter(Boolean);
    return `🆕 <b>AI 데스크 초안</b> · ${c.desk.score}점 · ${beat}${flags.length ? ` · ${flags.join(" · ")}` : ""}`;
  }
  return `🆕 <b>${c.mode === "data_auto" ? "자동 기사 초안" : "초안"}</b> · ${beat}`;
}

const bullet = (s: string) => `• ${richText(s)}`;

function blockLines(b: Block): string[] {
  switch (b.type) {
    case "why":
      return [`<b>${BLOCK_TITLE_KO.why}</b>`, ...b.items.map(bullet)];
    case "numbers":
      return [
        `<b>${BLOCK_TITLE_KO.numbers}</b>`,
        ...b.items.map((n) => `• ${n.trend === "up" ? "▲ " : n.trend === "down" ? "▼ " : ""}<b>${escapeHtml(n.value)}</b> ${escapeHtml(n.label)}${n.delta ? ` (${escapeHtml(n.delta)})` : ""}`),
      ];
    case "section":
      return [`<b>${SECTION_LABEL_KO[b.label]}</b>`, ...(b.text ? [richText(b.text)] : []), ...(b.bullets ?? []).map(bullet)];
    case "quote":
      return [`“${richText(b.text)}” — ${escapeHtml(b.attribution)}${b.role ? `, ${escapeHtml(b.role)}` : ""}`];
    case "chart":
      return [`<b>${BLOCK_TITLE_KO.chart}</b> ${escapeHtml(b.title)} (값 ${b.points.length}개)`];
    case "table":
      return [`<b>${BLOCK_TITLE_KO.table}</b> ${escapeHtml(b.caption)}`, ...b.rows.slice(0, 6).map((r) => `• ${escapeHtml(r.join(" · "))}`)];
    case "sentiment":
      return [`<b>${BLOCK_TITLE_KO.sentiment}</b> (지수 블록)`];
    case "next":
      return [`<b>${BLOCK_TITLE_KO.next}</b>`, ...b.items.map(bullet)];
    case "deeper":
      return [`<b>${BLOCK_TITLE_KO.deeper}</b>`, ...b.links.map((l) => bullet(l.title))];
  }
}

/** Blocking checks the editor still has to deal with; the legal sign-off and the editor's name come with 발행. */
export function openChecks(checks: CheckResult[]): CheckResult[] {
  return checks.filter((c) => !c.ok && !c.overridden && c.id !== "legal" && c.id !== "ai_label");
}

export function cardText(c: CardInput, outcome?: CardOutcome): string {
  const d = c.draft;
  // the title is already bold: its own **marks** would nest
  const body: string[] = [`<b>${escapeHtml((d.title || "(제목 없음)").replace(/\*\*/g, ""))}</b>`];
  if (d.dek) body.push(richText(d.dek));
  for (const b of d.blocks) body.push("", ...blockLines(b));

  const foot: string[] = [];
  if (d.sources.length) foot.push(`출처: ${escapeHtml(d.sources.map((s) => s.name).join(" · "))}`);
  const issues = openChecks(c.checks);
  for (const x of issues.filter((i) => i.blocking)) foot.push(`⚠️ ${escapeHtml(CHECK_META[x.id].label)}: ${escapeHtml(x.message.slice(0, 140))}`);
  for (const x of issues.filter((i) => !i.blocking)) foot.push(`· ${escapeHtml(CHECK_META[x.id].label)}: ${escapeHtml(x.message.slice(0, 140))}`);
  const notes = (c.aiNote ?? "")
    .split(" · ")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (notes.length) foot.push(`💬 ${escapeHtml(notes.map((n) => (n.length > 140 ? `${n.slice(0, 139)}…` : n)).join(" / "))}`);

  // keep within Telegram's limit: cut the body, never the header or the checks
  let text = body.join("\n");
  if (text.length > BODY_BUDGET) {
    const cut = text.lastIndexOf("\n", BODY_BUDGET);
    text = `${text.slice(0, cut > 0 ? cut : BODY_BUDGET)}\n… (나머지는 미리보기에서 보세요)`;
  }
  return [...(outcome ? [outcomeLine(outcome)] : []), header(c), "", text, ...(foot.length ? ["", ...foot] : [])].join("\n");
}

export type KeyboardMode = "open" | "confirm" | "reject" | "done";

export function cardKeyboard(c: { candidateId: string; lockVersion: number; site: string; slug?: string | null }, mode: KeyboardMode): InlineKeyboard {
  const id = c.candidateId;
  switch (mode) {
    case "open":
      return [
        [
          { text: "✅ 발행", callback_data: `pub:${id}` },
          { text: "✏️ 수정", callback_data: `edit:${id}` },
          { text: "🗑 반려", callback_data: `rej:${id}` },
        ],
        [
          { text: "👁 미리보기", url: `${c.site}/admin/candidates/${id}/preview` },
          { text: "🖊 편집기", url: `${c.site}/admin/candidates/${id}` },
        ],
      ];
    case "confirm":
      return [[{ text: "✅ 법률 검토 확인 · 발행", callback_data: `ok:${id}:${c.lockVersion}` }], [{ text: "↩ 취소", callback_data: `back:${id}` }]];
    case "reject":
      return [
        REJECT_REASONS.slice(0, 2).map((r, n) => ({ text: r, callback_data: `rj:${id}:${n + 1}` })),
        REJECT_REASONS.slice(2).map((r, n) => ({ text: r, callback_data: `rj:${id}:${n + 3}` })),
        [
          { text: "✍️ 직접 입력", callback_data: `rj:${id}:0` },
          { text: "↩ 취소", callback_data: `back:${id}` },
        ],
      ];
    case "done":
      return c.slug ? [[{ text: "📰 기사 보기", url: `${c.site}/a/${c.slug}` }]] : [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CallbackAction =
  | { action: "pub" | "edit" | "rej" | "back"; id: string }
  | { action: "ok"; id: string; lockVersion: number }
  | { action: "rj"; id: string; reason: number };

export function parseCallback(data: string | undefined): CallbackAction | null {
  const [action, id, arg] = (data ?? "").split(":");
  if (!id || !UUID.test(id)) return null;
  switch (action) {
    case "pub":
    case "edit":
    case "rej":
    case "back":
      return { action, id };
    case "ok": {
      const lockVersion = Number(arg);
      return Number.isInteger(lockVersion) && lockVersion >= 0 ? { action, id, lockVersion } : null;
    }
    case "rj": {
      const reason = Number(arg);
      return Number.isInteger(reason) && reason >= 0 && reason <= REJECT_REASONS.length ? { action, id, reason } : null;
    }
    default:
      return null;
  }
}

/** `제목: …` / `요약: …` lines replace the title / summary as written; anything else is an instruction for the AI. */
export function parseQuickEdits(text: string): { title?: string; dek?: string } | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const out: { title?: string; dek?: string } = {};
  for (const l of lines) {
    const m = /^(제목|요약)\s*[:：]\s*(.+)$/.exec(l);
    if (!m) return null;
    if (m[1] === "제목") out.title = m[2].trim();
    else out.dek = m[2].trim();
  }
  return out;
}

export const ASK_EDIT = [
  "어떻게 고칠까요? <b>이 메시지에 답장</b>으로 보내 주세요.",
  "• <code>제목: 새 제목</code>, <code>요약: 새 요약</code> 은 쓴 그대로 바꿉니다.",
  "• 그 밖의 지시(예: 둘째 단락은 빼고 더 짧게)는 AI가 반영해 새 카드로 보여 드립니다.",
  "• 본문을 크게 고치려면 카드의 🖊 편집기를 여세요.",
].join("\n");

export const ASK_REASON = "반려 사유를 <b>이 메시지에 답장</b>으로 적어 주세요. AI 데스크가 다음 판단에 참고합니다.";

export function askOverride(failing: CheckResult[]): string {
  return [
    "필수 체크에 걸려 있습니다:",
    ...failing.map((c) => `• ${escapeHtml(CHECK_META[c.id].label)}: ${escapeHtml(c.message.slice(0, 160))}`),
    "",
    "그래도 발행하려면 사유를 <b>이 메시지에 답장</b>으로 적어 주세요. 사유는 활동 기록과 체크에 남습니다.",
  ].join("\n");
}

export const HELP = [
  "<b>뉴웹미디어 뉴스룸 봇</b>",
  "검토할 초안이 생기면 카드로 알려 드립니다.",
  "• ✅ 발행: 법률 검토를 확인하고 바로 발행합니다.",
  "• ✏️ 수정: 답장으로 고칠 내용을 보내면 반영한 새 카드를 보냅니다.",
  "• 🗑 반려: 사유를 고르거나 적습니다.",
  "/stop 연결 끊기",
].join("\n");

export const NOT_LINKED = "연결되지 않은 텔레그램 계정입니다. 뉴스룸 → 설정 → 텔레그램에서 연결 링크를 만들어 여세요.";
