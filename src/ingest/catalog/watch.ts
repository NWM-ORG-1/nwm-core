import type { CatalogSource } from "./index";

/**
 * Pages and JSON lists without a feed (docs/sources-research-2026-10.md §3):
 * terms and policies (page.watch text — changed paragraphs become one item,
 * the start of "the new contract says…" explainers), change logs and model
 * retirement schedules, notice boards (page.watch links), and announcement
 * APIs (json.list). Every entry ran from inside Railway on 2026-10-24
 * ("railway ✓"); a page read twice a minute and a half apart did not change.
 *
 * Left out: Meta's terms (facebook.com robots.txt disallows them), OpenAI,
 * xAI, Coinbase and Upbit's notice API (bot walls), Mistral and xAI docs
 * (drawn by script), Binance announcements (robots.txt), Naver·Kakao·Toss
 * terms (their terms forbid automated collection).
 */

const TERMS = (attribution: string, termsUrl?: string) => ({ commercialOk: null, redistributionOk: false, verbatimOk: false, attribution, ...(termsUrl ? { termsUrl } : {}) });
const KR_GOV = (attribution: string) => ({ commercialOk: true, redistributionOk: false, verbatimOk: true, attribution });
const US_GOV = (attribution: string) => ({ commercialOk: true, redistributionOk: true, verbatimOk: true, attribution });
const EXCHANGE = (attribution: string) => ({ commercialOk: null, redistributionOk: false, verbatimOk: false, attribution });

const SIX_HOURS = 6 * 3600;
const doc = (label: string) => ({ label });
const HF = (org: string, name: string): CatalogSource => ({
  slug: `hf-models-${org.toLowerCase()}`,
  name: `허깅페이스 새 모델: ${name}`,
  adapter: "json.list",
  url: `https://huggingface.co/api/models?author=${org}&sort=createdAt&direction=-1&limit=20`, // railway ✓
  beats: ["ai"],
  lang: "en",
  trustTier: 1,
  pollIntervalSec: 3 * 3600,
  config: { fields: { id: "id", title: `${name} 새 모델 공개: {id}`, url: "https://huggingface.co/{id}", time: "createdAt" }, maxAgeDays: 3, maxItems: 10 },
  note: "국내 연구소의 모델 공개 — 모델 카드(라이선스·성능 표)가 1차 자료입니다.",
  license: TERMS(`출처: Hugging Face (${org})`),
});

