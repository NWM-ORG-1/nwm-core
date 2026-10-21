import type { AiInvolvement, CandidateMode, CandidateStatus, SourceKind, SourceStatus } from "@/db/schema";

/** Reader-facing AI involvement label (visible badge). `{editor}` is replaced with the editor's name. */
export const AI_LABEL: Record<AiInvolvement, { short: string; long: string; explain: string }> = {
  auto: {
    short: "자동 생성",
    long: "자동 생성 · 데이터 기반",
    explain: "시세·공시·통계 데이터를 코드 템플릿으로 자동 작성했습니다. 수치는 원천 데이터에서 그대로 가져옵니다.",
  },
  ai_draft_edited: {
    short: "AI 초안",
    long: "AI 초안 · {editor} 검수",
    explain: "1차 자료를 바탕으로 AI가 초안을 쓰고, 이름이 표시된 편집자가 사실관계와 수치를 검수해 발행했습니다.",
  },
  ai_assisted: {
    short: "AI 보조",
    long: "AI 보조 · {editor} 작성",
    explain: "편집자의 기획을 바탕으로 AI가 자료 정리와 문장 다듬기를 도왔고, 편집자가 직접 작성·검수했습니다.",
  },
  human: {
    short: "기자 작성",
    long: "기자 작성",
    explain: "기자가 직접 취재·작성했습니다.",
  },
};

export function aiLabelLong(v: AiInvolvement, editorName?: string | null) {
  return AI_LABEL[v].long.replace("{editor}", editorName ?? "편집자");
}

/** IPTC digital source type (machine-readable provenance in JSON-LD). */
export const IPTC_SOURCE_TYPE: Record<AiInvolvement, string> = {
  auto: "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
  ai_draft_edited: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
  ai_assisted: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
  human: "http://cv.iptc.org/newscodes/digitalsourcetype/humanEdits",
};

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  new: "신규",
  drafting: "작성중",
  review: "검토",
  scheduled: "예약",
  published: "발행",
  rejected: "반려",
};

export const CANDIDATE_MODE_LABEL: Record<CandidateMode, { label: string; short: string; ai: AiInvolvement }> = {
  feed_draft: { label: "피드 → AI 초안", short: "피드 AI", ai: "ai_draft_edited" },
  data_auto: { label: "데이터 자동 생성", short: "데이터 자동", ai: "auto" },
  editor_idea: { label: "아이디어 → AI 어시스트", short: "아이디어", ai: "ai_assisted" },
};

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  rss: "RSS",
  api: "API",
  ws: "WebSocket",
  scrape: "수집기",
  press_pdf: "보도자료 PDF",
  manual: "수동",
};

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  active: "수집중",
  paused: "일시정지",
  error: "오류",
};

export const TRUST_TIER_LABEL: Record<number, string> = {
  1: "공식·1차",
  2: "신뢰",
  3: "커뮤니티",
  4: "미확인",
};

export const SENTIMENT_ZONES = [
  { max: -60, label: "극단적 공포" },
  { max: -20, label: "공포" },
  { max: 20, label: "중립" },
  { max: 60, label: "탐욕" },
  { max: 101, label: "극단적 탐욕" },
] as const;

export function sentimentLabel(score: number) {
  return SENTIMENT_ZONES.find((z) => score <= z.max)?.label ?? "중립";
}
