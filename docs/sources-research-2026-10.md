# 소스 조사 2: 기사가 ‘처음 나오는 곳’ (2026-10-24)

목표: 다른 언론 기사보다 먼저, 기사가 처음 나오는 곳을 기본 소스로 둡니다. 대상은 규제기관·국회·법원·공시, 기업의 약관·정책·변경 기록, 거래소 상장, 시장·데이터입니다.

방법:
- 네 갈래(국내 공공, 해외 규제·법원, 기업·플랫폼 변화, 크립토·시장·재미 데이터)를 웹 문서와 실제 수집기 코드로 조사했습니다.
- 키 없이 열리는 후보는 **Railway(싱가포르) 안에서 실제로 받아** 확인했습니다. 확인 결과는 ✓, 막힌 곳은 ✕, 확인하지 못한 곳은 미확인으로 적었습니다.
- 약관과 라이선스는 각 기관 문서를 따랐습니다. 법률 자문은 아닙니다.

> 이 문서의 ‘처리 방식’ 열에서 RSS·API는 지금 있는 어댑터(`rss`, `json.list` 등)로 바로 넣을 수 있다는 뜻입니다. **페이지 감시**는 `page.watch` 어댑터(페이지 본문이 바뀌면 바뀐 문단을 한 건으로, 공지 목록은 새 링크를 한 건씩 올림)로 받습니다. 실제로 넣은 목록은 `src/ingest/catalog/watch.ts`에 있습니다.

## 1. 바로 넣을 수 있는 것 (키 없음, 접속 확인)

접속 확인: 2026-10-24, Railway 안에서 실제로 받아 봄. ‘건수’는 그 시점 피드에 든 항목 수입니다(주말이라 0건인 곳은 평일에 다시 봅니다).

**국내 공공**

| 소스 | 주소 | 확인 | 어떤 기사 |
|---|---|---|---|
| 한국은행 보도자료(전체) | bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690 | ✓ 100건 | 지금 있는 ‘통계 보도자료’(B0000501)를 포함하는 상위 피드 |
| 한국은행 주간보도계획 | …/P0001726/news.rss?menuNo=200039 | ✓ | 다음 주 발표 일정 → 예고 기사·데스크 준비 |
| 한국은행 금통위 의결사항 | …/P0000093/news.rss?menuNo=200761 | ✓ | 통화정책방향 원문 |
| 한국은행 총재 연설 | …/P0002575/news.rss?menuNo=200041 | ✓ | 총재 발언 |
| 한국은행 경제전망보고서 | …/P0002359/news.rss?menuNo=200066 | ✓ | 성장률·물가 전망 |
| 한국은행 외환당국 순거래 | …/B0000299/news.rss?menuNo=200994 | ✓ | 분기 개입 규모 |
| 과학기술정보통신부 보도자료 | msit.go.kr/user/rss/rss.do?bbsSeqNo=94 | ✓ 50건 | GPU·AI 정책, 통신사 해킹 조사 |
| 국가데이터처(구 통계청) 보도자료 | kostat.go.kr/board.es?mid=a10301010000&bid=a103010100&act=rss | ✓ | 물가·고용 발표 |
| DART 오늘의 공시 | dart.fss.or.kr/api/todayRSS.xml | ✓ (키 없음, 최근 50건) | 유상증자·CB·자사주. 키 기반 `dart.list`를 보완 |
| KIND 오늘의 공시 | kind.krx.co.kr/disclosure/rsstodaydistribute.do?method=searchRssTodayDistribute&repIsuSrtCd=&mktTpCd=0&searchCorpName=&currentPageSize=15 | ✓ | 조회공시·거래정지 (약관 미확인) |
| 금융위원회 보도설명 | fsc.go.kr/about/fsc_bbs_rss/?fid=0112 | 점검 중(503) | 보도에 대한 해명 |

**해외 규제·중앙은행**

