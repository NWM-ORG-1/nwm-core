import type { BlockType } from "@/lib/content/blocks";
import { BLOCK_TITLE_KO } from "@/lib/content/meta";
import type { AiInvolvement, Beat, CandidateMode, CandidateStatus, CheckId } from "@/db/schema";
import type { getBoard, getCandidateBundle } from "@/data/admin";

/**
 * Client-safe helpers for the candidate board and editor. Type-only imports from
 * the server modules are erased at compile time.
 */

export type BoardCard = Awaited<ReturnType<typeof getBoard>>[number];
export type CandidateBundle = NonNullable<Awaited<ReturnType<typeof getCandidateBundle>>>;
export type CheckLabels = Record<CheckId, { label: string; blocking: boolean }>;

export type MoveTarget = Extract<CandidateStatus, "new" | "drafting" | "review" | "rejected">;

export const BOARD_COLUMNS: Array<{ key: Extract<CandidateStatus, "new" | "drafting" | "review" | "scheduled">; label: string; hint: string }> = [
  { key: "new", label: "신규", hint: "피드 승격·데이터·아이디어로 막 들어온 후보" },
  { key: "drafting", label: "작성중", hint: "초안을 쓰고 다듬는 중" },
  { key: "review", label: "검토", hint: "데스크 검토·체크 대기" },
  { key: "scheduled", label: "예약", hint: "예약 발행 대기 — 편집기에서 설정" },
];

export const MODE_CODE: Record<CandidateMode, "A" | "B" | "C"> = { feed_draft: "A", data_auto: "B", editor_idea: "C" };

/** Korean label for every block type (the public kit has no quote/section entry). */
export const BLOCK_LABEL_KO: Record<BlockType, string> = {
  why: BLOCK_TITLE_KO.why,
  numbers: BLOCK_TITLE_KO.numbers,
  section: "섹션",
  quote: "인용",
  chart: BLOCK_TITLE_KO.chart,
  table: BLOCK_TITLE_KO.table,
  sentiment: BLOCK_TITLE_KO.sentiment,
  next: BLOCK_TITLE_KO.next,
  deeper: BLOCK_TITLE_KO.deeper,
};

export const BLOCK_HINT_KO: Record<BlockType, string> = {
  why: "독자가 지금 알아야 할 이유 1–3개",
  numbers: "핵심 수치 카드 최대 4개",
  section: "라벨이 붙은 짧은 단락 · 불릿",
  quote: "발언 인용과 출처",
  chart: "단일 시계열 선 차트",
  table: "비교표 (열 2–6개)",
  sentiment: "발행 시점 센티먼트 스냅샷",
  next: "다음에 지켜볼 것 1–3개",
  deeper: "관련 스토리·기사·1차 자료 링크",
};

export const SOURCE_KIND_KO: Record<string, string> = {
  filing: "공시",
  press: "보도자료",
  data: "데이터",
  social: "소셜",
  report: "리포트",
  news: "언론",
  paper: "논문",
};

/**
 * Same rule as newsroom → aiInvolvementFor: only untouched code-template output
 * is "자동 생성"; no generator at all means a human wrote it.
 */
export function aiInvolvementOf(mode: CandidateMode, generatorId: string | null): AiInvolvement {
  if (mode === "data_auto" && generatorId?.startsWith("template:")) return "auto";
  if (generatorId == null) return "human";
  if (mode === "editor_idea") return "ai_assisted";
  return "ai_draft_edited";
}

/** Same rule as publishCandidate's byline. */
export function bylineOf(v: AiInvolvement, beatLabel: string, editorName: string) {
  if (v === "auto") return "NWM 데이터 데스크";
  if (v === "ai_draft_edited") return `NWM ${beatLabel} 데스크`;
  return `글 · ${editorName}`;
}

/* ───────────────────────────── time (KST) ───────────────────────────── */

const KST_OFFSET_MS = 9 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Value for <input type="datetime-local"> showing the given instant in KST. */
export function toKstInput(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "2026-10-21T15:30" (entered as KST) → "2026-10-21T15:30:00+09:00". */
export function kstInputToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+09:00`;
}

/** Next round 10 minutes, at least `leadMin` ahead. */
export function defaultScheduleMs(now: number, leadMin = 60) {
  const step = 10 * 60_000;
  return Math.ceil((now + leadMin * 60_000) / step) * step;
}

const secFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
/** "14:05:12" (KST) */
export function clockSecKST(iso: string) {
  return secFmt.format(new Date(iso));
}

export function isBeatValue(v: string): v is Beat {
  return v === "ai" || v === "crypto" || v === "economy" || v === "tech" || v === "sentiment";
}

/* ───────────────────────────── form classes ───────────────────────────── */

export const f = {
  label: "kicker mb-1.5 flex items-center justify-between gap-2 text-fg-2",
  input:
    "h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[13.5px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none disabled:opacity-70 aria-[invalid=true]:border-bad/70",
  select:
    "h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none disabled:opacity-50",
  // grows with its content where `field-sizing` is supported (rows= is the fallback height)
  textarea:
    "block min-h-[4.5rem] max-h-[32rem] w-full resize-y rounded-lg border border-line-2 bg-bg-1 px-3 py-2 text-[13.5px] field-sizing-content leading-relaxed text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none disabled:opacity-70 aria-[invalid=true]:border-bad/70",
  help: "mt-1 text-[11.5px] leading-relaxed text-fg-3",
  error: "mt-1 text-[11.5px] font-medium leading-relaxed text-bad",
  check: "size-4 shrink-0 rounded border-line-3 accent-[var(--ice)]",
};
