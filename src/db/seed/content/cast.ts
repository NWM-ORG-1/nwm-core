import type { SeedExperiment, SeedStaff, SeedStory } from "../types";

/** Fictional newsroom staff (sample). Real staff rows are created on first admin login. */
export const STAFF: SeedStaff[] = [
  {
    login: "desk-ai",
    name: "한서윤",
    slug: "han-seoyun",
    title: "AI·테크 데스크 에디터",
    bio: "AI 모델과 반도체 공급망을 다룬다. AI 초안의 사실관계와 수치를 최종 검수한다. (샘플 인물)",
  },
  {
    login: "desk-market",
    name: "박도현",
    slug: "park-dohyun",
    title: "마켓·크립토 에디터",
    bio: "거시경제와 디지털자산 시장을 맡는다. 시세·온체인 데이터 기반 기사의 편집 책임자. (샘플 인물)",
  },
  {
    login: "desk-data",
    name: "이준",
    slug: "lee-jun",
    title: "데이터 데스크",
    bio: "공시·통계·시장 데이터로 자동 생성되는 기사의 템플릿과 검증 규칙을 관리한다. (샘플 인물)",
  },
  {
    login: "desk-sentiment",
    name: "정하린",
    slug: "jung-harin",
    title: "센티먼트 데스크",
    bio: "커뮤니티와 소셜의 투자자 심리를 집계 지표로 읽는다. 개별 게시물은 인용하지 않는다. (샘플 인물)",
  },
];

/** Feed-source hypotheses the founder is A/B testing. */
export const EXPERIMENTS: SeedExperiment[] = [
  {
    code: "H1",
    name: "1차 공시·정책 소스 우선",
    hypothesis: "공시·보도자료 같은 1차 자료에서 출발한 기사가 정정률이 낮고 완독률이 높다.",
    primaryMetric: "read_rate",
    colorSlot: 1,
  },
  {
    code: "H2",
    name: "시장·온체인 데이터 자동기사",
    hypothesis: "시세·온체인 데이터로 만든 자동 기사는 사람 개입 없이도 발행 속도와 재방문을 끌어올린다.",
    primaryMetric: "time_to_publish",
    colorSlot: 2,
  },
  {
    code: "H3",
    name: "해외 테크·AI 1차 소스",
    hypothesis: "해외 논문·공식 블로그·릴리스를 한국어로 가장 빨리 요약하면 AI 독자층을 선점한다.",
    primaryMetric: "publish_rate",
    colorSlot: 3,
  },
  {
    code: "H4",
    name: "커뮤니티 센티먼트 신호",
    hypothesis: "커뮤니티 심리 급변을 조기 포착하면 다른 매체보다 먼저 쓸 거리를 찾는다.",
    primaryMetric: "promote_rate",
    colorSlot: 4,
  },
];

/** Story clusters. Beat articles attach to these via `story`. */
export const STORIES: SeedStory[] = [
  {
    key: "nuri-open-weights",
    slug: "nuri-open-weights",
    beat: "ai",
    title: "누리AI랩 오픈웨이트 모델 공개",
    summary: "국내 스타트업 누리AI랩이 한국어 특화 오픈웨이트 모델을 공개하면서 국내 AI 생태계의 판이 흔들리고 있다.",
    status: "developing",
  },
  {
    key: "hanbit-hbm",
    slug: "hanbit-hbm-next",
    beat: "tech",
    title: "한빛반도체 차세대 HBM 공급전",
    summary: "한빛반도체가 차세대 고대역폭메모리(HBM) 공급 경쟁에 뛰어들었다. 수율·고객사·증설을 둘러싼 흐름을 따라간다.",
    status: "developing",
  },
  {
    key: "bluewave-mainnet",
    slug: "bluewave-mainnet",
    beat: "crypto",
    title: "블루웨이브체인 메인넷 전환",
    summary: "레이어1 블록체인 블루웨이브체인의 메인넷 전환 일정과 토큰 시장 반응을 묶었다.",
    status: "developing",
  },
  {
    key: "won-stablecoin",
    slug: "won-stablecoin",
    beat: "economy",
    title: "원화 스테이블코인, 누가 발행하나",
    summary: "원화 스테이블코인 제도화 논의와 은행·핀테크(아라뱅크, 노바페이 등)의 준비 상황을 정리한다.",
    status: "developing",
  },
  {
    key: "leverage-etf-crowd",
    slug: "leverage-etf-crowd",
    beat: "sentiment",
    title: "개인투자자 레버리지 쏠림",
    summary: "레버리지·인버스 상품으로 몰리는 개인투자자 심리를 커뮤니티 지표로 추적한다.",
    status: "developing",
  },
  {
    key: "seon-robotaxi",
    slug: "seon-robotaxi",
    beat: "tech",
    title: "세온모빌리티 로보택시 시범운행",
    summary: "세온모빌리티의 도심 로보택시 시범운행 확대와 규제·안전성 논쟁.",
    status: "settled",
  },
];

/**
 * Fictional companies used in sample content (with mock tickers in market_quotes).
 * Concrete corporate events (earnings, launches, contracts, incidents) only for these.
 */
export const FICTIONAL_COMPANIES = {
  HNBS: "한빛반도체 — 메모리·HBM 제조사",
  NURI: "누리AI랩 — 한국어 AI 모델 스타트업",
  SEON: "세온모빌리티 — 자율주행·로보택시",
  BWV: "블루웨이브체인 — 레이어1 블록체인 (토큰 BWV)",
  CORE: "코어브릿지 — 크로스체인 브릿지 프로토콜 (토큰 CORE)",
  ARAB: "아라뱅크 — 인터넷전문은행",
  MIRR: "미르로보틱스 — 휴머노이드 로봇",
  NOVA: "노바페이 — 간편결제·핀테크",
  DAON: "다온클라우드 — 클라우드·AI 인프라",
  HGYL: "한결전자 — 스마트폰·가전",
  ORRA: "오로라증권 — 증권사 (리서치 인용은 '오로라증권 애널리스트' 같은 역할로만)",
} as const;
