/** Sample tech-beat articles (fictional companies, mock data). */
import type { SeedArticle } from "../types";

export const TECH_ARTICLES: SeedArticle[] = [
  {
    key: "tech-hanbit-hbm-qual",
    beat: "tech",
    ago: 9,
    story: "hanbit-hbm",
    title: "한빛반도체, 차세대 HBM 퀄 통과…내년 1분기 공급",
    dek: "한빛반도체 차세대 HBM이 북미 AI 가속기 고객사의 품질 테스트를 통과했다. 소수 업체가 나눠 갖던 시장에 새 공급처가 생긴다.",
    blocks: [
      {
        type: "why",
        items: [
          "한빛반도체가 HBM 시장에서 **후발주자 꼬리표**를 뗄 첫 관문을 넘었다. 퀄 통과는 사실상 공급 계약의 전제 조건이다.",
          "전날 수율 논쟁으로 흔들린 투자심리를 회사가 **결과로** 되돌렸다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "₩184,500", label: "한빛반도체 주가", delta: "+3.21%", trend: "up" },
          { value: "4.6배", label: "발표 직후 10분 거래대금", delta: "20일 평균 대비", trend: "up" },
          { value: "2.8TB/s", label: "스택당 대역폭" },
          { value: "15%", label: "내년 HBM 점유율(증권가 추정)", delta: "+9%p", trend: "up" },
        ],
      },
      {
        type: "chart",
        title: "한빛반도체 주가(최근 24거래일)",
        unit: "원",
        points: [
          152400, 154100, 153200, 156800, 158300, 157100, 160500, 162900, 161800, 164200, 166700, 165300, 168900,
          171200, 169800, 172500, 174300, 173100, 176400, 179900, 177600, 183200, 178760, 184500,
        ],
        source: "거래소 시세(모의)",
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "제품: 7세대 HBM(HBM4E) 12단, 스택당 대역폭 2.8TB/s",
          "고객: 북미 AI 가속기 업체(회사는 실명 비공개)",
          "일정: 내년 1분기 양산 공급 시작, 물량·단가는 협상 중",
        ],
      },
      {
        type: "section",
        label: "between_lines",
        text: "상승폭이 전날 낙폭(-2.4%)을 조금 웃도는 데 그친 건 퀄 통과 기대가 **이미 주가에 상당 부분 반영**돼 있었다는 뜻이다. 시장의 질문은 '통과하느냐'에서 '얼마나, 얼마에 파느냐'로 옮겨갔다.",
      },
      {
        type: "quote",
        text: "퀄 통과로 내년 점유율 15%까지는 시야에 들어왔습니다. 목표가를 다시 올리려면 수율 숫자를 확인해야 합니다.",
        attribution: "오로라증권 반도체 담당 애널리스트",
      },
      { type: "sentiment" },
      {
        type: "section",
        label: "yes_but",
        text: "회사는 이번에도 수율을 밝히지 않았다. 퀄은 샘플의 성능을 검증한 것이고, 대량 양산에서 같은 품질을 유지하는지는 별개의 문제다.",
      },
      {
        type: "next",
        items: [
          "물량·단가를 담은 공급 계약 공시 시점",
          "다음 주 3분기 실적 발표에서 수율 공개 여부",
          "증설 라인 장비 반입 일정",
        ],
      },
      {
        type: "deeper",
        links: [{ title: "한빛반도체 공시 원문(모의)", href: "#", kind: "primary" }],
      },
    ],
    tags: ["한빛반도체", "HBM", "반도체"],
    tickers: ["HNBS"],
    sources: [
      { name: "한빛반도체 공시(모의)", kind: "filing" },
      { name: "거래소 시세(모의)", kind: "data" },
      { name: "커뮤니티 집계(모의)", kind: "social" },
    ],
    sentiment: {
      score: 52,
      change24h: 18,
      bullish: 68,
      bearish: 32,
      volume: 27410,
      sources: [
        { name: "국내 커뮤니티", score: 61, share: 0.56 },
        { name: "X", score: 36, share: 0.19 },
        { name: "텔레그램", score: 55, share: 0.18 },
        { name: "Reddit", score: 18, share: 0.07 },
      ],
      keywords: ["HBM 퀄", "증설", "목표가", "수율"],
    },
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    breaking: true,
    views: 51000,
  },
  {
    key: "tech-hangyeol-fold2-preorder",
    beat: "tech",
    ago: 140,
    title: "한결 'H폴드 2' 사흘 만에 31만 대…변수는 가격",
    dek: "한결전자 새 폴더블폰이 사전판매 사흘 만에 31만 대를 기록했다. 가볍고 얇아졌다는 호평 속에 26만원 오른 가격이 흥행 변수다.",
    blocks: [
      {
        type: "why",
        items: [
          "폴더블은 성장이 멈춘 스마트폰 시장에서 **판매 단가를 끌어올리는** 거의 유일한 제품군이다.",
          "한결전자 스마트폰 사업의 연간 수익성이 이 제품 하나에 크게 기대고 있다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "31만 대", label: "사전판매 3일 누적", delta: "전작 대비 +40%", trend: "up" },
          { value: "₩239만", label: "출고가(256GB)", delta: "+12%", trend: "up" },
          { value: "₩112,000", label: "한결전자 주가", delta: "-0.71%", trend: "down" },
        ],
      },
      {
        type: "table",
        caption: "H폴드 2와 전작 비교(회사 발표 기준)",
        columns: ["항목", "H폴드 1", "H폴드 2"],
        rows: [
          ["무게", "248g", "215g"],
          ["접었을 때 두께", "12.1mm", "8.9mm"],
          ["배터리", "4,400mAh", "5,000mAh"],
          ["출고가(256GB)", "₩213만", "₩239만"],
        ],
      },
      {
        type: "section",
        label: "view_from",
        text: "커뮤니티 반응은 '하드웨어는 완성, 값은 미완성'으로 요약된다.",
        bullets: [
          "호평: 일반 바(bar)형 폰과 거의 차이 없는 무게와 두께",
          "혹평: 전작보다 26만원 오른 가격, 줄어든 사전판매 사은품",
          "관망: 힌지 내구성과 화면 주름은 '석 달은 써 봐야 안다'",
        ],
      },
      {
        type: "section",
        label: "between_lines",
        text: "판매 호조에도 주가가 약세인 건 **원가** 부담 탓이라는 해석이 많다. 초박형 힌지와 대용량 배터리로 대당 부품비가 크게 올라, 팔린 만큼 이익이 늘지 않을 수 있다는 계산이다.",
      },
      {
        type: "section",
        label: "yes_but",
        text: "사전판매는 예약 기준이라 실제 개통으로 얼마나 이어지는지 따로 봐야 한다. 전작도 출시 초반 반짝 흥행 뒤 판매가 빠르게 식었다.",
      },
      {
        type: "next",
        items: ["정식 출시 첫 달 판매량과 반품률", "연말 할인 프로모션 규모"],
      },
    ],
    tags: ["한결전자", "폴더블", "스마트폰"],
    tickers: ["HGYL"],
    sources: [
      { name: "한결전자 보도자료(모의)", kind: "press" },
      { name: "커뮤니티 집계(모의)", kind: "social" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 12300,
  },
  {
    key: "tech-daon-datacenter-power",
    beat: "tech",
    ago: 300,
    title: "전기가 발목…다온클라우드 GPU 증설 절반 넘게 '대기'",
    dek: "다온클라우드가 증설할 GPU 1만2000장 중 5000장만 연내 기존 센터에 배치한다. 나머지 7000장은 신규 부지에 전력이 들어올 때까지 기다린다.",
    blocks: [
      {
        type: "why",
        items: [
          "AI 인프라 경쟁의 병목이 **GPU에서 전기로** 옮겨갔다는 신호다. 칩은 돈으로 사도 전력은 줄을 서야 한다.",
          "전날 내건 '내년 상반기 완료' 목표에서 증설분의 절반 이상이 **2028년 이후로** 밀린다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "30MW", label: "GPU 1.2만 장 필요 전력" },
          { value: "12MW", label: "기존 센터 여유 전력" },
          { value: "5000장", label: "연내 우선 배치 GPU" },
          { value: "2028년 이후", label: "신규 부지 전력 인입(전망)" },
        ],
      },
      {
        type: "section",
        label: "big_picture",
        text: "AI 가속기 한 랙이 쓰는 전력은 일반 서버 랙의 10배에 이른다. 수도권에선 신규 데이터센터가 전력망 연결을 몇 년씩 기다리는 일이 흔해졌고, 사업자들은 지방 부지와 자체 발전까지 저울질한다.",
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "1단계: 기존 센터 3곳의 여유 전력 12MW에 GPU 5000장 배치(연내)",
          "냉각: 공랭을 수랭·액침 방식으로 바꿔 같은 전력에 더 많은 GPU 수용",
          "2단계: 나머지 7000장은 비수도권 신규 부지 전력 확보 뒤 배치",
        ],
      },
      {
        type: "quote",
        text: "요즘 데이터센터 입지는 땅값이 아니라 **변전소까지의 거리**로 정합니다.",
        attribution: "다온클라우드 인프라 담당 임원",
      },
      {
        type: "section",
        label: "yes_but",
        text: "분산 배치는 센터 간 네트워크 지연과 운영 인력 부담을 키운다. 대규모 학습보다 추론용으로 쓰는 게 그나마 현실적이라는 평가다.",
      },
      {
        type: "next",
        items: ["비수도권 부지 전력 계약 체결 여부", "장기 계약 고객사의 납기 조정 요구 여부"],
      },
    ],
    tags: ["다온클라우드", "데이터센터", "전력", "AI 인프라"],
    tickers: ["DAON"],
    sources: [
      { name: "다온클라우드 IR 자료(모의)", kind: "press" },
      { name: "오로라증권 리포트(모의)", kind: "report" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 8900,
  },
  {
    key: "tech-mirr-humanoid-assembly-line",
    beat: "tech",
    ago: 720,
    title: "미르 휴머노이드, 조립라인 첫 투입…관건은 속도",
    dek: "미르로보틱스 휴머노이드 12대가 한결전자 냉장고 조립라인에 들어갔다. 물류보다 정밀한 공정에서 사람 속도를 따라잡는지가 시험대다.",
    blocks: [
      {
        type: "why",
        items: [
          "휴머노이드가 상자 나르기를 넘어 **조립 공정**에 들어간 국내 첫 사례다.",
          "기존 산업용 로봇은 라인을 로봇에 맞춰 뜯어고쳐야 했다. 휴머노이드는 **사람 자리에 그대로** 선다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "12대", label: "조립라인 투입 대수" },
          { value: "58초", label: "공정당 작업 시간(로봇)", delta: "16주 새 -36초", trend: "down" },
          { value: "41초", label: "같은 공정 숙련 작업자" },
          { value: "₩88,400", label: "미르로보틱스 주가", delta: "+4.55%", trend: "up" },
        ],
      },
      {
        type: "chart",
        title: "로봇 공정당 평균 작업 시간(시범 16주)",
        unit: "초",
        points: [94, 91, 88, 86, 83, 79, 77, 74, 71, 69, 67, 65, 63, 61, 60, 58],
        source: "미르로보틱스 보도자료(모의)",
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "공정: 냉장고 도어 패킹 장착, 배선 커넥터 체결 등 4개",
          "근무: 로봇 한 대가 2교대 16시간 연속 가동, 작업자 1명이 3대 감독",
          "학습: 숙련 작업자 시연 영상으로 동작을 익힌 뒤 현장에서 미세조정",
        ],
      },
      {
        type: "quote",
        text: "물류센터에서 로봇이 1분 늦으면 택배가 1분 늦지만, 조립라인에서는 뒤 공정 전체가 멈춥니다.",
        attribution: "한결전자 생산기술 담당 관계자",
      },
      {
        type: "section",
        label: "between_lines",
        text: "로봇이 사람보다 느린데도 투입한 건 **쉬지 않기** 때문이다. 한 대가 휴식 없이 두 교대조를 모두 맡아, 가동 시간으로 속도 차이를 메우겠다는 계산이다.",
      },
      {
        type: "section",
        label: "context",
        text: "미르로보틱스는 앞서 한결전자 물류센터에 휴머노이드 50대를 공급하는 3년 계약을 맺었다. 이번 조립라인 투입은 별도의 시범 사업이다.",
      },
      {
        type: "next",
        items: ["로봇 작업 시간이 숙련자 수준(41초)에 닿는 시점", "다른 공정·공장으로의 확대 계약 여부"],
      },
    ],
    tags: ["미르로보틱스", "휴머노이드", "스마트팩토리"],
    tickers: ["MIRR", "HGYL"],
    sources: [
      { name: "미르로보틱스 보도자료(모의)", kind: "press" },
      { name: "한결전자 현장 공개 자료(모의)", kind: "press" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 11200,
  },
  {
    key: "tech-hanbit-hbm-yield-debate",
    beat: "tech",
    ago: 1260,
    story: "hanbit-hbm",
    title: "한빛 HBM 수율 '50%대' 논쟁…회사 \"사실과 달라\"",
    dek: "차세대 HBM 수율이 50%대에 그친다는 증권가 분석에 한빛반도체 주가가 2.4% 내렸다. 회사는 부인했지만 실제 수치는 밝히지 않았다.",
    blocks: [
      {
        type: "why",
        items: [
          "차세대 HBM은 D램 칩 12장을 쌓아 만든다. 한 층만 불량이어도 전체를 버려야 해 **수율이 곧 마진**이다.",
          "3조2000억원 증설 공시 바로 다음 날 나온 분석이라 '선투자가 독이 될 수 있다'는 우려에 불을 붙였다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "50%대", label: "보고서 추정 수율(12단)" },
          { value: "10%대", label: "내년 HBM 영업이익률(추정)", delta: "30%대서 하향", trend: "down" },
          { value: "₩19만", label: "오로라증권 목표주가", delta: "-₩2만", trend: "down" },
          { value: "-2.4%", label: "한빛반도체 주가(당일)", trend: "down" },
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        text: "오로라증권 반도체 담당 애널리스트는 장비 반입량과 출하 추정치를 역산해 12단 제품 수율을 50%대 중반으로 봤다. 이를 근거로 내년 HBM 영업이익률 추정치를 30%대에서 10%대로 낮췄다.",
      },
      {
        type: "quote",
        text: "보고서 수치는 내부 데이터와 차이가 큽니다. 고객사와의 비밀유지 약속 때문에 구체적인 수율은 밝힐 수 없습니다.",
        attribution: "한빛반도체 관계자",
      },
      {
        type: "section",
        label: "disagreement",
        text: "업계 시각은 엇갈린다. 12단 적층 초기에 50%대 수율은 드물지 않고, 양산 반년 안에 20%p 이상 끌어올린 전례도 많다는 반론이 나온다.",
        bullets: [
          "비관론: 수율이 잡히기 전에 증설하면 감가상각 부담만 커진다",
          "낙관론: 초기 수율은 원래 낮다. 더 중요한 신호는 고객사 퀄 결과다",
        ],
      },
      {
        type: "section",
        label: "bottom_line",
        text: "논쟁을 끝낼 방법은 둘이다. 회사가 숫자를 내놓거나, 고객사가 퀄 결과로 답하는 것이다.",
      },
      {
        type: "next",
        items: ["고객사 품질 테스트(퀄) 결과 발표 시점", "3분기 실적 발표에서 수율 언급 여부"],
      },
    ],
    tags: ["한빛반도체", "HBM", "수율"],
    tickers: ["HNBS"],
    sources: [
      { name: "오로라증권 리포트(모의)", kind: "report" },
      { name: "한빛반도체 입장문(모의)", kind: "press" },
      { name: "거래소 시세(모의)", kind: "data" },
    ],
    ai: "human",
    author: "desk-ai",
    byline: "글 · 한서윤",
    views: 26700,
  },
  {
    key: "tech-seon-robotaxi-collision-probe",
    beat: "tech",
    ago: 1580,
    story: "seon-robotaxi",
    title: "세온 무인 로보택시 첫 접촉사고…20대 운행 일시 중단",
    dek: "운행 구역을 넓힌 직후 세온모빌리티 무인 로보택시가 정차 차량과 부딪혔다. 인명 피해는 없었지만 회사는 무인 차량 20대를 모두 세웠다.",
    blocks: [
      {
        type: "why",
        items: [
          "안전요원이 타지 않은 차량의 **첫 사고**다. 사고 책임을 누가 지는지에 대한 국내 기준은 아직 촘촘하지 않다.",
          "무인 비중 확대가 수익성의 핵심이었던 만큼 중단이 길어지면 상용화 일정 전체가 밀린다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "20대", label: "운행 멈춘 무인 차량" },
          { value: "100대", label: "운행 유지(안전요원 탑승)" },
          { value: "0명", label: "인명 피해" },
          { value: "₩31,750", label: "세온모빌리티 주가", delta: "-2.61%", trend: "down" },
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "시점: 새벽 1시께, 승객 없이 다음 호출지로 이동 중",
          "상황: 교차로 우회전 직후 비상등을 켜고 서 있던 차량의 뒤 범퍼와 접촉",
          "피해: 양측 차량 경미한 파손, 부상자 없음",
        ],
      },
      {
        type: "quote",
        text: "주행 기록상 차량은 제한속도 안에서 감속 중이었습니다. 판단 지연이 있었는지 외부 전문기관과 함께 확인하고 있습니다.",
        attribution: "세온모빌리티 관계자",
      },
      {
        type: "section",
        label: "between_lines",
        text: "전체 운행이 아니라 **무인 차량만** 멈춘 건 계산된 선택이다. 원인이 무인 운행 특유의 문제인지 가려질 때까지 데이터 수집은 이어가겠다는 뜻이다.",
      },
      { type: "sentiment" },
      {
        type: "section",
        label: "context",
        text: "로보택시가 먼저 상용화된 해외에서도 경미한 접촉사고는 꾸준히 있었다. 다만 초기 사고 한 건이 여론과 규제 속도를 좌우한 사례가 적지 않다.",
      },
      {
        type: "next",
        items: ["사고 기록 분석 결과와 무인 운행 재개 시점", "중단 조치가 안전요원 탑승 차량 100대로 번질지 여부"],
      },
    ],
    tags: ["세온모빌리티", "로보택시", "자율주행", "안전"],
    tickers: ["SEON"],
    sources: [
      { name: "세온모빌리티 입장문(모의)", kind: "press" },
      { name: "커뮤니티 집계(모의)", kind: "social" },
      { name: "거래소 시세(모의)", kind: "data" },
    ],
    sentiment: {
      score: -2,
      change24h: -10,
      bullish: 46,
      bearish: 54,
      volume: 8940,
      sources: [
        { name: "국내 커뮤니티", score: -5, share: 0.52 },
        { name: "X", score: -1, share: 0.23 },
        { name: "텔레그램", score: 3, share: 0.16 },
        { name: "Reddit", score: 2, share: 0.09 },
      ],
      keywords: ["접촉사고", "무인 운행", "사고 조사", "책임 소재"],
    },
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 23600,
  },
  {
    key: "tech-hanbit-hbm-capex-filing",
    beat: "tech",
    ago: 2950,
    story: "hanbit-hbm",
    title: "한빛반도체, HBM에 3.2조 증설…퀄 앞둔 '선제 베팅'",
    dek: "한빛반도체가 차세대 HBM 생산능력을 2배로 늘리는 3조2000억원 시설투자를 공시했다. 고객사 품질 테스트 결과가 나오기 전에 내린 결정이다.",
    blocks: [
      {
        type: "why",
        items: [
          "HBM은 고객이 정해지기 전에 라인부터 깔아야 공급 시기를 맞출 수 있는 **선투자 게임**이다. 퀄에서 떨어지면 투자가 고스란히 부담으로 남는다.",
          "투자액은 회사 연간 영업현금흐름의 80%에 이른다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "₩3.2조", label: "시설투자 규모" },
          { value: "4만 장", label: "HBM 월 생산능력(웨이퍼)", delta: "+2만 장", trend: "up" },
          { value: "2027년 말", label: "투자 완료 목표" },
          { value: "80%", label: "연간 영업현금흐름 대비" },
        ],
      },
      {
        type: "table",
        caption: "투자 내역(공시 기준)",
        columns: ["항목", "금액", "비중"],
        rows: [
          ["D램 전공정 전환", "₩1.4조", "44%"],
          ["TSV·적층 장비", "₩1.1조", "34%"],
          ["클린룸·유틸리티", "₩0.7조", "22%"],
        ],
      },
      {
        type: "section",
        label: "big_picture",
        text: "AI 가속기 한 대에 들어가는 HBM 용량이 세대마다 늘면서 수요가 공급을 앞지르고 있다. 고객사들은 물량을 나눠 받을 **두 번째, 세 번째 공급처**를 찾고 있고, 한빛반도체가 노리는 자리가 그 틈이다.",
      },
      {
        type: "quote",
        text: "고객사는 퀄보다 '물량을 댈 수 있느냐'를 먼저 묻습니다. 생산능력 없이 퀄만 통과해서는 의미 있는 물량을 받기 어렵습니다.",
        attribution: "한빛반도체 관계자",
      },
      {
        type: "section",
        label: "yes_but",
        text: "수율이 아직 안정되지 않았다는 관측이 업계에 돈다. 증권가 일각에선 라인부터 늘리는 건 **순서가 뒤바뀐 투자**라는 지적도 나온다.",
      },
      {
        type: "next",
        items: ["고객사 품질 테스트(퀄) 결과 발표 시점", "투자 재원 중 회사채 발행 규모"],
      },
    ],
    tags: ["한빛반도체", "HBM", "시설투자"],
    tickers: ["HNBS"],
    sources: [
      { name: "한빛반도체 공시(모의)", kind: "filing" },
      { name: "한빛반도체 IR 자료(모의)", kind: "press" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 18400,
  },
  {
    key: "tech-seon-robotaxi-zone-expansion",
    beat: "tech",
    ago: 3420,
    story: "seon-robotaxi",
    title: "세온 로보택시, 운행 구역 3배로…무인 차량 첫 투입",
    dek: "세온모빌리티가 로보택시 시범운행 구역을 42㎢로 3배 넓히고 24시간 운행에 들어간다. 안전요원 없는 완전 무인 차량 20대도 처음 투입한다.",
    blocks: [
      {
        type: "why",
        items: [
          "국내 로보택시가 정해진 노선을 도는 셔틀을 넘어 **택시처럼 호출받아 움직이는** 단계로 들어선다.",
          "안전요원 인건비를 덜어내야 대당 운영비가 떨어진다. 무인 비중이 상용화 손익의 열쇠다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "42㎢", label: "확대 후 운행 구역", delta: "3배", trend: "up" },
          { value: "120대", label: "투입 차량", delta: "+80대", trend: "up" },
          { value: "20대", label: "완전 무인 차량" },
          { value: "310만㎞", label: "누적 자율주행 거리" },
        ],
      },
      {
        type: "chart",
        title: "세온 로보택시 주간 유상 탑승 건수(최근 20주)",
        unit: "건",
        points: [
          620, 670, 750, 730, 850, 940, 1040, 1030, 1180, 1310, 1440, 1560, 1530, 1750, 1940, 2120, 2310, 2490, 2780,
          3130,
        ],
        source: "세온모빌리티 IR 자료(모의)",
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "요금: 일반 택시의 80% 수준, 앱 호출 방식",
          "무인 차량: 원격 관제 요원 1명이 차량 4대를 실시간 감독",
          "운행 시간: 오전 7시~밤 10시에서 24시간으로 확대",
        ],
      },
      {
        type: "quote",
        text: "구역이 넓어져야 데이터가 쌓이고, 데이터가 쌓여야 무인 비중을 늘릴 수 있습니다.",
        attribution: "세온모빌리티 관계자",
      },
      {
        type: "section",
        label: "between_lines",
        text: "주간 탑승 건수는 20주 새 5배로 늘었지만 차량 한 대가 하루 11건 남짓 태우는 수준이다. 돈을 벌려면 차량 수와 무인 비중을 **함께** 늘리는 수밖에 없다.",
      },
      {
        type: "section",
        label: "yes_but",
        text: "구역이 넓어지면 차량이 처음 마주치는 도로 상황도 늘어난다. 지금까지 운행은 교통량이 적은 신도시 구간에 몰려 있었다.",
      },
      {
        type: "next",
        items: ["무인 차량 투입 한 달 뒤 사고·수동 개입 지표 공개 여부", "유상 운송 본사업 전환 일정"],
      },
    ],
    tags: ["세온모빌리티", "로보택시", "자율주행"],
    tickers: ["SEON"],
    sources: [
      { name: "세온모빌리티 보도자료(모의)", kind: "press" },
      { name: "세온모빌리티 IR 자료(모의)", kind: "data" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM 테크 데스크",
    views: 9800,
  },
];
