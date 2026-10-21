import type { Beat } from "@/db/schema";

/**
 * Sources the newsroom starts with. `npm run sources:sync` (and the worker at
 * startup) inserts each slug once; editors own the rows afterwards (pause,
 * edit, delete — a deleted slug is not re-added). `--update` re-applies the
 * technical fields below to existing catalog rows.
 *
 * Every URL marked "probe ✓" answered from a GitHub runner on 2026-10-21.
 * Paused entries need a key, a decision, or a check from the deploy region.
 */

export interface CatalogSource {
  slug: string;
  name: string;
  adapter: string;
  url?: string;
  beats: Beat[];
  lang: "ko" | "en";
  /** 1 official/primary · 2 reputable · 3 community · 4 unverified */
  trustTier: 1 | 2 | 3 | 4;
  signalOnly?: boolean;
  pollIntervalSec?: number;
  config: Record<string, unknown>;
  status?: "active" | "paused";
  /** why it is paused / what to check (shown in the source editor) */
  note?: string;
  license: {
    commercialOk?: boolean | null;
    redistributionOk?: boolean | null;
    verbatimOk?: boolean | null;
    attribution?: string;
    retentionDays?: number;
    termsUrl?: string;
  };
}

const DEFAULT_SEC_WATCH = [
  "NVIDIA",
  "MICROSOFT",
  "APPLE INC",
  "ALPHABET",
  "AMAZON COM",
  "META PLATFORMS",
  "TESLA",
  "ADVANCED MICRO DEVICES",
  "INTEL CORP",
  "BROADCOM",
  "ORACLE CORP",
  "PALANTIR",
  "SUPER MICRO COMPUTER",
  "TAIWAN SEMICONDUCTOR",
  "COINBASE",
  "STRATEGY INC",
  "ROBINHOOD",
  "MARA HOLDINGS",
  "RIOT PLATFORMS",
  "CIRCLE INTERNET",
  "COUPANG",
];

/** DC rows: notices, surveys and ads carry a non-numeric number cell */
const DC_SKIP = { sel: "td.gall_num", regex: "\\D" };

const DC_FIELDS = {
  id: { attr: "data-no" },
  title: { sel: "td.gall_tit a" },
  link: { sel: "td.gall_tit a", attr: "href" },
  time: { sel: "td.gall_date", attr: "title" },
  author: { sel: "td.gall_writer", attr: "data-nick" },
  views: { sel: "td.gall_count" },
  likes: { sel: "td.gall_recommend" },
  comments: { sel: ".reply_num", regex: "(\\d+)" },
};

const COMMUNITY_LICENSE = {
  commercialOk: null,
  redistributionOk: false,
  verbatimOk: false,
  attribution: "집계 수치만 공개 (원문·닉네임 비공개)",
  retentionDays: 120,
};