| 소스 | 주소 | 확인 | 어떤 기사 |
|---|---|---|---|
| SEC 성명 | sec.gov/news/statements.rss | ✓ | 위원 성명·규칙 승인 |
| SEC 소송 공지 | sec.gov/enforcement-litigation/litigation-releases/rss | ✓ | 크립토 사기 제재 |
| CFTC 집행 | cftc.gov/RSS/RSSENF/rssenf.xml | ✓ | 해외 거래소·사기 사건 |
| CFTC 보도자료 | cftc.gov/RSS/RSSGP/rssgp.xml | ✓ | 예측시장·현물 크립토 승인 |
| FTC 보도자료 | ftc.gov/feeds/press-release.xml | ✓ | AI 챗봇·소비자 보호 명령 |
| 연준 집행 | federalreserve.gov/feeds/press_enforcement.xml | ✓ | 은행 제재 |
| 연준 통화정책 | federalreserve.gov/feeds/press_monetary.xml | ✓ | FOMC 성명·의사록 |
| OCC | occ.gov/rss/occ_news.xml | ✓ | 크립토 신탁 인가 |
| NIST | nist.gov/news-events/news/rss.xml | ✓ (주제 넓음) | AI 표준·양자암호 |
| ECB 보도자료 | ecb.europa.eu/rss/press.html | ✓ | 유로 금리·디지털 유로 |
| BIS 보도자료 | bis.org/doclist/all_pressrels.rss | ✓ | 아고라 프로젝트(한국은행 참여), 스테이블코인 경고 |
| 일본은행 | boj.or.jp/en/rss/whatsnew.xml | ✓ | 금융시스템 보고서 |
| 일본 금융청 | fsa.go.jp/fsaNewsListAll_rss2.xml | ✓ | 크립토의 증권법 편입 |
| 홍콩 SFC 보도자료 | sfc.hk/en/RSS-Feeds/Press-releases | ✓ | 가상자산 거래소 인가 |
| EU 집행위 Press Corner | ec.europa.eu/commission/presscorner/api/rss | ✓ (문서화 안 된 주소) | DMA·AI법 결정·과징금 |
| 영국 CMA 사건 | gov.uk/cma-cases.atom | ✓ (주제 넓음) | 애플·구글 행위 규제 |
| 미 경제분석국 BEA | apps.bea.gov/rss/rss.xml | ✓ | GDP·PCE |
| 미 노동통계국 발표 일정 | bls.gov/schedule/news_release/bls.ics | ✓ (캘린더) | 발표 예고 |

막힘: 미 법무부 RSS(403), 영국 FCA(Cloudflare), EDPB(403), IMF(404), OECD(403).

**기업·플랫폼 변화 (약관·변경 기록·장애)**

| 소스 | 주소 | 확인 | 어떤 기사 |
|---|---|---|---|
| Open Terms Archive 메모 | opentermsarchive.org/en/memos/index.xml | ✓ | 큰 약관 변경 해설(예: X API 요금제, 텔레그램 AI 금지) |
| Open Terms Archive 생성형 AI 약관 변경 | github.com/OpenTermsArchive/genai-contrib-versions/commits/main.atom | ✓ | ChatGPT·Claude·Grok·Copilot·Gemini·DeepSeek 약관 변경 즉시 |
| 〃 플랫폼(페이스북·인스타·X·유튜브·틱톡) | …/pga-versions/commits/main.atom | ✓ | |
| 〃 기타(AWS·애플·크롬·코인베이스·바이낸스) | …/contrib-versions/commits/main.atom | ✓ | |
| 마이크로소프트 제품 약관 | microsoft.com/licensing/terms/feed/rss | ✓ (월 1회) | 코파일럿 라이선스 변경 |
| 애플 개발자 뉴스 | developer.apple.com/news/rss/news.rss | ✓ | 앱 심사 지침·개발자 약관 변경 |
| 장애: Claude | status.claude.com/history.rss | ✓ | 국내 서비스 영향 |
| 장애: GitHub / Cloudflare / AWS | githubstatus.com/history.atom · cloudflarestatus.com/api/v3/incidents.atom · status.aws.amazon.com/rss/all.rss | ✓ | |
| GitHub 변경 기록 | github.blog/changelog/feed/ | ✓ | |
| 클라우드 변경(소음 큼) | Azure updates RSS · docs.cloud.google.com/feeds/gcp-release-notes.xml · aws.amazon.com/about-aws/whats-new/recent/feed/ | ✓ | 키워드 거름망을 걸어 일시정지 상태로 |
| 오픈소스 릴리스 | github.com/<owner>/<repo>/releases.atom (vLLM, claude-code, PyTorch 등) | ✓ | llama.cpp는 하루 수십 건이라 제외 |

