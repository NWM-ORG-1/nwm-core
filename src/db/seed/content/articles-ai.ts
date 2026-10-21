/** Sample AI-beat articles (fictional companies, mock data). */
import type { SeedArticle } from "../types";

export const AI_ARTICLES: SeedArticle[] = [
  {
    key: "ai-nuri-open-weights-launch",
    beat: "ai",
    ago: 42,
    story: "nuri-open-weights",
    title: "누리AI랩, 한국어 오픈웨이트 '누리-32B' 공개",
    dek: "누리AI랩이 320억 매개변수 한국어 특화 모델의 가중치를 상업 이용까지 허용해 풀었다. 해외 모델에 기대던 국내 AI 시장에 국산 대안이 생겼다.",
    blocks: [
      {
        type: "why",
        items: [
          "국내 기업이 한국어 성능을 내세운 중형 모델을 **상업 이용 무료**로 푼 건 처음이다. 스타트업·공공기관이 해외 API 없이 자체 서버에서 모델을 돌릴 길이 열렸다.",
          "고성능 GPU 한 장으로 구동되는 크기라 도입 문턱이 낮다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "32B", label: "매개변수 규모" },
          { value: "128K", label: "최대 컨텍스트(토큰)" },
          { value: "8,400회", label: "공개 첫 1시간 내려받기" },
          { value: "₩52,300", label: "누리AI랩 주가", delta: "+7.84%", trend: "up" },
        ],
      },
      {
        type: "section",
        label: "big_picture",
        text: "지금까지 국내 기업의 선택지는 해외 빅테크 API를 쓰거나 해외 오픈 모델에 한국어를 덧입혀 쓰는 것뿐이었다. 누리-32B는 처음부터 학습 데이터의 40%를 한국어로 채웠다는 점을 내세운다.",
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "라이선스: 월 이용자 1,000만 명 이하 서비스는 상업 이용 무료, 그 이상은 별도 계약",
          "성능(회사 측): 한국어 종합 벤치마크에서 같은 체급 해외 모델보다 평균 6.2%p 우위",
          "구동: 80GB급 GPU 1장(8비트 양자화 기준)",
          "검증: 오염 의혹이 나온 벤치마크의 평가 코드 전체를 가중치와 함께 공개",
          "유통: 다온클라우드가 공개 당일부터 API로 제공",
        ],
      },
      {
        type: "quote",
        text: "데이터를 밖으로 못 내보내는 공공·금융 고객이 첫 수요처가 될 겁니다. 이번 공개의 핵심은 성능보다 **배포 가능성**입니다.",
        attribution: "누리AI랩 관계자",
      },
      {
        type: "section",
        label: "between_lines",
        text: "무료 공개는 수익 포기가 아니라 **생태계 선점** 전략이다. 모델을 업계 표준으로 깔아두고 미세조정·기업용 지원에서 돈을 벌겠다는 계산이다.",
      },
      {
        type: "section",
        label: "yes_but",
        text: "회사가 내세운 벤치마크 수치는 아직 외부 검증 전이다. 공개 직전 일부 평가 문항이 학습 데이터에 섞였다는 의혹이 나왔고, 중복 문항을 빼면 우위가 4.4%p로 줄어든다는 추정도 있다.",
      },
      { type: "sentiment" },
      {
        type: "next",
        items: [
          "외부 연구진의 독립 벤치마크 재현 결과",
          "다온클라우드에 이은 경쟁 클라우드의 호스팅 참여와 가격 경쟁",
          "대형 고객사 첫 도입 사례 발표 여부",
        ],
      },
      {
        type: "deeper",
        links: [
          { title: "누리-32B 기술 보고서(모의)", href: "#", kind: "primary" },
          { title: "누리-32B 라이선스 전문(모의)", href: "#", kind: "primary" },
        ],
      },
    ],
    tags: ["오픈웨이트", "누리AI랩", "한국어 LLM"],
    tickers: ["NURI"],
    sources: [
      { name: "누리AI랩 보도자료(모의)", kind: "press" },
      { name: "누리AI랩 기술 보고서(모의)", kind: "paper" },
      { name: "커뮤니티 집계(모의)", kind: "social" },
    ],
    sentiment: {
      score: 71,
      change24h: 23,
      bullish: 76,
      bearish: 24,
      volume: 31880,
      sources: [
        { name: "국내 커뮤니티", score: 76, share: 0.52 },
        { name: "텔레그램", score: 74, share: 0.21 },
        { name: "X", score: 63, share: 0.19 },
        { name: "Reddit", score: 48, share: 0.08 },
      ],
      keywords: ["오픈웨이트", "상한가", "벤치마크", "라이선스"],
    },
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM AI 데스크",
    views: 42000,
  },
  {
    key: "ai-nuri-benchmark-dispute",
    beat: "ai",
    ago: 165,
    story: "nuri-open-weights",
    title: "누리-32B 성적표에 '오염' 의혹…회사 \"평가 코드 공개\"",
    dek: "누리-32B 기술 보고서의 벤치마크 점수에 평가 문항이 학습 데이터에 섞였다는 의혹이 나왔다. 회사는 가중치와 함께 평가 코드를 공개해 정면 돌파하겠다는 입장이다.",
    blocks: [
      {
        type: "why",
        items: [
          "오픈웨이트 모델의 가치는 **누구나 검증할 수 있다**는 데 있다. 첫 성적표부터 의심받으면 기업 고객의 도입 판단이 늦어진다.",
          "국내 모델 평가가 회사 자체 수치에 기대 온 구조적 한계도 함께 드러났다.",
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        text: "한 대학 연구실이 기술 보고서에 실린 학습 데이터 출처 목록을 대조한 결과, 한국어 종합 벤치마크 일부 문항과 문장 단위로 겹치는 텍스트가 발견됐다. 해당 문항을 빼고 다시 계산하면 회사가 밝힌 성능 우위가 줄어든다는 주장이다.",
      },
      {
        type: "numbers",
        items: [
          { value: "3.1%", label: "중복 의심 문항 비중" },
          { value: "6.2%p", label: "회사 주장 성능 우위" },
          { value: "4.4%p", label: "중복 제외 시 우위(추정)", delta: "-1.8%p", trend: "down" },
        ],
      },
      {
        type: "quote",
        text: "평가셋과 학습 데이터는 문서 단위로 걸렀고, 문장 단위 중복은 확인 중입니다. 가중치와 함께 **평가 코드 전체**를 공개하겠습니다.",
        attribution: "누리AI랩 관계자",
      },
      {
        type: "section",
        label: "disagreement",
        text: "중복 비율이 3% 수준이면 순위를 뒤집을 정도는 아니라는 반론도 있다. 오로라증권 AI 담당 애널리스트는 \"수요와 주가를 가를 변수는 점수보다 라이선스 조건\"이라고 봤다.",
      },
      {
        type: "section",
        label: "context",
        text: "벤치마크 오염 논란은 해외 대형 모델에서도 반복돼 왔다. 업계에선 공개 직후 외부 리더보드 재평가를 사실상 첫 관문으로 본다.",
      },
      {
        type: "next",
        items: [
          "가중치 공개 때 평가 코드 전체가 실제로 동봉되는지",
          "외부 연구진 재현 점수와 회사 수치의 격차",
        ],
      },
    ],
    tags: ["벤치마크", "누리AI랩", "오픈웨이트"],
    tickers: ["NURI"],
    sources: [
      { name: "누리AI랩 기술 보고서(모의)", kind: "paper" },
      { name: "연구자 커뮤니티 집계(모의)", kind: "social" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM AI 데스크",
    views: 18700,
  },
  {
    key: "ai-agent-adoption-enterprise",
    beat: "ai",
    ago: 290,
    title: "에이전트 AI, 시범은 넘치는데 '실전'은 열에 한 곳",
    dek: "국내 상장사 64%가 AI 에이전트를 시험 중이지만 실제 업무에 상시 투입한 곳은 11%에 그쳤다. 병목은 모델 성능이 아니라 권한·감사 체계다.",
    blocks: [
      {
        type: "why",
        items: [
          "기업 AI 투자의 무게중심이 '대화하는 챗봇'에서 **'일을 대신 처리하는 에이전트'**로 옮겨가고 있다.",
          "도입 속도의 차이가 내년 기업 비용 구조의 차이로 이어진다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "64%", label: "에이전트 시범 도입 기업" },
          { value: "11%", label: "상시 운영 단계" },
          { value: "38%", label: "최대 걸림돌로 '권한 통제'" },
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        text: "오로라증권 리서치센터가 국내 상장사 200곳을 설문한 결과다. 시범 사업은 고객 응대·문서 정리처럼 실수해도 되돌릴 수 있는 업무에 몰려 있다.",
      },
      {
        type: "table",
        caption: "국내 기업 에이전트 적용 사례(모의)",
        columns: ["기업", "업무", "단계", "효과(회사 측)"],
        rows: [
          ["노바페이", "가맹점 정산 대사", "상시 운영", "처리 시간 -42%"],
          ["아라뱅크", "여신 서류 1차 검토", "부분 운영", "심사 대기 -2일"],
          ["오로라증권", "리서치 데이터 정리", "시범", "작성 시간 -30%"],
          ["한결전자", "AS 접수 분류", "시범", "오분류 -18%"],
        ],
      },
      {
        type: "section",
        label: "between_lines",
        text: "운영 단계로 넘어간 곳의 공통점은 **결제·송금처럼 되돌릴 수 없는 행동** 앞에 사람의 승인을 끼워 넣었다는 점이다. 에이전트에 권한을 얼마나 줄지가 기술보다 먼저 풀어야 할 문제다.",
      },
      {
        type: "quote",
        text: "이제 경영진 승인의 기준은 비용 절감이 아니라 '감사 로그를 남길 수 있느냐'입니다.",
        attribution: "오로라증권 소프트웨어 담당 애널리스트",
      },
      {
        type: "section",
        label: "yes_but",
        text: "효과 수치는 대부분 회사 자체 측정치다. 에이전트가 오류를 냈을 때 책임 소재를 가를 내부 규정을 갖춘 곳은 아직 드물다.",
      },
      {
        type: "next",
        items: [
          "연말 예산 시즌, 시범 사업의 본사업 전환 비율",
          "금융권 내부통제 기준에 에이전트 권한 관리가 어떻게 반영될지",
        ],
      },
    ],
    tags: ["AI 에이전트", "기업 AI", "디지털 전환"],
    tickers: ["NOVA", "ARAB", "HGYL"],
    sources: [
      { name: "오로라증권 리포트(모의)", kind: "report" },
      { name: "회사 IR 자료(모의)", kind: "press" },
    ],
    ai: "ai_assisted",
    editor: "desk-ai",
    author: "desk-ai",
    byline: "글 · 한서윤",
    views: 9400,
  },
  {
    key: "ai-daon-nuri-day-one-hosting",
    beat: "ai",
    ago: 540,
    story: "nuri-open-weights",
    title: "다온클라우드, 누리-32B '공개 당일' 호스팅",
    dek: "다온클라우드가 누리AI랩의 새 모델을 가중치 공개 당일부터 API로 제공한다. 해외 모델 일색이던 국내 클라우드에 '국산 기본 모델'이 생기는 셈이다.",
    blocks: [
      {
        type: "why",
        items: [
          "데이터 국외 이전이 막힌 공공·금융 고객이 서버를 따로 짓지 않고도 국산 오픈 모델을 쓸 수 있게 된다.",
          "클라우드 업체에는 GPU 가동률을 끌어올릴 **킬러 워크로드**다.",
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "제공 방식: 종량제 API와 전용 인스턴스 2종",
          "가격: 입력 100만 토큰당 ₩900, 출력 ₩2,700(3개월 출시 기념가)",
          "데이터: 국내 리전에서만 처리, 고객 데이터의 학습 재사용 없음",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "₩900", label: "입력 100만 토큰 단가" },
          { value: "-55%", label: "국내 동급 모델 API 대비", trend: "down" },
          { value: "120곳+", label: "사전 신청 기업" },
        ],
      },
      {
        type: "section",
        label: "between_lines",
        text: "다온클라우드는 모델을 직접 만들지 않는다. 누가 만든 모델이든 **가장 싸게 돌리는 곳**이 되겠다는 전략이고, 누리 모델은 그 첫 시험대다.",
      },
      {
        type: "quote",
        text: "고객이 원하는 건 '가장 똑똑한 모델'보다 '국내에서 끝나는 모델'입니다.",
        attribution: "다온클라우드 관계자",
      },
      {
        type: "section",
        label: "yes_but",
        text: "오픈웨이트 모델은 누구나 호스팅할 수 있다. 경쟁 클라우드가 가격 경쟁에 뛰어들면 선점 효과는 몇 달 안에 희석될 수 있다.",
      },
      {
        type: "next",
        items: ["경쟁 클라우드의 호스팅 참여와 단가 인하 여부", "출시 기념가 종료 뒤 정상가 수준"],
      },
    ],
    tags: ["다온클라우드", "AI 인프라", "오픈웨이트"],
    tickers: ["DAON", "NURI"],
    sources: [
      { name: "다온클라우드 보도자료(모의)", kind: "press" },
      { name: "다온클라우드 요금표(모의)", kind: "data" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM AI 데스크",
    views: 7600,
  },
  {
    key: "ai-basic-act-labeling-response",
    beat: "ai",
    ago: 1210,
    title: "AI 기본법 9개월, 'AI 생성' 표시 방식 제각각",
    dek: "AI 기본법 시행으로 생성형 AI 결과물 표시 의무가 생겼지만 기업마다 워터마크·문구·메타데이터로 방식이 갈린다. 이용자 혼란과 규제 리스크가 함께 커진다.",
    blocks: [
      {
        type: "why",
        items: [
          "같은 'AI 생성' 표시라도 사진엔 보이고 챗봇 답변엔 안 보이는 식이라 **이용자가 구분하기 어렵다**.",
          "업계 관행이 굳어지기 전에 어떤 방식이 사실상 표준이 될지가 관건이다.",
        ],
      },
      {
        type: "section",
        label: "big_picture",
        text: "법은 생성형 AI 결과물임을 알리라는 원칙을 세웠지만, 구체적인 표시 방법은 기업 판단에 맡겨진 부분이 많다. 업계는 각자 리스크가 가장 큰 지점부터 대응하고 있다.",
      },
      {
        type: "table",
        caption: "기업별 'AI 생성' 표시 방식(모의)",
        columns: ["기업", "대상", "방식"],
        rows: [
          ["누리AI랩", "자사 챗봇 답변", "비가시 워터마크 기본 탑재"],
          ["한결전자", "스마트폰 AI 사진 편집", "화면 문구 + 파일 메타데이터"],
          ["노바페이", "상담 챗봇", "대화 시작 시 고지 문구"],
          ["다온클라우드", "API 출력", "응답 메타데이터에 생성 표기"],
        ],
      },
      {
        type: "section",
        label: "view_from",
        text: "현장의 쟁점은 '눈에 보이는 표시'와 '기계가 읽는 표시' 중 무엇을 앞세우느냐다. 문구는 친절하지만 캡처 한 번이면 사라지고, 워터마크는 남지만 일반 이용자는 확인할 수 없다.",
      },
      {
        type: "quote",
        text: "표시를 과하게 붙이면 서비스가 조악해 보이고, 덜 붙이면 리스크가 남습니다. 지금은 다들 **최소 표시에 기록 보관**으로 가는 분위기입니다.",
        attribution: "한 IT 기업 법무 담당자",
      },
      {
        type: "section",
        label: "yes_but",
        text: "방식이 제각각이면 딥페이크 같은 악용 사례를 걸러내기 어렵다는 지적이 나온다. 국내 기업과 해외 서비스 사이의 형평성 문제도 여전히 남아 있다.",
      },
      {
        type: "section",
        label: "bottom_line",
        text: "과제는 '표시했느냐'보다 '표시가 살아남느냐'다. 복사·편집 뒤에도 남는 기계 판독용 표시가 업계 표준 후보로 떠오르고 있다.",
      },
      {
        type: "next",
        items: ["업계 공동 표시 가이드라인 논의 진척", "해외 서비스 사업자의 국내 대응 수준"],
      },
    ],
    tags: ["AI 기본법", "AI 규제", "워터마크"],
    tickers: ["NURI", "HGYL", "NOVA", "DAON"],
    sources: [
      { name: "기업별 서비스 약관·공지(모의)", kind: "press" },
      { name: "업계 관계자 취재", kind: "news" },
    ],
    ai: "human",
    author: "desk-ai",
    byline: "글 · 한서윤",
    views: 12300,
  },
  {
    key: "ai-daon-gpu-cluster-expansion",
    beat: "ai",
    ago: 1650,
    title: "다온클라우드, GPU 1.2만 장 증설…'추론' 수요 겨냥",
    dek: "다온클라우드가 내년 상반기까지 GPU 1만2000장 규모의 AI 클러스터를 새로 짓는다. 학습보다 추론 수요가 더 빨리 늘고 있다는 판단이다.",
    blocks: [
      {
        type: "why",
        items: [
          "국내 AI 서비스의 무게중심이 **'학습'에서 '추론'으로** 옮겨가면서 GPU 수요의 성격이 바뀌고 있다.",
          "국내 리전 GPU가 모자라 해외 클라우드로 빠져나가던 수요를 붙잡을 수 있을지가 관건이다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "1.2만 장", label: "신규 증설 GPU" },
          { value: "2만 장", label: "증설 후 누적 규모" },
          { value: "₩1.1조", label: "총 투자액(3년)" },
          { value: "71%", label: "GPU 사용량 중 추론 비중", delta: "18개월 새 +29%p", trend: "up" },
        ],
      },
      {
        type: "chart",
        title: "다온클라우드 GPU 사용량 중 추론 비중(최근 18개월)",
        unit: "%",
        points: [42, 43, 45, 44, 47, 49, 50, 52, 51, 54, 57, 59, 61, 63, 64, 67, 69, 71],
        source: "다온클라우드 IR 자료(모의)",
      },
      {
        type: "section",
        label: "big_picture",
        text: "1년 반 전만 해도 GPU 사용량의 절반 이상은 모델을 만드는 학습 몫이었다. 지금은 완성된 모델로 답을 내는 추론이 71%를 차지한다.",
      },
      {
        type: "section",
        label: "between_lines",
        text: "추론은 학습과 달리 **매일, 꾸준히** 돈이 되는 수요다. 이번 증설은 단기 붐보다 반복 매출에 거는 베팅으로 읽힌다.",
      },
      {
        type: "quote",
        text: "증설분의 절반 이상은 이미 장기 계약 의향을 받은 물량입니다.",
        attribution: "다온클라우드 관계자",
      },
      {
        type: "section",
        label: "yes_but",
        text: "최대 변수는 전력이다. 회사는 수도권 밖 부지 2곳을 검토 중이라고 밝혔지만 전력 인입 일정은 확정되지 않았다.",
      },
      {
        type: "next",
        items: ["데이터센터 부지와 전력 계약 확정 시점", "장기 계약 고객사 공개 여부"],
      },
    ],
    tags: ["다온클라우드", "GPU", "AI 인프라"],
    tickers: ["DAON"],
    sources: [
      { name: "다온클라우드 공시(모의)", kind: "filing" },
      { name: "다온클라우드 IR 자료(모의)", kind: "press" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM AI 데스크",
    views: 6100,
    corrections: [
      {
        after: 40,
        kind: "correction",
        note: "최초 시그널에서 신규 증설 규모를 'GPU 2만 장'으로 잘못 적었습니다. 회사 공시 기준 신규 증설분은 1만2000장이며, 2만 장은 증설 후 누적 규모입니다. 바로잡습니다.",
        before: {
          dek: "다온클라우드가 내년 상반기까지 GPU 2만 장 규모의 AI 클러스터를 새로 짓는다. 학습보다 추론 수요가 더 빨리 늘고 있다는 판단이다.",
        },
      },
    ],
  },
  {
    key: "ai-mirr-humanoid-logistics-deal",
    beat: "ai",
    ago: 2380,
    title: "휴머노이드 첫 '정규직'…미르로보틱스 50대 공급 계약",
    dek: "미르로보틱스가 한결전자 물류센터에 휴머노이드 로봇 50대를 공급한다. 시범이 아닌 3년 운영 계약으로, 국내 휴머노이드의 첫 본격 상용화 사례다.",
    blocks: [
      {
        type: "why",
        items: [
          "휴머노이드가 '전시용 데모'에서 **돈을 받고 일하는 장비**로 넘어가는 국내 첫 사례다.",
          "대당 비용과 가동 조건이 공개되면서 사람 인건비와의 경제성 비교가 처음으로 가능해졌다.",
        ],
      },
      {
        type: "numbers",
        items: [
          { value: "50대", label: "1차 공급 물량" },
          { value: "₩150억", label: "3년 계약 총액" },
          { value: "₩1억", label: "대당 연 비용(유지보수 포함)" },
          { value: "20시간", label: "하루 가동 목표" },
        ],
      },
      {
        type: "section",
        label: "zoom_in",
        bullets: [
          "업무: 상자 피킹·적재, 반품 분류 등 3개 공정",
          "방식: 로봇을 사지 않고 쓰는 만큼 내는 구독형(RaaS)",
          "조건: 가동률 90% 미달 시 이용료 감액",
          "옵션: 성과에 따라 최대 300대 추가 공급",
        ],
      },
      {
        type: "section",
        label: "between_lines",
        text: "대당 연 1억 원은 2교대 인력 비용과 비슷한 수준이다. 미르로보틱스는 '사람보다 싸다'가 아니라 **'야간·주말 공백을 메운다'**로 고객을 설득했다.",
      },
      {
        type: "quote",
        text: "가장 구하기 어려운 게 야간 인력입니다. 로봇이 사람을 대체한다기보다 비어 있는 시간을 채우는 겁니다.",
        attribution: "한결전자 물류 담당 관계자",
      },
      {
        type: "section",
        label: "yes_but",
        text: "가동률 90% 조건은 미르로보틱스에 양날의 칼이다. 초기 고장이 잦으면 매출이 줄고 첫 레퍼런스도 흔들린다.",
      },
      {
        type: "next",
        items: ["1차 투입 뒤 실측 가동률 공개 여부", "2차 물량(최대 300대) 옵션 행사 시점"],
      },
    ],
    tags: ["휴머노이드", "로보틱스", "물류 자동화"],
    tickers: ["MIRR", "HGYL"],
    sources: [
      { name: "미르로보틱스 공시(모의)", kind: "filing" },
      { name: "한결전자 보도자료(모의)", kind: "press" },
    ],
    ai: "ai_draft_edited",
    editor: "desk-ai",
    byline: "NWM AI 데스크",
    views: 15800,
  },
  {
    key: "ai-inference-price-war",
    beat: "ai",
    ago: 3240,
    title: "AI 추론 단가 1년 새 4분의 1…'박리다매' 국면",
    dek: "상용 LLM API의 평균 토큰 단가가 1년 새 75% 떨어졌다. 모델 성능보다 '얼마나 싸게, 많이 쓰게 하느냐'가 AI 사업의 승부처가 됐다.",
    blocks: [
      {
        type: "why",
        items: [
          "AI 기능을 붙인 서비스의 원가 구조가 바뀌고 있다. 적자를 감수하며 붙이던 **무료 AI 기능**이 남는 장사로 바뀌기 시작했다.",
          "단가 하락의 수혜는 모델 개발사보다 대량으로 쓰는 서비스 기업 쪽에 쏠린다.",
        ],
      },
      {
        type: "chart",
        title: "상용 LLM API 평균 단가(출력 100만 토큰당, 2주 간격)",
        unit: "$",
        points: [16, 15.8, 15.8, 15.4, 15, 14.9, 14.3, 13.8, 13.8, 13.1, 12.5, 12.2, 11.6, 10.9, 10.6, 9.9, 9.1, 8.8, 8.1, 7.4, 7, 6.4, 5.8, 5.3, 4.8, 4.4, 4],
        source: "API 공개 요금표 집계(모의)",
      },
      {
        type: "numbers",
        items: [
          { value: "-75%", label: "평균 토큰 단가(1년)", trend: "down" },
          { value: "3.4배", label: "국내 기업 API 호출량(1년)", trend: "up" },
          { value: "-31%", label: "노바페이 건당 상담 원가", trend: "down" },
        ],
      },
      {
        type: "section",
        label: "big_picture",
        text: "단가를 끌어내린 힘은 세 갈래다.",
        bullets: ["작은 모델로도 충분한 성능", "추론 전용 칩의 확산", "오픈웨이트 모델과의 가격 경쟁"],
      },
      {
        type: "section",
        label: "zoom_in",
        text: "노바페이는 상담 챗봇의 대형 모델을 경량 모델로 바꾸고, 질문 난이도에 따라 모델을 나눠 쓰는 '라우팅'을 도입했다. 회사 측은 건당 상담 원가가 31% 줄었다고 밝혔다.",
      },
      {
        type: "section",
        label: "disagreement",
        text: "단가가 내려도 총비용이 오히려 느는 기업도 있다. 작업 한 건에 모델을 수십 번 호출하는 에이전트를 들인 곳에선 **사용량이 단가 하락보다 빠르게 늘고 있어서**다.",
      },
      {
        type: "quote",
        text: "단가표만 보면 공짜에 가까워졌는데 청구서는 매달 커집니다. 이제 원가를 정하는 건 모델 선택보다 호출 설계입니다.",
        attribution: "한 핀테크 기업 AI 플랫폼 담당자",
      },
      {
        type: "section",
        label: "bottom_line",
        text: "AI 사업의 경쟁력은 '가장 좋은 모델'에서 '충분히 좋은 답을 가장 싸게'로 옮겨가고 있다.",
      },
      {
        type: "next",
        items: ["오픈웨이트 모델 확산이 단가 하락을 더 앞당길지", "국내 클라우드의 추론 전용 요금제 경쟁"],
      },
    ],
    tags: ["추론 비용", "LLM", "AI 비즈니스"],
    tickers: ["NOVA"],
    sources: [
      { name: "API 공개 요금표 집계(모의)", kind: "data" },
      { name: "노바페이 IR 자료(모의)", kind: "press" },
    ],
    ai: "ai_assisted",
    editor: "desk-ai",
    author: "desk-ai",
    byline: "글 · 한서윤",
    views: 5200,
  },
];
