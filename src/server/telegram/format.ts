import type { Beat, CandidateMode, CheckResult } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { clockKST, dateKST } from "@/lib/format";
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

/**
 * `miniApp`: in a private chat the preview opens inside Telegram and signs in
 * with the linked Telegram account (/tg/preview); elsewhere it is the
 * newsroom page behind the password.
 */
export function cardKeyboard(c: { candidateId: string; lockVersion: number; site: string; slug?: string | null; miniApp?: boolean }, mode: KeyboardMode): InlineKeyboard {
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
          c.miniApp ? { text: "👁 미리보기", web_app: { url: `${c.site}/tg/preview/${id}` } } : { text: "👁 미리보기", url: `${c.site}/admin/candidates/${id}/preview` },
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
  "/status 수집·AI 데스크·뉴스룸 상태 (버튼으로 일시정지·재개)",
  "/settings AI 데스크 설정 (하루 초안 수·간격·쓰기 방식·기준 점수)",
  "/notes 편집 노트 보기·고정·삭제",
  "/note 경제: … 편집 노트 추가 (분야는 생략 가능)",
  "/stop 연결 끊기",
].join("\n");

/** The bot's command menu in Telegram (setMyCommands). */
export const BOT_COMMANDS = [
  { command: "status", description: "수집·AI 데스크·뉴스룸 상태와 켜고 끄기" },
  { command: "settings", description: "AI 데스크 설정" },
  { command: "notes", description: "편집 노트 보기·고정·삭제" },
  { command: "note", description: "편집 노트 추가 (/note 경제: …)" },
  { command: "help", description: "도움말" },
  { command: "stop", description: "연결 끊기" },
];

/* ───────────────────────── /status ───────────────────────── */

export interface StatusSnapshot {
  workerBeatAt: string | null;
  /** the newsroom's kill switch: no collection and no periodic jobs */
  ingestPaused: boolean;
  sources: { active: number; paused: number; error: number; failing: Array<{ name: string; error: string | null; lastSuccessAt: string | null }> };
  items: { hour: number; day: number; lastCheckAt: string | null; lastNewAt: string | null };
  desk: {
    enabled: boolean;
    cadenceMin: number;
    dailyDrafts: number;
    draftedToday: number;
    queued: number;
    lastRun: { at: string; seen: number; stories: number; drafted: number; error: string | null } | null;
    spendUsd: number;
    budgetUsd: number;
    allUsd: number;
    capUsd: number;
  };
  newsroom: { review: number; scheduled: number; publishedToday: number };
  lessons: { notes: number; waiting: number };
}