**AI·테크 1차 출처 (블로그·뉴스룸)**: Hugging Face 블로그 ✓, AWS 머신러닝 ✓, 애플 머신러닝 연구 ✓, 애플 뉴스룸 ✓, 마이크로소프트 공식 블로그 ✓·뉴스 ✓, 구글 공식 블로그 ✓, SK하이닉스 뉴스룸 ✓, 카카오 테크 ✓, 네이버 D2 ✓. (Anthropic·메타 AI 블로그는 RSS 없음, LG전자 접속 실패)

**크립토**: 이더리움 재단 블로그 ✓, 비트코인 코어 릴리스 ✓, EIP 마지막 검토(Last Call) ✓.

### 새 어댑터가 있으면 넣을 수 있는 것 (JSON API, 확인)

| 소스 | 주소 | 확인 | 어떤 기사 |
|---|---|---|---|
| 미 연방관보 | federalregister.gov/api/v1/documents.json?conditions[term]=stablecoin&order=newest | ✓ | 모든 연방 규칙·행정명령, 공개 전날 열람본(public-inspection)까지 |
| CourtListener 검색 | courtlistener.com/api/rest/v4/search/?q=OpenAI&type=r | ✓ (키 없이 검색됨) | AI 저작권 소송 진행 |
| ESMA MiCA 등록부 | esma.europa.eu/…/CASPS.csv | ✓ (CSV, 주 1회) | MiCA 인가 거래소 변동 |
| OFAC 제재 명단 | sanctionslistservice.ofac.treas.gov/…/SDN.XML | ✓ (전체 파일, 변경 비교) | 북한 연계 지갑 지정 |
| 바이비트 상장 공지 | api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto | ✓ | 신규 상장·상장 폐지 |
| OKX 상장 공지 | okx.com/api/v5/support/announcements?annType=announcements-new-listings | ✓ | |
| 코인원·디지털엑스(코빗)·고팍스 마켓 목록 | api.coinone.co.kr/public/v2/markets/KRW · api.digitalx.miraeasset.com/v2/currencyPairs · api.gopax.co.kr/trading-pairs | ✓ | 원화 마켓 상장·종료 (`exchange.markets` 확장) |
| 허깅페이스 기관별 새 모델 | huggingface.co/api/models?author=LGAI-EXAONE&sort=createdAt | ✓ | 국내 연구소(LG·네이버·카카오·업스테이지) 모델 공개 |
| 앤트로픽 채용(그린하우스) | boards-api.greenhouse.io/v1/boards/anthropic/jobs | ✓ | 서울 채용 = 한국 진출 신호 |
| DefiLlama 스테이블코인·체인 TVL | stablecoins.llama.fi/stablecoins · api.llama.fi/v2/chains | ✓ | 스테이블코인 시총 기록 |
| mempool.space | mempool.space/api/v1/fees/recommended | ✓ | 수수료 급등 |
| 위키백과 많이 본 문서(한국어) | wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/… | ✓ | 화제 측정 |
| 애플 앱스토어 한국 순위 | rss.marketingtools.apple.com/api/v2/kr/apps/top-free/25/apps.json | ✓ | AI 앱 순위 변화 |
| 폴리마켓·칼시 확률 | gamma-api.polymarket.com/events · api.elections.kalshi.com/trade-api/v2/markets | ✓ | 4절 주의 사항 |
| GitHub 새 저장소(별 순) | api.github.com/search/repositories?q=created:>… | ✓ | 뜨는 AI 오픈소스 |
| DeFiHackLabs 해킹 목록 | raw.githubusercontent.com/SunWeb3Sec/DeFiHackLabs/main/README.md | ✓ (Apache-2.0) | 주간 해킹 정리 |

## 2. 키가 필요한 것 (무료 신청)