export const WATCH: CatalogSource[] = [
  /* ── 약관·정책 (page.watch text) ── */
  {
    slug: "watch-anthropic-commercial-terms",
    name: "Anthropic 상업 이용 약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://www.anthropic.com/legal/commercial-terms", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Anthropic 상업 이용 약관"),
    license: TERMS("출처: Anthropic"),
  },
  {
    slug: "watch-anthropic-consumer-terms",
    name: "Anthropic 소비자 약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://www.anthropic.com/legal/consumer-terms", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Anthropic 소비자 약관"),
    license: TERMS("출처: Anthropic"),
  },
  {
    slug: "watch-anthropic-usage-policy",
    name: "Anthropic 이용 정책 (변경 감시)",
    adapter: "page.watch",
    url: "https://www.anthropic.com/legal/aup", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Anthropic 이용 정책"),
    license: TERMS("출처: Anthropic"),
  },
  {
    slug: "watch-gemini-api-terms",
    name: "Gemini API 추가 약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://ai.google.dev/gemini-api/terms", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Gemini API 추가 약관"),
    note: "이용 가능 지역·연령·학습 이용 조항이 바뀌면 국내 개발사에 바로 영향이 있습니다.",
    license: TERMS("출처: Google"),
  },
  {
    slug: "watch-google-genai-use-policy",
    name: "구글 생성형 AI 금지 용도 정책 (변경 감시)",
    adapter: "page.watch",
    url: "https://policies.google.com/terms/generative-ai/use-policy?hl=en", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("구글 생성형 AI 금지 용도 정책"),
    license: TERMS("출처: Google"),
  },
  {
    slug: "watch-microsoft-services-agreement",
    name: "마이크로소프트 서비스 약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://www.microsoft.com/en-us/servicesagreement", // railway ✓
    beats: ["ai", "tech"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    // the sections sit in <div class="page"> blocks; the menu beside them repeats every heading
    config: { label: "마이크로소프트 서비스 약관", select: "div.page" },
    note: "Copilot·AI 서비스 조항이 들어 있습니다. 개정은 보통 시행 한 달 전에 게시됩니다.",
    license: TERMS("출처: Microsoft"),
  },
  {
    slug: "watch-telegram-tos",
    name: "텔레그램 이용약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://telegram.org/tos", // railway ✓
    beats: ["tech", "crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("텔레그램 이용약관"),
    license: TERMS("출처: Telegram"),
  },
  {
    slug: "watch-telegram-content-licensing",
    name: "텔레그램 콘텐츠 라이선스·AI 수집 약관 (변경 감시)",
    adapter: "page.watch",
    url: "https://telegram.org/tos/content-licensing", // railway ✓
    beats: ["tech", "ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("텔레그램 콘텐츠 라이선스·AI 수집 약관"),
    note: "우리 텔레그램 채널 수집(운영자 동의)의 근거 약관이기도 합니다. 바뀌면 소스별 동의 기록을 다시 봅니다.",
    license: TERMS("출처: Telegram"),
  },
  {
    slug: "watch-apple-app-review-guidelines",
    name: "애플 앱 심사 지침 (변경 감시)",
    adapter: "page.watch",
    url: "https://developer.apple.com/app-store/review/guidelines/", // railway ✓
    beats: ["tech", "ai", "crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("애플 앱 심사 지침"),
    note: "AI 앱·가상자산 앱·결제 조항. 애플 개발자 뉴스(apple-developer-news)가 개정을 알리고, 이 소스가 바뀐 문장을 보여 줍니다.",
    license: TERMS("출처: Apple"),
  },

  /* ── 변경 기록·지원 종료 일정 (page.watch text) ── */
  {
    slug: "watch-claude-release-notes",
    name: "Claude 플랫폼 변경 기록 (변경 감시)",
    adapter: "page.watch",
    url: "https://platform.claude.com/docs/en/release-notes/overview", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: doc("Claude 플랫폼 변경 기록"),
    license: TERMS("출처: Anthropic"),
  },
  {
    slug: "watch-claude-model-deprecations",
    name: "Claude 모델 지원 종료 일정 (변경 감시)",
    adapter: "page.watch",
    url: "https://platform.claude.com/docs/en/about-claude/model-deprecations", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Claude 모델 지원 종료 일정"),
    note: "모델 종료일이 정해지면 국내 서비스가 옮겨야 합니다 — 짧은 안내 기사감.",
    license: TERMS("출처: Anthropic"),
  },
  {
    slug: "watch-gemini-api-changelog",
    name: "Gemini API 변경 기록 (변경 감시)",
    adapter: "page.watch",
    url: "https://ai.google.dev/gemini-api/docs/changelog", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: doc("Gemini API 변경 기록"),
    license: TERMS("출처: Google"),
  },
  {
    slug: "watch-gemini-api-deprecations",
    name: "Gemini 모델 지원 종료 일정 (변경 감시)",
    adapter: "page.watch",
    url: "https://ai.google.dev/gemini-api/docs/deprecations", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: SIX_HOURS,
    config: doc("Gemini 모델 지원 종료 일정"),
    license: TERMS("출처: Google"),
  },

  /* ── 공지 목록 (page.watch links) ── */
  {
    slug: "watch-fsc-press",
    name: "금융위원회 보도자료 (목록 감시)",
    adapter: "page.watch",
    url: "https://www.fsc.go.kr/no010101", // railway ✓
    beats: ["economy", "crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 900,
    config: {
      mode: "links",
      linkPattern: "/no010101/\\d+",
      linkTemplate: { regex: "/no010101/(\\d+)", url: "https://www.fsc.go.kr/no010101/{1}" },
      maxAgeDays: 3,
    },
    note: "금융위 RSS(fsc-press)가 점검 중이라 목록 페이지를 읽습니다. 규정변경예고·입법예고도 여기 함께 올라옵니다. RSS가 돌아오면 둘 중 하나를 끕니다.",
    license: KR_GOV("출처: 금융위원회"),
  },
  {
    slug: "watch-ftc-kr-press",
    name: "공정거래위원회 보도자료 (목록 감시)",
    adapter: "page.watch",
    url: "https://www.ftc.go.kr/www/selectBbsNttList.do?bordCd=3&key=12", // railway ✓
    beats: ["economy", "tech"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: {
      mode: "links",
      linkPattern: "selectBbsNttView\\.do",
      linkTemplate: { regex: "nttSn=(\\d+)", url: "https://www.ftc.go.kr/www/selectBbsNttView.do?key=12&bordCd=3&nttSn={1}" },
      maxAgeDays: 3,
    },
    note: "플랫폼·AI 표시광고·과징금. RSS가 없습니다.",
    license: KR_GOV("출처: 공정거래위원회"),
  },
  {
    slug: "watch-pipc-press",
    name: "개인정보보호위원회 보도자료 (목록 감시)",
    adapter: "page.watch",
    url: "https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS074&mCode=C020010000", // railway ✓
    beats: ["tech", "ai"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: {
      mode: "links",
      linkPattern: "selectBoardArticle\\.do",
      linkTemplate: { regex: "nttId=(\\d+)", url: "https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId={1}" },
      stripTitle: "\\s+N$",
      maxAgeDays: 3,
    },
    note: "유출 처분·AI 개인정보 지침. RSS가 없습니다.",
    license: KR_GOV("출처: 개인정보보호위원회"),
  },
  {
    slug: "watch-ofac-recent-actions",
    name: "미 재무부 OFAC 최근 조치 (목록 감시)",
    adapter: "page.watch",
    url: "https://ofac.treasury.gov/recent-actions", // railway ✓
    beats: ["crypto", "economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3600,
    config: { mode: "links", linkPattern: "/recent-actions/\\d{8}", maxAgeDays: 3 },
    note: "제재 대상 지정(북한 연계 지갑 등). OFAC RSS는 2025-01-31에 폐지됐습니다. 사이트가 느려(10–20초) 한 시간에 한 번 읽습니다.",
    license: US_GOV("출처: 미국 재무부 해외자산통제실(OFAC)"),
  },

  /* ── 거래소 공지·상장 (json.list, exchange.markets) ── */
  {
    slug: "bithumb-notices",
    name: "빗썸 공지사항",
    adapter: "json.list",
    url: "https://api.bithumb.com/v1/notices", // railway ✓
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 180,
    config: { fields: { id: "pc_url", title: "title", url: "pc_url", summary: "categories", time: "published_at" }, exclude: ["이벤트"], maxAgeDays: 2 },
    note: "마켓 추가·유의 촉구·입출금 중지 공지를 게시 시각 그대로 받습니다(에어드랍·수수료 이벤트는 거름).",
    license: EXCHANGE("출처: 빗썸"),
  },
  {
    slug: "bybit-new-listings",
    name: "바이빗 신규 상장 공지",
    adapter: "json.list",
    url: "https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=20", // railway ✓
    beats: ["crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 600,
    config: {
      itemsPath: "result.list",
      fields: { id: "url", title: "title", url: "url", summary: "description", time: "publishTime" },
      include: ["listing"],
      exclude: ["TradFi"],
      maxAgeDays: 2,
    },
    note: "해외 상장은 국내 상장의 선행 신호로 씁니다. 주식 토큰(TradFi) 무기한 선물은 거릅니다.",
    license: EXCHANGE("출처: Bybit"),
  },
  {
    slug: "okx-new-listings",
    name: "OKX 신규 상장 공지",
    adapter: "json.list",
    url: "https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings", // railway ✓
    beats: ["crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 600,
    config: { itemsPath: "data.0.details", fields: { id: "url", title: "title", url: "url", time: "pTime" }, maxAgeDays: 2 },
    note: "영어로 물어야 답합니다(한국어로 물으면 annType 오류).",
    license: EXCHANGE("출처: OKX"),
  },
  {
    slug: "okx-delistings",
    name: "OKX 상장폐지 공지",
    adapter: "json.list",
    url: "https://www.okx.com/api/v5/support/announcements?annType=announcements-delistings", // railway ✓
    beats: ["crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { itemsPath: "data.0.details", fields: { id: "url", title: "title", url: "url", time: "pTime" }, maxAgeDays: 3 },
    license: EXCHANGE("출처: OKX"),
  },
  {
    slug: "coinone-markets",
    name: "코인원 상장·거래지원 변동",
    adapter: "exchange.markets",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 60,
    config: { exchange: "coinone", quotes: ["KRW"] },
    note: "코인원 공개 마켓 목록(api.coinone.co.kr) — railway ✓. 거래가 멈춘 마켓은 목록에서 빠진 것으로 봅니다.",
    license: EXCHANGE("출처: 코인원"),
  },
  {
    slug: "digitalx-markets",
    name: "디지털엑스(옛 코빗) 상장·거래지원 변동",
    adapter: "exchange.markets",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 60,
    config: { exchange: "digitalx", quotes: ["KRW"] },
    note: "미래에셋 디지털엑스 공개 마켓 목록(api.digitalx.miraeasset.com) — railway ✓.",
    license: EXCHANGE("출처: 디지털엑스"),
  },
  {
    slug: "gopax-markets",
    name: "고팍스 상장·거래지원 변동",
    adapter: "exchange.markets",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 120,
    config: { exchange: "gopax", quotes: ["KRW"] },
    note: "고팍스 공개 마켓 목록(api.gopax.co.kr) — railway ✓.",
    license: EXCHANGE("출처: 고팍스"),
  },

  /* ── 미국 연방관보 (json.list) ── */
  {
    slug: "fedreg-ai-rules",
    name: "미 연방관보: AI 규칙·대통령 문서",
    adapter: "json.list",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=%22artificial+intelligence%22&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Btype%5D%5B%5D=PRESDOCU&order=newest&per_page=20",
    beats: ["ai", "economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: { itemsPath: "results", fields: { id: "document_number", title: "{type}: {title}", url: "html_url", summary: "abstract", time: "publication_date" }, maxAgeDays: 3 },
    note: "규칙·규칙안·대통령 문서만(공고는 제외). 게재 하루 전 공람본도 같은 번호로 올라옵니다.",
    license: US_GOV("출처: Federal Register"),
  },
  {
    slug: "fedreg-digital-asset-rules",
    name: "미 연방관보: 스테이블코인·디지털자산 규칙",
    adapter: "json.list",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=stablecoin+%7C+%22digital+asset%22+%7C+cryptocurrency&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Btype%5D%5B%5D=PRESDOCU&order=newest&per_page=20",
    beats: ["crypto", "economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: { itemsPath: "results", fields: { id: "document_number", title: "{type}: {title}", url: "html_url", summary: "abstract", time: "publication_date" }, maxAgeDays: 3 },
    note: "GENIUS법 시행 규칙 등. 규칙·규칙안·대통령 문서만.",
    license: US_GOV("출처: Federal Register"),
  },

  /* ── 모델 공개 (json.list) ── */
  {
    slug: "openrouter-new-models",
    name: "OpenRouter 신규 모델",
    adapter: "json.list",
    url: "https://openrouter.ai/api/v1/models", // railway ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 3600,
    config: { itemsPath: "data", fields: { id: "id", title: "{name}", url: "https://openrouter.ai/{id}", summary: "description", time: "created" }, maxAgeDays: 2, maxItems: 10 },
    note: "새 모델이 API로 풀리는 순간을 가장 빨리 보여 주는 목록. 설명은 제공사 문구라 사실 확인은 제공사 발표로 합니다.",
    license: TERMS("출처: OpenRouter"),
  },
  HF("LGAI-EXAONE", "LG AI연구원 EXAONE"),
  HF("naver-hyperclovax", "네이버 HyperCLOVA X"),
  HF("upstage", "업스테이지"),
];
