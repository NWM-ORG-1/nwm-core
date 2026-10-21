export const SITE = {
  name: "뉴웹미디어",
  nameEn: "New Web Media",
  short: "NWM",
  domain: "newweb.media",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://newweb.media").replace(/\/$/, ""),
  tagline: "소음은 빼고, 신호만.",
  description:
    "AI · 크립토 · 경제 · 테크, 그리고 투자자 심리. 지금 알아야 할 신호만 짧고 정확하게 전하는 인터넷 신문.",
  email: "desk@newweb.media",
} as const;

/** 인터넷신문 법정 표기 (신문법 제9조, 제9조의2). Values come from env → site_settings → placeholder. */
export interface Legal {
  title: string; // 제호
  regNo: string; // 등록번호
  regDate: string; // 등록연월일
  publisher: string; // 발행인
  editor: string; // 편집인
  address: string; // 발행소
  phone: string;
  youthOfficer: string; // 청소년보호책임자
  email: string;
  foundedAt: string; // 창간일
}

export const LEGAL_FIELDS: Array<{ key: keyof Legal; label: string; env: string }> = [
  { key: "title", label: "제호", env: "LEGAL_TITLE" },
  { key: "regNo", label: "등록번호", env: "LEGAL_REG_NO" },
  { key: "regDate", label: "등록일", env: "LEGAL_REG_DATE" },
  { key: "publisher", label: "발행인", env: "LEGAL_PUBLISHER" },
  { key: "editor", label: "편집인", env: "LEGAL_EDITOR" },
  { key: "address", label: "발행소", env: "LEGAL_ADDRESS" },
  { key: "phone", label: "전화", env: "LEGAL_PHONE" },
  { key: "youthOfficer", label: "청소년보호책임자", env: "LEGAL_YOUTH_OFFICER" },
  { key: "email", label: "이메일", env: "LEGAL_EMAIL" },
  { key: "foundedAt", label: "창간", env: "LEGAL_FOUNDED_AT" },
];

export const PENDING = "등록 예정";

export const LEGAL_DEFAULTS: Legal = {
  title: "뉴웹미디어(NWM)",
  regNo: PENDING,
  regDate: PENDING,
  publisher: PENDING,
  editor: PENDING,
  address: PENDING,
  phone: PENDING,
  youthOfficer: PENDING,
  email: SITE.email,
  foundedAt: "2026",
};

export function legalFromEnv(): Partial<Legal> {
  const out: Partial<Legal> = {};
  for (const f of LEGAL_FIELDS) {
    const v = process.env[f.env];
    if (v) out[f.key] = v;
  }
  return out;
}