| 소스 | 무엇이 나오나 | 신청 | 비고 |
|---|---|---|---|
| 국회 열린국회정보 OpenAPI | 의원 발의 법률안, 의안 접수, 진행 중 입법예고, 국회 일정, 본회의 표결 | open.assembly.go.kr 회원 키 | AI·가상자산·스테이블코인 법안이 발의되는 순간 |
| 법제처 국가법령 DRF | 그날 바뀐 법령(`lsHstInf`), 고시·훈령, 판례, 헌재 결정, 공정위·개인정보위·금융위·증선위·방미통위 결정문 | open.law.go.kr — OC(아이디) + **호출 서버 공인 IP 등록** + API별 신청 | Railway 출구 IP 고정 여부 확인 필요 |
| 국민참여입법센터 | 입법예고·행정예고 | OC 별도 신청 (XML) | 2025-09 사이트 통합 이후 호스트 확인 필요 |
| 공공데이터포털(data.go.kr) | 정책브리핑 보도자료 API(모든 부처, RSS 대체), 전자관보, 나라장터 사전규격·입찰공고 | 활용 신청 | 정책브리핑 RSS는 2026-07-01 중단 |
| OpenDART | 공시 원문·주요사항보고서 | 이미 키 자리 있음(`DART_API_KEY`) | 무료 키 없이 쓰는 RSS는 위 1절 |
| Congress.gov API | 미국 법안 진행 | api.data.gov 키 (시간당 5천 건) | 크립토 시장구조법, AI 선점법 |
| CourtListener | 미국 연방 소송 기록(AI 저작권 소송 등), 알림·웹훅 | 무료 토큰. 2026-05부터 하루 125회 | 회원 가입 시 한도 상향 |
| Etherscan | 이더리움 가스·주소 | 무료 키 (초당 3회) | “Powered by Etherscan.io APIs” 표기 필요 |
| KIPRIS Plus | 국내 특허·상표 | 일부 월 1천 회 무료 | AI 기업 상표 출원 |

## 3. 페이지 감시가 필요한 것 (RSS 없음)

| 소스 | 주소 | 무엇이 나오나 |
|---|---|---|
| 메타 Commercial Terms | facebook.com/legal/commercial_terms | 2026-10-30 시행. AI 오류 책임 고객 전가, 크롤러 허용 (CIO 기사) |
| 메타 Business AI Terms | facebook.com/legal/BusinessAITerms ✓ | 비즈니스 AI 에이전트 면책·배상 조항 |
| Anthropic 약관 | anthropic.com/legal ✓ | 문서별 PDF 이름이 내용 해시라 바뀌면 바로 알 수 있음 |
| xAI 약관 | x.ai/legal/… | 지난 버전이 `previous-YYYY-MM-DD` 주소로 남아 비교가 쉬움 |
| Gemini API 약관, 구글 AI 면책 서비스 목록 | ai.google.dev/gemini-api/terms 외 | 지역 제한·면책 범위 변경 |
| OpenAI 약관·변경 기록 | openai.com/policies/… | 봇 차단(403) → Open Terms Archive 피드로 대신 |
| 네이버·카카오·토스 공지·약관 | navercorp.com/policy/notice, kakaocorp.com/policy/notice, toss.im/notices | 국내 플랫폼 약관 변경(Open Terms Archive가 추적하지 않음). **자동 수집을 약관으로 금지**하므로 하루 4번 이하, 한 페이지씩, 정직한 User-Agent |
| 금융감독원 보도자료·검사결과 제재·세칙 예고 | fss.or.kr 목록 페이지 | RSS 없음 |
| 공정위·개인정보위 보도자료 | ftc.go.kr, pipc.go.kr 목록 페이지 | 플랫폼·AI 과징금, 유출 처분 |
| 헌법재판소 주요 결정 | ccourt.go.kr | 선고일 일정 소스는 찾지 못함 |
| OFAC 최근 조치 | ofac.treasury.gov/recent-actions | RSS는 2025-01-31 폐지. 북한 연계 지갑 지정 → 국내 거래소 노출 |
| OpenAI·Anthropic·Gemini 개발자 변경 기록·지원 종료 | 각 문서 사이트 | 모델 종료로 국내 개발사가 옮겨야 하는 일 |