export const CATALOG: CatalogSource[] = [
  /* ── official · Korea ── */
  {
    slug: "bok-stat-press",
    name: "한국은행 통계 보도자료",
    adapter: "rss",
    url: "https://www.bok.or.kr/portal/bbs/B0000501/news.rss?menuNo=201264", // probe ✓
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 900,
    config: { maxItems: 30, maxAgeDays: 14, boost: ["국제수지", "소비자", "성장률", "가계", "금리"] },
    license: { commercialOk: true, redistributionOk: false, verbatimOk: true, attribution: "출처: 한국은행", termsUrl: "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228" },
  },
  {
    slug: "kisa-security-notice",
    name: "KISA 보호나라 보안공지",
    adapter: "rss",
    url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133", // probe ✓
    beats: ["tech"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 30, maxAgeDays: 14 },
    license: { commercialOk: true, redistributionOk: false, verbatimOk: true, attribution: "출처: 한국인터넷진흥원(KISA) 보호나라" },
  },
  {
    slug: "fsc-press",
    name: "금융위원회 보도자료",
    adapter: "rss",
    url: "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111",
    beats: ["economy", "crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 900,
    config: { maxItems: 30, boost: ["가상자산", "스테이블코인", "공매도", "상장"] },
    status: "paused",
    note: "2026-10 기준 금융위 RSS가 ‘서비스 점검 중’(503). 재개되면 활성화하세요.",
    license: { commercialOk: true, verbatimOk: true, attribution: "출처: 금융위원회" },
  },
  {
    slug: "motir-press",
    name: "산업통상부 보도·참고자료",
    adapter: "rss",
    url: "https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/rss",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 900,
    config: { method: "POST", maxItems: 30, boost: ["수출입", "수출", "무역수지", "반도체"] }, // probe ✓ (POST)
    note: "게시판의 RSS 버튼이 POST 폼이라 POST로 받습니다. 월간 수출입동향은 매월 1일 09시. 관세청 10일 잠정치는 RSS가 없어 언론 보도·관세청 누리집으로 확인합니다.",
    license: { commercialOk: true, verbatimOk: true, attribution: "출처: 산업통상부" },
  },
  {
    slug: "dart-major",
    name: "OpenDART 주요 공시",
    adapter: "dart.list",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 60,
    config: { corpCls: ["Y", "K"], maxPages: 3 },
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "출처: 금융감독원 DART", termsUrl: "https://opendart.fss.or.kr/intro/terms.do" },
  },
  {
    slug: "ecos-keystats",
    name: "한국은행 100대 통계지표",
    adapter: "ecos.keystats",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { include: [], exclude: [] },
    license: { commercialOk: true, verbatimOk: true, attribution: "출처: 한국은행 ECOS (타 기관 작성 통계는 해당 기관 표기)", termsUrl: "https://ecos.bok.or.kr/" },
  },
  {
    slug: "ecos-base-rate",
    name: "한국은행 기준금리 (시계열)",
    adapter: "ecos.series",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 3600,
    config: { series: [{ code: "722Y001", cycle: "M", item1: "0101000", name: "한국은행 기준금리", metric: "kr_base_rate", announce: false }] }, // probe ✓ (sample key)
    license: { commercialOk: true, verbatimOk: true, attribution: "출처: 한국은행 ECOS" },
  },
  {
    slug: "kosis-cpi",
    name: "소비자물가지수 (KOSIS)",
    adapter: "kosis.series",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 3600,
    config: {
      queries: [{ name: "소비자물가지수(총지수)", params: { orgId: "101", tblId: "DT_1J22003", itmId: "T", objL1: "T10", prdSe: "M", newEstPrdCnt: "13" }, metric: "kr_cpi", announce: true }],
    },
    status: "paused",
    note: "KOSIS 키 발급 후 ‘URL 생성’ 결과로 params를 확인하고 활성화하세요.",
    license: { commercialOk: true, redistributionOk: false, verbatimOk: true, attribution: "출처: 국가데이터처 KOSIS" },
  },
  {
    slug: "upbit-markets",
    name: "업비트 상장·유의종목",
    adapter: "exchange.markets",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 60,
    config: { exchange: "upbit", quotes: ["KRW", "BTC", "USDT"], cautions: [] }, // probe ✓
    license: { commercialOk: null, redistributionOk: false, verbatimOk: false, attribution: "출처: 업비트" },
  },
  {
    slug: "bithumb-markets",
    name: "빗썸 상장·유의종목",
    adapter: "exchange.markets",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 60,
    config: { exchange: "bithumb", quotes: ["KRW"], cautions: [] }, // probe ✓
    license: { commercialOk: null, redistributionOk: false, verbatimOk: false, attribution: "출처: 빗썸" },
  },

  /* ── official · global ── */
  {
    slug: "sec-edgar-watch",
    name: "SEC EDGAR 관심 기업 공시",
    adapter: "sec.edgar",
    beats: ["economy", "tech", "crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 120,
    config: { forms: ["8-K", "6-K", "S-1"], watch: DEFAULT_SEC_WATCH, allFilersForms: ["S-1"], count: 100 }, // probe ✓
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "Source: SEC EDGAR", termsUrl: "https://www.sec.gov/privacy#dissemination" },
  },
  {
    slug: "fed-press",
    name: "미 연준 보도자료",
    adapter: "rss",
    url: "https://www.federalreserve.gov/feeds/press_all.xml", // probe ✓
    beats: ["economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 900,
    config: { maxItems: 30, boost: ["FOMC", "rate", "monetary"] },
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "Source: Federal Reserve Board" },
  },
  {
    slug: "sec-press",
    name: "SEC 보도자료",
    adapter: "rss",
    url: "https://www.sec.gov/news/pressreleases.rss", // probe ✓
    beats: ["economy", "crypto"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 30, boost: ["crypto", "digital asset", "ETF", "token"] },
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "Source: U.S. SEC" },
  },
  {
    slug: "openai-news",
    name: "OpenAI News",
    adapter: "rss",
    url: "https://openai.com/news/rss.xml", // probe ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 900,
    config: { maxItems: 20, maxAgeDays: 7 },
    license: { commercialOk: null, verbatimOk: false, attribution: "Source: OpenAI" },
  },
  {
    slug: "google-ai-blog",
    name: "Google AI 블로그",
    adapter: "rss",
    url: "https://blog.google/innovation-and-ai/technology/ai/rss/", // probe ✓ (moved from /technology/ai/rss/)
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 20 },
    license: { commercialOk: null, verbatimOk: false, attribution: "Source: Google" },
  },
  {
    slug: "deepmind-blog",
    name: "Google DeepMind 블로그",
    adapter: "rss",
    url: "https://deepmind.google/blog/rss.xml", // probe ✓
    beats: ["ai"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 20 },
    license: { commercialOk: null, verbatimOk: false, attribution: "Source: Google DeepMind" },
  },
  {
    slug: "nvidia-blog",
    name: "NVIDIA 블로그",
    adapter: "rss",
    url: "https://blogs.nvidia.com/feed/", // probe ✓
    beats: ["ai", "tech"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 20 },
    license: { commercialOk: null, verbatimOk: false, attribution: "Source: NVIDIA (알림 용도)" },
  },
  {
    slug: "samsung-newsroom",
    name: "삼성전자 뉴스룸",
    adapter: "rss",
    url: "https://news.samsung.com/kr/feed", // probe ✓
    beats: ["tech"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 1800,
    config: { maxItems: 20, boost: ["반도체", "HBM", "파운드리", "AI"] },
    license: { commercialOk: null, verbatimOk: false, attribution: "출처: 삼성전자 뉴스룸" },
  },
  {
    slug: "hf-daily-papers",
    name: "Hugging Face Daily Papers",
    adapter: "hf.papers",
    beats: ["ai"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 3600,
    config: { limit: 50, minUpvotes: 0 }, // probe ✓
    license: { commercialOk: null, verbatimOk: false, attribution: "via Hugging Face Papers (원 논문: arXiv)" },
  },
  {
    slug: "arxiv-ai",
    name: "arXiv AI 신규 논문",
    adapter: "arxiv",
    beats: ["ai"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 6 * 3600,
    config: { categories: ["cs.AI", "cs.CL", "cs.LG"], announceTypes: ["new"], include: [], maxItems: 120 }, // probe ✓
    status: "paused",
    note: "하루 수백 건입니다. 관심 키워드(include)를 정한 뒤 활성화하세요.",
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "Source: arXiv (메타데이터 CC0, PDF 재호스팅 금지)", termsUrl: "https://info.arxiv.org/help/api/tou.html" },
  },
  {
    slug: "hn-top",
    name: "Hacker News 인기글",
    adapter: "hn",
    beats: ["tech", "ai"],
    lang: "en",
    trustTier: 3,
    signalOnly: true,
    pollIntervalSec: 1800,
    config: { minPoints: 200, hitsPerPage: 50 }, // probe ✓
    license: { commercialOk: null, verbatimOk: false, attribution: "via Hacker News" },
  },

  /* ── market data ── */
  {
    slug: "binance-spot",
    name: "바이낸스 현물 시세",
    adapter: "market.binance",
    beats: ["crypto"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 60,
    config: {
      base: "https://data-api.binance.vision", // probe ✓ (api.binance.com is geo-blocked in some regions)
      pairs: [
        { pair: "BTCUSDT", symbol: "BTC", name: "비트코인", sort: 10, inTicker: true },
        { pair: "ETHUSDT", symbol: "ETH", name: "이더리움", sort: 11, inTicker: true },
        { pair: "SOLUSDT", symbol: "SOL", name: "솔라나", sort: 12, inTicker: true },
        { pair: "XRPUSDT", symbol: "XRP", name: "리플", sort: 13, inTicker: false },
      ],
      sparkEverySec: 900,
    },
    license: { commercialOk: true, redistributionOk: null, attribution: "시세: Binance" },
  },
  {
    slug: "upbit-krw",
    name: "업비트 원화 시세",
    adapter: "market.krw",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 2,
    pollIntervalSec: 60,
    config: {
      exchange: "upbit",
      markets: [
        { market: "KRW-BTC", symbol: "KRW-BTC", name: "비트코인 원화", sort: 20, inTicker: true },
        { market: "KRW-ETH", symbol: "KRW-ETH", name: "이더리움 원화", sort: 21, inTicker: false },
        { market: "KRW-USDT", symbol: "KRW-USDT", name: "테더 원화", sort: 22, inTicker: false },
      ],
      sparkEverySec: 900,
    }, // probe ✓
    license: { commercialOk: true, redistributionOk: null, attribution: "시세: 업비트" },
  },
  {
    slug: "bybit-derivs",
    name: "바이비트 선물 지표",
    adapter: "market.bybit",
    beats: ["crypto", "sentiment"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 3600,
    config: { pairs: [{ pair: "BTCUSDT", symbol: "BTC" }, { pair: "ETHUSDT", symbol: "ETH" }] },
    note: "미국 IP에서는 차단(403)됩니다. 배포 리전(싱가포르)에서 동작을 확인하세요.",
    license: { commercialOk: true, attribution: "데이터: Bybit (내부 지표)" },
  },
  {
    slug: "binance-futures",
    name: "바이낸스 선물 지표",
    adapter: "market.binance-futures",
    beats: ["crypto", "sentiment"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 3600,
    config: { pairs: [{ pair: "BTCUSDT", symbol: "BTC" }, { pair: "ETHUSDT", symbol: "ETH" }] },
    note: "미국 IP에서는 차단(451)됩니다. 롱숏·미결제약정 이력은 30일만 제공되므로 일찍 쌓아 두는 게 좋습니다.",
    license: { commercialOk: true, attribution: "데이터: Binance (내부 지표)" },
  },
  {
    slug: "fx-usdkrw-ecb",
    name: "원/달러 (ECB 기준)",
    adapter: "fx.frankfurter",
    beats: ["economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: { symbol: "USDKRW", name: "원/달러", base: "USD", quote: "KRW", days: 45, sort: 30, inTicker: true }, // probe ✓
    note: "수출입은행 키를 받으면 fx-usdkrw-exim을 켜고 이 소스는 멈추세요 (같은 USDKRW를 씁니다).",
    license: { commercialOk: null, attribution: "환율: ECB 기준환율 (Frankfurter)" },
  },
  {
    slug: "fx-usdkrw-exim",
    name: "원/달러 (한국수출입은행)",
    adapter: "fx.koreaexim",
    beats: ["economy"],
    lang: "ko",
    trustTier: 1,
    pollIntervalSec: 3600,
    config: { symbol: "USDKRW", name: "원/달러", currency: "USD", sort: 30, inTicker: true },
    status: "paused",
    note: "KOREAEXIM_API_KEY를 넣은 뒤 활성화하고 fx-usdkrw-ecb는 멈추세요.",
    license: { commercialOk: true, redistributionOk: true, attribution: "환율: 한국수출입은행 매매기준율" },
  },
  {
    slug: "us10y-treasury",
    name: "미 국채 10년물",
    adapter: "rates.treasury",
    beats: ["economy"],
    lang: "en",
    trustTier: 1,
    pollIntervalSec: 3 * 3600,
    config: { tenor: "BC_10YEAR", symbol: "US10Y", name: "美 10년물", sort: 40, inTicker: true }, // probe ✓
    license: { commercialOk: true, redistributionOk: true, verbatimOk: true, attribution: "Source: U.S. Treasury" },
  },
  {
    slug: "crypto-fear-greed",
    name: "코인 공포·탐욕 지수",
    adapter: "index.feargreed",
    beats: ["sentiment"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 3 * 3600,
    config: {}, // probe ✓
    license: { commercialOk: true, attribution: "출처: alternative.me (비교 기준)" },
  },
  {
    slug: "naver-search-trend",
    name: "네이버 검색어 트렌드",
    adapter: "naver.datalab",
    beats: ["sentiment"],
    lang: "ko",
    trustTier: 2,
    pollIntervalSec: 12 * 3600,
    config: {
      groups: [
        { name: "비트코인", keywords: ["비트코인", "BTC"], symbol: "BTC" },
        { name: "이더리움", keywords: ["이더리움", "ETH"], symbol: "ETH" },
        { name: "코인", keywords: ["코인", "가상자산", "암호화폐"], symbol: "CRYPTO" },
        { name: "주식", keywords: ["주식", "코스피", "주가"], symbol: "KR-EQ" },
        { name: "삼성전자", keywords: ["삼성전자", "삼전"], symbol: "005930" },
      ],
      days: 35,
    },
    status: "paused",
    note: "NAVER_CLIENT_ID/SECRET를 넣은 뒤 활성화하세요 (2026-07-31 이후 신규 키는 NAVER API HUB).",
    license: { commercialOk: true, attribution: "출처: 네이버 데이터랩 (내부 지표)" },
  },

  /* ── social ── */
  {
    slug: "x-accounts",
    name: "X 지정 계정",
    adapter: "x.accounts",
    beats: ["ai", "crypto", "tech"],
    lang: "en",
    trustTier: 2,
    pollIntervalSec: 300,
    config: {
      accounts: ["OpenAI", "AnthropicAI", "GoogleDeepMind", "nvidia", "binance", "coinbase", "SECGov", "federalreserve"],
      output: ["items"],
      maxPostsPerRun: 300,
      monthlyPostCap: 20000,
      provider: { kind: "official" },
    },
    status: "paused",
    note: "예시 계정입니다. 대표님 지정 계정으로 바꾸고 X_BEARER_TOKEN(지출 상한 설정)을 넣은 뒤 활성화하세요. 게시물 1건 읽기 $0.005.",
    license: { commercialOk: true, redistributionOk: false, verbatimOk: false, attribution: "X 게시물은 공식 임베드로만 노출", retentionDays: 30, termsUrl: "https://developer.x.com/en/developer-terms/agreement-and-policy" },
  },
  {
    slug: "tg-channel-example",
    name: "텔레그램 채널 (예시: 코인니스)",
    adapter: "telegram.channel",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 2,
    signalOnly: true,
    pollIntervalSec: 120,
    config: { channel: "coinnesskr", output: ["items"], llmConsent: false, maxPages: 2 }, // probe ✓
    status: "paused",
    note: "예시입니다. 지정 채널로 바꿔 쓰세요. 다른 매체 채널은 시그널 전용. AI 채점은 운영자 서면 동의 후 llmConsent=true.",
    license: { commercialOk: null, redistributionOk: false, verbatimOk: false, attribution: "출처: 해당 텔레그램 채널", retentionDays: 30 },
  },
  {
    slug: "tg-bot",
    name: "텔레그램 봇 (동의 채널)",
    adapter: "telegram.bot",
    beats: ["crypto"],
    lang: "ko",
    trustTier: 2,
    pollIntervalSec: 60,
    config: { channels: [], output: ["items", "posts"], llmConsent: true },
    status: "paused",
    note: "TELEGRAM_BOT_TOKEN을 넣고, 채널 운영자가 봇을 관리자로 추가하면 활성화하세요.",
    license: { commercialOk: true, redistributionOk: false, verbatimOk: false, attribution: "출처: 해당 텔레그램 채널 (운영자 동의)", retentionDays: 30 },
  },
  {
    slug: "dc-bitcoin",
    name: "디시인사이드 비트코인 갤러리",
    adapter: "html.list",
    url: "https://gall.dcinside.com/board/lists/?id=bitcoins_new1", // probe ✓ robots: allowed
    beats: ["sentiment", "crypto"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 180,
    config: { row: "tr.ub-content.us-post", fields: DC_FIELDS, skipIf: DC_SKIP, output: "posts", llmConsent: false, maxRows: 60, respectRobots: true },
    note: "제목·조회·댓글 수만 씁니다. 협의 범위에 AI 분석이 포함되면 llmConsent=true.",
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "dc-coin-minor",
    name: "디시인사이드 코인 마이너 갤러리",
    adapter: "html.list",
    url: "https://gall.dcinside.com/mgallery/board/lists/?id=coin", // probe ✓ robots: allowed
    beats: ["sentiment", "crypto"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 180,
    config: { row: "tr.ub-content.us-post", fields: DC_FIELDS, skipIf: DC_SKIP, output: "posts", llmConsent: false, maxRows: 60, respectRobots: true },
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "dc-stock",
    name: "디시인사이드 주식 갤러리",
    adapter: "html.list",
    url: "https://gall.dcinside.com/board/lists/?id=stock_new2",
    beats: ["sentiment", "economy"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 180,
    config: { row: "tr.ub-content.us-post", fields: DC_FIELDS, skipIf: DC_SKIP, output: "posts", llmConsent: false, maxRows: 60, respectRobots: true },
    status: "paused",
    note: "robots.txt가 주식 갤러리(stock_new·stock_new2) 수집을 막습니다. 협의가 있으면 respectRobots=false와 robotsOverride(근거)를 기록하세요.",
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "clien-stock",
    name: "클리앙 주식한당",
    adapter: "html.list",
    url: "https://www.clien.net/service/board/cm_stock", // probe ✓ robots: allowed (no query string)
    beats: ["sentiment", "economy"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 300,
    config: {
      row: "div.list_item.symph_row",
      fields: {
        id: { attr: "data-board-sn" },
        title: { sel: "span.subject_fixed", attr: "title" },
        link: { sel: "a.list_subject", attr: "href" },
        time: { sel: ".list_time .timestamp" },
        author: { sel: ".list_author .nickname span", attr: "title" },
        views: { sel: ".list_hit .hit" },
        comments: { attr: "data-comment-count" },
        likes: { sel: ".list_symph span" },
      },
      output: "posts",
      llmConsent: false,
      maxRows: 40,
      respectRobots: true,
    },
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "ppomppu-stock",
    name: "뽐뿌 증권포럼",
    adapter: "html.list",
    url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=stock", // probe ✓ (cookie check) robots: allowed
    beats: ["sentiment", "economy"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 300,
    config: {
      row: "tr.baseList",
      fields: {
        id: { sel: "td.baseList-numb" },
        title: { sel: "a.baseList-title" },
        link: { sel: "a.baseList-title", attr: "href" },
        time: { sel: "time.baseList-time", attr: "title" },
        author: { sel: ".baseList-name" },
        views: { sel: "td.baseList-views" },
        likes: { sel: "td.baseList-rec", regex: "^(\\d+)" },
        comments: { sel: ".baseList-c", regex: "(\\d+)" },
      },
      skipIf: { sel: "td.baseList-numb", regex: "\\D" },
      output: "posts",
      llmConsent: false,
      cookieCheck: true,
      maxRows: 40,
      respectRobots: true,
    },
    note: "첫 방문에 쿠키를 심고 같은 주소로 되돌려 보내는 게시판이라 cookieCheck를 켭니다.",
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "naver-stock-board",
    name: "네이버 종목토론실 (삼성전자)",
    adapter: "html.list",
    url: "https://finance.naver.com/item/board.naver?code=005930",
    beats: ["sentiment", "economy"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 300,
    config: {
      row: "table.type2 tbody tr",
      fields: { id: { sel: "td.title a", attr: "href", regex: "nid=(\\d+)" }, title: { sel: "td.title a", attr: "title" }, link: { sel: "td.title a", attr: "href" }, time: { sel: "td:first-child span" } },
      output: "posts",
      llmConsent: false,
      maxRows: 40,
      respectRobots: true,
    },
    status: "paused",
    note: "robots.txt가 전체 수집을 막고(Disallow: /) 미국 IP는 403입니다. 네이버와 협의 시에만 예외를 기록하세요.",
    license: COMMUNITY_LICENSE,
  },
  {
    slug: "fmkorea-stock",
    name: "에펨코리아 주식",
    adapter: "html.list",
    url: "https://www.fmkorea.com/index.php?mid=stock",
    beats: ["sentiment", "economy"],
    lang: "ko",
    trustTier: 4,
    pollIntervalSec: 300,
    config: { row: "li.li", fields: { id: { sel: "h3.title a", attr: "href", regex: "(\\d+)" }, title: { sel: "h3.title a" } }, output: "posts", llmConsent: false, maxRows: 40, respectRobots: true },
    status: "paused",
    note: "봇 보안 시스템(Cloudflare Turnstile, 430)으로 막혀 있습니다. 협의로 접근(화이트리스트)이 열리면 선택자를 확인하세요.",
    license: COMMUNITY_LICENSE,
  },
];