/** "12초 전", "3분 전", "2시간 전", "4일 전" */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return "기록 없음";
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86_400)}일 전`;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
/** the worker beats every 30 seconds */
const WORKER_QUIET_MS = 3 * 60_000;

export function statusText(s: StatusSnapshot, now: Date): string {
  const at = `${dateKST(now)} ${clockKST(now)}`;
  const alive = s.workerBeatAt != null && now.getTime() - Date.parse(s.workerBeatAt) < WORKER_QUIET_MS;
  const lines = [`📡 <b>뉴웹미디어 상태</b> · ${escapeHtml(at)}`, ""];

  lines.push(alive ? `<b>워커</b> ✅ 정상 · 신호 ${ago(s.workerBeatAt, now)}` : `<b>워커</b> ⚠️ 신호 없음 · 마지막 ${ago(s.workerBeatAt, now)} — Railway worker 서비스를 확인하세요`);

  const src = s.sources;
  if (s.ingestPaused) lines.push("<b>수집</b> ⏸ 일시정지 중 — 수집과 AI 데스크가 멈춰 있습니다");
  else lines.push(`<b>수집</b> 소스 ${src.active}개 작동${src.error ? ` · ⚠️ 오류 ${src.error}` : ""}${src.paused ? ` · 쉼 ${src.paused}` : ""}`);
  lines.push(` 새 자료 1시간 ${s.items.hour}건 · 24시간 ${s.items.day}건 · 마지막 확인 ${ago(s.items.lastCheckAt, now)}`);
  for (const f of src.failing.slice(0, 3)) {
    lines.push(` ⚠️ ${escapeHtml(f.name)} — ${escapeHtml(clipLine(f.error ?? "오류", 80))} (마지막 성공 ${ago(f.lastSuccessAt, now)})`);
  }

  const d = s.desk;
  const cadence = d.cadenceMin < 60 ? `${d.cadenceMin}분마다` : `${d.cadenceMin / 60}시간마다`;
  lines.push(`<b>AI 데스크</b> ${d.enabled ? `켜짐 · ${cadence}` : "꺼짐"} · 오늘 초안 ${d.draftedToday}/${d.dailyDrafts} · 대기 ${d.queued}`);
  if (d.lastRun) {
    lines.push(
      d.lastRun.error
        ? ` ⚠️ 마지막 실행 ${ago(d.lastRun.at, now)} 실패 — ${escapeHtml(clipLine(d.lastRun.error, 100))}`
        : ` 마지막 실행 ${ago(d.lastRun.at, now)} — 자료 ${d.lastRun.seen}건 · 사건 ${d.lastRun.stories}건 · 초안 ${d.lastRun.drafted}건`,
    );
  } else lines.push(" 아직 실행 기록이 없습니다");
  const broke = d.spendUsd >= d.budgetUsd || d.allUsd >= d.capUsd;
  lines.push(` ${broke ? "⚠️ " : ""}이번 달 ${usd(d.spendUsd)} / ${usd(d.budgetUsd)} · 뉴스룸 전체 ${usd(d.allUsd)} / ${usd(d.capUsd)}`);

  lines.push(`<b>뉴스룸</b> 검토 대기 ${s.newsroom.review} · 예약 ${s.newsroom.scheduled} · 오늘 발행 ${s.newsroom.publishedToday}`);
  lines.push(`<b>편집 노트</b> ${s.lessons.notes}개 · 고친 초안 ${s.lessons.waiting}건 대기`);
  return lines.join("\n");
}

function clipLine(t: string, max: number): string {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export const NOT_LINKED = "연결되지 않은 텔레그램 계정입니다. 뉴스룸 → 설정 → 텔레그램에서 연결 링크를 만들어 여세요.";

/* ───────────────────────── control panels ───────────────────────── */

const btn = (text: string, data: string) => ({ text, callback_data: data });

/** Under /status: the switches an editor reaches for most. */
export function statusKeyboard(s: Pick<StatusSnapshot, "ingestPaused" | "desk">, notify: boolean): InlineKeyboard {
  return [
    [s.desk.enabled ? btn("⏸ AI 데스크 끄기", "ctl:desk:off") : btn("▶️ AI 데스크 켜기", "ctl:desk:on"), btn("🔄 지금 실행", "ctl:run")],
    [s.ingestPaused ? btn("▶️ 수집 재개", "ctl:ingest:on") : btn("⏸ 수집 일시정지", "ctl:ingest:off"), notify ? btn("🔕 카드 알림 끄기", "ctl:notify:off") : btn("🔔 카드 알림 켜기", "ctl:notify:on")],
    [btn("⚙️ 설정", "ctl:view:settings"), btn("📝 편집 노트", "ctl:view:notes"), btn("↻ 새로고침", "ctl:view:status")],
  ];
}

export interface SettingsView {
  enabled: boolean;
  dailyDrafts: number;
  cadenceMin: number;
  pacing: "immediate" | "spread";
  minScore: number;
  monthlyBudgetUsd: number;
}

export const DAILY_OPTIONS = [5, 10, 15, 20] as const;
export const CADENCE_OPTIONS = [30, 60, 120, 240] as const;
const cadenceLabel = (m: number) => (m < 60 ? `${m}분` : `${m / 60}시간`);

export function settingsText(s: SettingsView): string {
  return [
    "⚙️ <b>AI 데스크 설정</b>",
    `${s.enabled ? "켜짐" : "꺼짐"} · ${cadenceLabel(s.cadenceMin)}마다 · ${s.pacing === "immediate" ? "기준을 넘으면 바로 쓰기" : "07–23시에 나눠 쓰기"}`,
    `하루 초안 ${s.dailyDrafts}건 · 기준 점수 ${s.minScore} · 이번 달 예산 $${s.monthlyBudgetUsd}`,
    "",
    "누르면 바로 저장되고 다음 실행부터 반영됩니다. 예산·모델은 뉴스룸 → AI 데스크에서 바꿉니다.",
  ].join("\n");
}

export function settingsKeyboard(s: SettingsView): InlineKeyboard {
  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label);
  return [
    DAILY_OPTIONS.map((n) => btn(mark(s.dailyDrafts === n, `하루 ${n}건`), `set:daily:${n}`)),
    CADENCE_OPTIONS.map((m) => btn(mark(s.cadenceMin === m, cadenceLabel(m)), `set:cadence:${m}`)),
    [btn(mark(s.pacing === "immediate", "바로 쓰기"), "set:pacing:immediate"), btn(mark(s.pacing === "spread", "나눠 쓰기"), "set:pacing:spread")],
    [btn(`기준 −5 (${Math.max(0, s.minScore - 5)})`, "set:min:-5"), btn(`기준 +5 (${Math.min(100, s.minScore + 5)})`, "set:min:+5")],
    [s.enabled ? btn("⏸ AI 데스크 끄기", "set:enabled:off") : btn("▶️ AI 데스크 켜기", "set:enabled:on"), btn("← 상태", "ctl:view:status")],
  ];
}

export interface NoteView {
  id: string;
  text: string;
  scopeLabel: string;
  hits: number;
  pinned: boolean;
  origin: string;
  fading: boolean;
}

export function notesText(notes: NoteView[], o: { max: number; waiting: number }): string {
  const lines = [`📝 <b>편집 노트</b> ${notes.length}/${o.max} · 고친 초안 ${o.waiting}건 대기`, ""];
  if (!notes.length) lines.push("아직 노트가 없습니다. 고쳐서 발행한 초안이 쌓이면 AI가 정리하고, 직접 추가할 수도 있습니다.");
  notes.forEach((n, i) => {
    const meta = [n.scopeLabel, n.origin === "editor" ? "직접 씀" : `근거 ${n.hits}건`, n.fading ? "곧 빠짐" : ""].filter(Boolean).join(" · ");
    lines.push(`${i + 1}. ${n.pinned ? "📌 " : ""}${escapeHtml(n.text)} <i>— ${escapeHtml(meta)}</i>`);
  });
  lines.push("", "추가: <code>/note 경제: 정부 발표 기사는 제목에 핵심 수치를 앞세운다</code> (분야는 빼면 모든 초안)");
  return lines.join("\n");
}

/** One row per note (pin / delete); a delete asks once more in place. */
export function notesKeyboard(notes: Array<Pick<NoteView, "id" | "pinned">>, confirmId?: string): InlineKeyboard {
  const rows: InlineKeyboard = notes.map((n, i) =>
    n.id === confirmId
      ? [btn(`${i + 1}번 정말 지우기`, `nt:rm:${n.id}`), btn("취소", "ctl:view:notes")]
      : [btn(n.pinned ? `${i + 1} 📌 고정 해제` : `${i + 1} 📌 고정`, `nt:${n.pinned ? "unpin" : "pin"}:${n.id}`), btn(`${i + 1} 🗑 지우기`, `nt:del:${n.id}`)],
  );
  rows.push([btn("🧹 AI 정리 요청", "nt:review"), btn("← 상태", "ctl:view:status")]);
  return rows;
}

export type Control =
  | { kind: "desk"; on: boolean }
  | { kind: "run" }
  | { kind: "ingest"; on: boolean }
  | { kind: "notify"; on: boolean }
  | { kind: "view"; view: "status" | "settings" | "notes" }
  | { kind: "set"; patch: { dailyDrafts: number } | { cadenceMin: number } | { pacing: "immediate" | "spread" } | { enabled: boolean } }
  | { kind: "min"; delta: 5 | -5 }
  | { kind: "note"; op: "pin" | "unpin" | "del" | "rm"; id: string }
  | { kind: "review" };

/** Buttons of the control panels (ctl: / set: / nt:); anything else is a card button or nothing. */
export function parseControl(data: string | undefined): Control | null {
  const [group, a, b] = (data ?? "").split(":");
  const onOff = (v: string | undefined) => (v === "on" ? true : v === "off" ? false : null);
  if (group === "ctl") {
    if (a === "run") return { kind: "run" };
    if (a === "view") return b === "status" || b === "settings" || b === "notes" ? { kind: "view", view: b } : null;
    const on = onOff(b);
    if (on == null) return null;
    if (a === "desk" || a === "ingest" || a === "notify") return { kind: a, on };
    return null;
  }
  if (group === "set") {
    const n = Number(b);
    if (a === "daily") return (DAILY_OPTIONS as readonly number[]).includes(n) ? { kind: "set", patch: { dailyDrafts: n } } : null;
    if (a === "cadence") return (CADENCE_OPTIONS as readonly number[]).includes(n) ? { kind: "set", patch: { cadenceMin: n } } : null;
    if (a === "pacing") return b === "immediate" || b === "spread" ? { kind: "set", patch: { pacing: b } } : null;
    if (a === "enabled") {
      const on = onOff(b);
      return on == null ? null : { kind: "set", patch: { enabled: on } };
    }
    if (a === "min") return b === "+5" ? { kind: "min", delta: 5 } : b === "-5" ? { kind: "min", delta: -5 } : null;
    return null;
  }
  if (group === "nt") {
    if (a === "review") return { kind: "review" };
    if ((a === "pin" || a === "unpin" || a === "del" || a === "rm") && b && UUID.test(b)) return { kind: "note", op: a, id: b };
    return null;
  }
  return null;
}

const NOTE_SCOPES: Record<string, string> = Object.fromEntries([
  ...Object.values(BEATS).map((b) => [b.label.toLowerCase(), `beat:${b.id}`]),
  ...Object.values(BEATS).map((b) => [b.id, `beat:${b.id}`]),
  ["센티먼트", "beat:sentiment"],
  ["전체", "all"],
  ["모든 초안", "all"],
]);

/** "/note 경제: 정부 발표는 …" → a note for the economy beat; without a known prefix, for every draft. */
export function parseNoteCommand(text: string): { text: string; scope: string } | null {
  const m = /^\/note(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const body = (m[1] ?? "").trim();
  const p = /^([^:：\n]{1,10})\s*[:：]\s*([\s\S]+)$/.exec(body);
  const scope = p ? NOTE_SCOPES[p[1].trim().toLowerCase()] : undefined;
  return scope ? { text: p![2].trim(), scope } : { text: body, scope: "all" };
}
