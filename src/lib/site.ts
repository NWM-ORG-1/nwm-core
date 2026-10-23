import { CRYPTO_LOW_PROFILE } from "@/lib/beats";

/** The fields the paper names about itself (crypto is left out while CRYPTO_LOW_PROFILE is on). */
const FIELDS = CRYPTO_LOW_PROFILE ? ["AI", "경제", "테크"] : ["AI", "크립토", "경제", "테크"];

export const SITE = {
  name: "뉴웹미디어",
  nameEn: "New Web Media",
  short: "NWM",
  domain: "newweb.media",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://newweb.media").replace(/\/$/, ""),
  /** "AI·경제·테크" */
  fields: FIELDS.join("·"),
  tagline: `${FIELDS.join("·")} 전문 인터넷신문`,
  description: `뉴웹미디어는 ${FIELDS.join(", ")} 분야의 소식과 투자자 심리를 다루는 인터넷신문입니다.`,
  email: "desk@newweb.media",
} as const;

/** 인터넷신문 법정 표기 (신문법 제9조, 제9조의2). Values come from env → site_settings → placeholder. */
export interface Legal {
  title: string; // 제호
  company: string; // 상호
  regNo: string; // 등록번호
  regDate: string; // 등록연월일
  publisher: string; // 발행인
  editor: string; // 편집인
  address: string; // 발행소
  phone: string;
  bizNo: string; // 사업자등록번호
  youthOfficer: string; // 청소년보호책임자
  privacyOfficer: string; // 개인정보 보호책임자
  email: string;
  reportEmail: string; // 제보·정정 신청
  foundedAt: string; // 창간일
}

/**
 * `env` is the documented name; `alias` is the name an earlier setup used
 * (SITE_*), read when `env` is not set so existing deployments keep working.
 */
export const LEGAL_FIELDS: Array<{ key: keyof Legal; label: string; env: string; alias?: string }> = [
  { key: "title", label: "제호", env: "LEGAL_TITLE" },
  { key: "company", label: "상호", env: "LEGAL_COMPANY", alias: "SITE_COMPANY" },
  { key: "regNo", label: "등록번호", env: "LEGAL_REG_NO", alias: "SITE_REG_NO" },
  { key: "regDate", label: "등록일", env: "LEGAL_REG_DATE", alias: "SITE_REG_DATE" },
  { key: "publisher", label: "발행인", env: "LEGAL_PUBLISHER", alias: "SITE_PUBLISHER" },
  { key: "editor", label: "편집인", env: "LEGAL_EDITOR", alias: "SITE_EDITOR" },
  { key: "address", label: "발행소", env: "LEGAL_ADDRESS", alias: "SITE_ADDRESS" },
  { key: "phone", label: "전화", env: "LEGAL_PHONE", alias: "SITE_PHONE" },
  { key: "bizNo", label: "사업자등록번호", env: "LEGAL_BIZ_NO", alias: "SITE_BIZ_NO" },
  { key: "youthOfficer", label: "청소년보호책임자", env: "LEGAL_YOUTH_OFFICER", alias: "SITE_YOUTH_OFFICER" },
  { key: "privacyOfficer", label: "개인정보보호책임자", env: "LEGAL_PRIVACY_OFFICER", alias: "SITE_PRIVACY_OFFICER" },
  { key: "email", label: "이메일", env: "LEGAL_EMAIL", alias: "SITE_EMAIL" },
  { key: "reportEmail", label: "제보·정정 이메일", env: "LEGAL_REPORT_EMAIL", alias: "SITE_REPORT_EMAIL" },
  { key: "foundedAt", label: "창간", env: "LEGAL_FOUNDED_AT", alias: "SITE_PUB_DATE" },
];

/** Shown as contact links, not in the 발행 정보 list. */
export const LEGAL_CONTACT_KEYS: ReadonlySet<keyof Legal> = new Set(["email", "reportEmail"]);

export const PENDING = "등록 예정";

export const LEGAL_DEFAULTS: Legal = {
  title: "뉴웹미디어",
  company: PENDING,
  regNo: PENDING,
  regDate: PENDING,
  publisher: PENDING,
  editor: PENDING,
  address: PENDING,
  phone: PENDING,
  bizNo: PENDING,
  youthOfficer: PENDING,
  privacyOfficer: PENDING,
  email: SITE.email,
  reportEmail: SITE.email,
  foundedAt: "2026",
};

/** The environment variable that supplies a field, if any (the documented name first). */
export function legalEnvName(f: (typeof LEGAL_FIELDS)[number], env: Record<string, string | undefined> = process.env): string | null {
  if (env[f.env]?.trim()) return f.env;
  if (f.alias && env[f.alias]?.trim()) return f.alias;
  return null;
}

export function legalFromEnv(env: Record<string, string | undefined> = process.env): Partial<Legal> {
  const out: Partial<Legal> = {};
  for (const f of LEGAL_FIELDS) {
    const name = legalEnvName(f, env);
    if (name) out[f.key] = env[name]!.trim();
  }
  return out;
}

/** "2026-10-19" or "2026" → "2026" for the copyright line. */
export function foundedYear(foundedAt: string): string {
  return /^\d{4}/.exec(foundedAt.trim())?.[0] ?? foundedAt;
}
