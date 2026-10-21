/**
 * Labels and pure formatters for the feeds / sources / experiments screens.
 * No React, no server imports — safe in both Server and Client Components.
 */

export type ExperimentStatus = "draft" | "running" | "paused" | "concluded";
export type PrimaryMetric = "publish_rate" | "promote_rate" | "read_rate" | "time_to_publish" | "correction_rate";
export type InboxStatus = "new" | "promoted" | "dismissed" | "all";
export type PromoteMode = "feed_draft" | "data_auto";

export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
  new: "새 항목",
  promoted: "승격됨",
  dismissed: "기각",
  all: "전체",
};

export const PROMOTE_MODE_LABEL: Record<PromoteMode, string> = {
  feed_draft: "피드 → AI 초안",
  data_auto: "데이터 자동",
};

export const DISMISS_PRESETS = ["중복", "신호 약함", "광고성", "출처 불명"] as const;

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: "준비",
  running: "진행 중",
  paused: "일시중지",
  concluded: "종료",
};

export const EXPERIMENT_STATUS_TONE: Record<ExperimentStatus, "neutral" | "good" | "warn" | "ice"> = {
  draft: "neutral",
  running: "good",
  paused: "warn",
  concluded: "ice",
};

export const PRIMARY_METRIC: Record<PrimaryMetric, { label: string; explain: string; better: "higher" | "lower" }> = {
  publish_rate: { label: "발행률", explain: "후보 중 실제 발행까지 간 비율", better: "higher" },
  promote_rate: { label: "승격률", explain: "수집 항목 중 후보로 승격된 비율", better: "higher" },
  read_rate: { label: "완독률", explain: "조회 대비 끝까지 읽은 비율", better: "higher" },
  time_to_publish: { label: "발행 소요시간", explain: "첫 수집부터 발행까지 걸린 시간(중앙값)", better: "lower" },
  correction_rate: { label: "정정률", explain: "발행 기사 중 정정이 붙은 비율", better: "lower" },
};

export function isPrimaryMetric(v: string): v is PrimaryMetric {
  return v in PRIMARY_METRIC;
}
export function isExperimentStatus(v: string): v is ExperimentStatus {
  return v in EXPERIMENT_STATUS_LABEL;
}

export const LANG_LABEL: Record<string, string> = {
  ko: "한국어",
  en: "영어",
  ja: "일본어",
  zh: "중국어",
};

export const TRUST_TIER_HELP: Record<number, string> = {
  1: "정부·거래소·공시 시스템 등 1차 원천. 수치를 그대로 인용할 수 있습니다.",
  2: "검증된 매체·기업 공식 채널. 사실 확인 후 사용합니다.",
  3: "커뮤니티·소셜 집계. 흐름을 보는 용도이며 단독 근거로 쓰지 않습니다.",
  4: "출처를 확인하지 못한 피드. 1차 자료 확인 전까지 발행 근거가 될 수 없습니다.",
};

/** 600 → "10분", 45 → "45초", 7200 → "2시간" */
export function formatInterval(sec: number): string {
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}분 ${s}초` : `${m}분`;
  }
  if (sec < 86_400) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${Math.round(sec / 86_400)}일`;
}

/** 42 → "42분", 95 → "1시간 35분", null → "—" */
export function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/** Ratio as a percentage string; "—" when the denominator is zero. */
export function rate(n: number, d: number, digits = 0): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(digits)}%`;
}

export function ratio(n: number, d: number): number | null {
  return d ? n / d : null;
}

/** Builds an /admin/feeds URL from the current filters with overrides ("" removes a key). */
export function inboxHref(current: Record<string, string | undefined>, over: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  const merged = { ...current, ...over };
  for (const k of ["status", "source", "experiment", "beat", "minScore", "q"]) {
    const v = merged[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `/admin/feeds?${s}` : "/admin/feeds";
}
