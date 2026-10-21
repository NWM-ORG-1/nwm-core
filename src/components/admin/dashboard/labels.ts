/** Labels shared by the dashboard, activity, stories and settings screens (server + client safe). */

export type Tone = "neutral" | "ice" | "good" | "warn" | "bad" | "live";

export const ACTIVITY_KIND: Record<string, { label: string; tone: Tone }> = {
  ingest: { label: "수집", tone: "neutral" },
  promote: { label: "승격", tone: "ice" },
  dismiss: { label: "기각", tone: "neutral" },
  restore: { label: "기각 취소", tone: "neutral" },
  draft: { label: "초안", tone: "ice" },
  assist: { label: "AI 어시스트", tone: "ice" },
  move: { label: "상태 변경", tone: "neutral" },
  check: { label: "체크", tone: "neutral" },
  publish: { label: "발행", tone: "good" },
  schedule: { label: "예약", tone: "ice" },
  reject: { label: "반려", tone: "neutral" },
  unpublish: { label: "비공개", tone: "bad" },
  correct: { label: "정정", tone: "warn" },
  edit: { label: "수정", tone: "neutral" },
  feature: { label: "Top 편성", tone: "neutral" },
  story: { label: "스토리", tone: "neutral" },
  source: { label: "소스", tone: "neutral" },
  experiment: { label: "가설", tone: "neutral" },
  settings: { label: "설정", tone: "neutral" },
  request: { label: "정정 요청", tone: "warn" },
};

/** Filter tab order on /admin/activity. Kinds not listed still get a tab once they have entries. */
export const ACTIVITY_TAB_ORDER = [
  "publish",
  "promote",
  "dismiss",
  "draft",
  "assist",
  "schedule",
  "correct",
  "request",
  "unpublish",
  "story",
  "source",
  "experiment",
  "settings",
] as const;

export function activityKind(kind: string) {
  return ACTIVITY_KIND[kind] ?? { label: kind, tone: "neutral" as const };
}

export const ENTITY_LABEL: Record<string, string> = {
  feed_item: "피드 항목",
  candidate: "후보",
  article: "기사",
  source: "소스",
  experiment: "가설",
  story: "스토리",
  settings: "설정",
  correction_request: "정정 요청",
};

/** Admin link for an activity entry's entity; null when there is no detail screen. */
export function activityHref(entityType: string, entityId: string, requestArticleId?: string | null): string | null {
  switch (entityType) {
    case "candidate":
      return `/admin/candidates/${entityId}`;
    case "article":
      return `/admin/articles/${entityId}`;
    case "source":
      return `/admin/sources/${entityId}`;
    case "experiment":
      return "/admin/experiments";
    case "story":
      return "/admin/stories";
    case "settings":
      return "/admin/settings";
    case "correction_request":
      return requestArticleId ? `/admin/articles/${requestArticleId}` : null;
    default:
      return null;
  }
}

export const EXPERIMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "준비", tone: "neutral" },
  running: { label: "진행중", tone: "good" },
  paused: { label: "일시정지", tone: "warn" },
  concluded: { label: "종료", tone: "neutral" },
};

export const STORY_STATUS: Record<"developing" | "settled", { label: string; tone: Tone; hint: string }> = {
  developing: { label: "진행중", tone: "ice", hint: "후속 보도가 이어지는 스토리 — 공개 사이트 스토리 레일에 노출" },
  settled: { label: "일단락", tone: "neutral", hint: "보도가 마무리된 스토리 — 아카이브로 유지" },
};
