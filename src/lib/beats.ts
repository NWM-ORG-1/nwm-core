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
    blurb: "AI 모델과 반도체, 관련 기업의 사업과 투자 소식을 다룹니다.",
  },
  crypto: {
    id: "crypto",
    label: "크립토",
    path: "/crypto",
    code: "CRY",
    color: "#e2b36e",
    blurb: "가상자산 시세와 거래소 공지, 규제, 온체인 자금 흐름을 다룹니다.",
  },
  economy: {
    id: "economy",
    label: "경제",
    path: "/economy",
    code: "ECO",
    color: "#6fcfa5",
    blurb: "금리와 환율, 물가, 수출 등 국내외 경제 지표와 정책을 다룹니다.",
  },
  tech: {
    id: "tech",
    label: "테크",
    path: "/tech",
    code: "TEC",
    color: "#78c4e6",
    blurb: "반도체와 빅테크, 플랫폼 기업의 사업과 실적 소식을 다룹니다.",
  },
  sentiment: {
    id: "sentiment",
    label: "투자심리",
    path: "/sentiment",
    code: "SNT",
    color: "#e58bb5",
    blurb: "커뮤니티와 SNS 글, 시장 지표로 집계한 투자자 심리를 보여 드립니다.",
  },
};

export const BEAT_ORDER: Beat[] = ["ai", "crypto", "economy", "tech", "sentiment"];

/**
 * Temporary, while the 인터넷신문 registration is under review: the crypto beat
 * is not put forward. Its pages and articles still work by URL, but it leaves
 * the navigation, the tagline, the home page and the ticker. On unless the
 * Railway variable NEXT_PUBLIC_CRYPTO_LOW_PROFILE is 0; read at build time, so
 * a change shows after the redeploy it triggers.
 */
export const CRYPTO_LOW_PROFILE = !/^(0|false|off)$/i.test(process.env.NEXT_PUBLIC_CRYPTO_LOW_PROFILE?.trim() ?? "");

/** Beats offered in navigation and beat lists. */
export const NAV_BEATS: Beat[] = BEAT_ORDER.filter((b) => !(CRYPTO_LOW_PROFILE && b === "crypto"));

export function isBeat(v: string): v is Beat {
  return v in BEATS;
}
