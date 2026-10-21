import type { Beat } from "@/db/schema";

export interface BeatMeta {
  id: Beat;
  label: string;
  path: `/${Beat}`;
  /** short mono code for HUD labels */
  code: string;
  /** desaturated accent — keep in sync with globals.css --beat-* */
  color: string;
  blurb: string;
}

export const BEATS: Record<Beat, BeatMeta> = {
  ai: {
    id: "ai",
    label: "AI",
    path: "/ai",
    code: "AI",
    color: "#a8a4f0",
    blurb: "모델, 칩, 돈의 흐름. AI 산업에서 실제로 움직이는 것만.",
  },
  crypto: {
    id: "crypto",
    label: "크립토",
    path: "/crypto",
    code: "CRY",
    color: "#e2b36e",
    blurb: "가격보다 구조. 온체인·거래소·자금 흐름으로 읽는 디지털자산.",
  },
  economy: {
    id: "economy",
    label: "경제",
    path: "/economy",
    code: "ECO",
    color: "#6fcfa5",
    blurb: "금리, 환율, 수출. 지갑과 포트폴리오에 닿는 거시경제.",
  },
  tech: {
    id: "tech",
    label: "테크",
    path: "/tech",
    code: "TEC",
    color: "#78c4e6",
    blurb: "반도체와 빅테크, 모빌리티. 기술이 시장을 바꾸는 순간.",
  },
  sentiment: {
    id: "sentiment",
    label: "센티먼트",
    path: "/sentiment",
    code: "SNT",
    color: "#e58bb5",
    blurb: "커뮤니티와 소셜에서 측정한 투자자 심리. 군중은 지금 어디로 쏠리는가.",
  },
};

export const BEAT_ORDER: Beat[] = ["ai", "crypto", "economy", "tech", "sentiment"];

export function isBeat(v: string): v is Beat {
  return v in BEATS;
}