## 4. 쓰지 않거나 조심할 것

- **KRX OpenAPI, data.go.kr 금융위 주식시세**: 비상업 목적만 허용(KRX), 공공누리 4유형(data.go.kr 시세)이라 재게시·상업 이용이 안 됩니다. 수치 인용에 그치고, 표·차트로 쓰려면 KRX 데이터 계약이 필요합니다.
- **폴리마켓**: 2026-08-18 방송통신심의위원회가 도박으로 국내 접속 차단을 결정했고 경찰 수사 중입니다. 확률을 숫자로만 쓰고 링크·추천 코드·베팅 안내는 쓰지 않습니다. 칼시·매니폴드도 같은 원칙으로 씁니다(매니폴드는 가상 화폐라 위험이 가장 낮음).
- **ETF 자금 흐름**: 무료로 쓸 수 있는 라이선스 소스가 없습니다(DefiLlama 유료, Farside는 추정치·라이선스 없음).
- **토큰 언락 일정**: 무료 소스가 없습니다(Tokenomist는 비상업 전용).
- **Coin Metrics**: CC BY-NC(비상업) — 쓰지 않습니다.
- **DefiLlama 무료 수익률(yields) 엔드포인트**: 2026-11-13 종료 예정.
- **코빗**: 미래에셋 ‘디지털엑스’로 바뀌었습니다. API 호스트는 `api.digitalx.miraeasset.com`(옛 주소는 당분간 별칭).
- **텔레그램 채널**: 운영자 동의가 필요합니다(Content Licensing and AI Scraping 약관, 2026-02). 편집국이 직접 받고 소스마다 `llmConsent`로 기록합니다.

## 5. 다른 언론 기사(신호 전용)

TechCrunch AI ✓, The Verge AI ✓, CoinDesk ✓, Cointelegraph ✓, 연합뉴스 경제 ✓(RSS 이용약관 확인 필요)는 무엇이 화제인지 알려 주는 단서로만 씁니다(`signalOnly`). AI 데스크는 이 기사만으로는 초안을 쓰지 않고 1차 자료 확인을 요구합니다.

## 6. 제안과 진행 (2026-10-24)

1–3은 반영했습니다. RSS 묶음은 `src/ingest/catalog/firsthand.ts`, 페이지 감시·JSON 목록·거래소 확장은 `src/ingest/catalog/watch.ts`에 있습니다. 메타 약관은 facebook.com robots.txt가 막아 넣지 않았고, xAI·업비트 공지 API는 봇 차단, 미스트랄·xAI 문서는 스크립트로만 그려져 넣지 않았습니다. 4번 키 신청 방법은 `docs/api-keys.md`에 있습니다.

아래는 처음 제안한 내용입니다.

1. **RSS 묶음 추가**: 1절의 ✓ 피드를 기본 소스로 넣습니다. 소음이 큰 것(클라우드 변경 기록, NIST, 영국 CMA, 오픈소스 릴리스)은 일시정지 상태로 두고 키워드 거름망을 정한 뒤 켭니다. 한국은행은 ‘보도자료(전체)’로 바꾸고 기존 ‘통계 보도자료’는 겹치므로 끕니다.
2. **`page.watch` 어댑터**: 페이지 본문을 하루 몇 번 비교해 바뀐 문단(전·후)과 시행일을 인박스에 올립니다. 3절의 약관·공지·제재 목록이 대상입니다(CIO 기사 같은 ‘약관 변경 해설’의 출발점). 페이스북은 싱가포르에서 인도네시아어 페이지를 주므로 언어를 고정해 받습니다.
3. **`json.list` 어댑터와 거래소 확장**: 연방관보·상장 공지·허깅페이스·채용 같은 JSON 목록을 설정만으로 받습니다. `exchange.markets`에 코인원·디지털엑스·고팍스를 더합니다.
4. **키 신청 (대표)**: 국회 OpenAPI, 법제처 DRF(서버 IP 등록), 공공데이터포털(정책브리핑·나라장터·전자관보), Congress.gov.
