/**
 * Labels and pure formatting helpers for the published-articles screens.
 * Pure (no server-only imports), so Server and Client Components can share it.
 */
import type { Beat } from "@/db/schema";
import { clockKST, dateTimeKST, ymdKST } from "@/lib/format";

export type CorrectionKind = "correction" | "clarification" | "update";

/** Same wording as the public article footer and /corrections. */
export const CORRECTION_KIND_LABEL: Record<CorrectionKind, string> = {
  correction: "정정",
  clarification: "바로잡음",
  update: "업데이트",
};

export const CORRECTION_KIND_HELP: Record<CorrectionKind, string> = {
  correction: "사실관계·수치가 틀렸던 경우. 무엇이 틀렸고 무엇으로 고쳤는지 적습니다.",
  clarification: "틀리지는 않았지만 오해의 소지가 있던 표현을 명확히 한 경우.",
  update: "보도 이후 새로 확인된 사실을 덧붙인 경우.",
};

export { REQUEST_CHANNEL_LABEL } from "@/lib/labels";

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  open: "미처리",
  accepted: "정정 반영",
  rejected: "기각",
};

export const ACTIVITY_KIND_LABEL: Record<string, string> = {
  publish: "공개",
  unpublish: "비공개",
  edit: "수정",
  correct: "정정",
  feature: "Top",
  story: "스토리",
  request: "요청",
};

/** reads / views etc. — null when there is no denominator. */
export function rate(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export function fmtRate(v: number | null, digits = 0): string {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Average dwell per completed read: "1분 24초" / "48초". */
export function fmtDwell(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}분 ${rest}초` : `${m}분`;
}

/** "10.21 14:05" (KST). Year is added when it differs from `refYear`. */
export function shortDateTime(iso: string, refYear?: string): string {
  const day = ymdKST(iso);
  const md = day.slice(5).replace("-", ".");
  const y = day.slice(0, 4);
  return `${refYear && refYear !== y ? `${y}.` : ""}${md} ${clockKST(iso)}`;
}

/** "10.21" (KST) from an ISO timestamp or a yyyy-mm-dd day string. */
export function shortDay(dayOrIso: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayOrIso) ? dayOrIso : ymdKST(dayOrIso);
  return day.slice(5).replace("-", ".");
}

export { dateTimeKST };

/**
 * End of a short window (Top 지정 ≤ 72h) relative to `now`, KST:
 * "21:40" today, "내일 03:00", otherwise "10.23 03:00".
 */
export function untilLabel(iso: string, now: number): string {
  const day = ymdKST(iso);
  if (day === ymdKST(new Date(now))) return clockKST(iso);
  if (day === ymdKST(new Date(now + 86_400_000))) return `내일 ${clockKST(iso)}`;
  return shortDateTime(iso);
}

const DAY = 86_400_000;

/**
 * 언론중재법 제15조: 정정보도 청구를 받은 날부터 3일 이내에 수용 여부를 통지하고,
 * 수용하면 7일 이내에 정정보도문을 게재해야 한다 (반론보도 제16조 준용).
 */
export function requestClock(receivedAt: string, now: number) {
  const t = new Date(receivedAt).getTime();
  const elapsedDays = Math.max(0, Math.floor((now - t) / DAY));
  const replyBy = new Date(t + 3 * DAY).toISOString();
  const publishBy = new Date(t + 7 * DAY).toISOString();
  const daysLeft = Math.ceil((t + 7 * DAY - now) / DAY);
  const tone: "neutral" | "warn" | "bad" = elapsedDays >= 5 ? "bad" : elapsedDays >= 3 ? "warn" : "neutral";
  return { elapsedDays, replyBy, publishBy, daysLeft, tone };
}

/* ─────────────────────────── list URL state ─────────────────────────── */

export interface ArticleFilterValues {
  status?: "published" | "unpublished";
  beat?: Beat;
  q?: string;
  flag?: "requests" | "corrected";
}

export function articlesHref(v: ArticleFilterValues): string {
  const p = new URLSearchParams();
  if (v.status) p.set("status", v.status);
  if (v.beat) p.set("beat", v.beat);
  if (v.flag) p.set("flag", v.flag);
  if (v.q) p.set("q", v.q);
  const qs = p.toString();
  return qs ? `/admin/articles?${qs}` : "/admin/articles";
}

