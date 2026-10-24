# NWM · 뉴웹미디어 — newweb.media

> AI·크립토·경제·테크 분야의 소식과 투자자 심리를 다루는 인터넷신문. 기사마다 AI 활용 방식과 책임 편집자를 밝힙니다.

이 저장소는 **독자용 사이트**와 **뉴스룸 콘솔**(정보 피드 → 기사 후보 → 발행)을 하나의 Next.js 앱으로 담고 있습니다. 피드·시세·커뮤니티 수집은 같은 저장소의 **수집 워커**(별도 프로세스)가 맡습니다.

| 단계 | 범위 | 상태 |
|---|---|---|
| 1 | 화면 전체 + 실제로 동작하는 뉴스룸 (Postgres) | ✅ 완료 |
| 2 | 정보 피드·시세·센티먼트 수집 (수집 워커, 어댑터, 기본 소스 129개) | 🔧 진행 중 — 공식 피드·시세는 실데이터로 수집. 키가 필요한 소스(DART·ECOS·X 등)는 키 대기. 센티먼트는 그림자 운영 |
| 3 | AI 연동 (Claude 기반 초안·어시스트) | 준비됨 — `DraftGenerator` 인터페이스, 현재 모의 구현 |

---

## 빠른 시작 (로컬)

```bash
cp .env.example .env.local          # DATABASE_URL 등
docker compose up -d                 # Postgres 16 (nwm/nwm)
npm install
npm run db:migrate                   # 스키마 적용
npm run db:seed                      # 한국어 샘플 콘텐츠 (가상 기업·샘플 표기)
npm run dev                          # http://localhost:3000
npm run worker                       # 수집 워커 (다른 터미널). 처음 시작할 때 기본 소스 목록을 추가합니다
```

- 뉴스룸: <http://localhost:3000/admin> — 개발 모드에서 `ADMIN_USERS`가 비어 있으면 `admin / nwm-dev`
- 운영용 계정: `npm run hash-password -- <login> <password>` 출력값을 `ADMIN_USERS`에 (여러 명은 `;`로 연결)

## 무엇이 들어 있나

### 독자 사이트 (`src/app/(site)`)

| 경로 | 화면 |
|---|---|
| `/` | TOP SIGNAL · 지금 알아야 할 5가지 · 라이브 리버 · For You · 센티먼트 · 분야별 레일 |
| `/ai` `/crypto` `/economy` `/tech` | 분야 페이지 |
| `/sentiment` | NWM 센티먼트 인덱스 대시보드 + 분야 |
| `/sentiment/method` | 센티먼트 인덱스 산출 방법 (입력, 가중치, 한계) |
| `/a/[slug]` | 기사 (smart-brevity 블록, AI 표기, 정정 이력, 읽기 큐) |
| `/s/[slug]` | 스토리 타임라인 (자동 업데이트를 한 흐름으로 묶음) |
| `/latest`, `/d/[date]` | 전체 리버, 일자 아카이브 |
| `/editors/[slug]` | 책임 편집자 |
| `/search` | 검색 (초성 검색 지원) |
| `/corrections` | 공개 정정 기록 |
| `/about`, `/policy/*` | 소개, AI 활용 원칙, 정정·반론, 청소년보호, 개인정보, 약관 |
| `/rss.xml`, `/sitemap.xml`, `/news-sitemap.xml` | 배포용 피드 |

**읽기 경험**
- 목록에서 연 기사는 **그 목록이 곧 읽기 큐**가 됩니다.
  - 모바일: 좌우 스와이프
  - 데스크톱: `J`/`K`, `←`/`→`, 하단 독, 우측 큐 레일
- 다음 기사는 미리 받아 두어(prefetch) 즉시 열리고, 뷰 트랜지션으로 넘어갑니다.
- 읽음 표시, “지난 방문 이후 N건” 구분선, ‘모두 확인’ 마커, For You 추천을 **기기 안에서만** 계산합니다. 로그인과 추적 쿠키는 없습니다.
- `⌘K` 또는 `/`로 검색합니다. `Aa` 메뉴에서 다크↔라이트 읽기 모드와 글자 크기를 바꿉니다. 둘 다 첫 화면부터 깜빡임 없이 적용됩니다.

### 뉴스룸 (`src/app/admin`, Basic Auth)

| 경로 | 기능 |
|---|---|
| `/admin` | 대시보드: KPI, AI 라벨 비율, 가설(H1–H4)별 퍼널, 시간대별 발행, 경보 (법정 기한 포함) |
| `/admin/feeds` | 피드 인박스: 점수·신뢰도·라이선스, 일괄 승격(묶음)/기각, 키보드 |
| `/admin/ingest` | 수집 현황: 워커 상태, 소스별 마지막 성공·다음 실행·오류, 주기 작업, 이번 달 비용, 지금 실행, 전체 일시정지 |
| `/admin/sentiment` | 센티먼트: 그림자 지수와 공포·탐욕 지수 비교, 구성 요소, 분류 결과·비용, 사이트 공개 전환 |
| `/admin/sources`, `/admin/experiments` | 소스(어댑터 설정 검사·예시, 필요한 키, 저장 전 미리 실행, 라이선스 기록·신뢰 등급), 가설 관리 |
| `/admin/sources/connect` | 텔레그램·X 연결: 채널 링크·계정을 붙여넣으면 확인(텔레그램은 채널 이름·구독자·최근 글, X는 계정 존재 여부) → 채널·계정마다 소스를 만들고 바로 수집 |
| `/admin/candidates` | 칸반 (신규 → 작성중 → 검토 → 예약) |
| `/admin/candidates/[id]` | 구조화 편집기: 블록 편집, 자동저장, AI 어시스트(Claude, 키가 없으면 모의), 체크리스트, 미리보기, 발행·예약 |
| `/admin/auto` | 자동 기사: 유형별 끄기 / 검토 후 발행 / 자동 발행, 발행 시각·급변동 기준, 최근 7일 생성·발행 기록, 막힘 경고 |
| `/admin/desk` | AI 데스크: 최근 24시간의 판단(초안·대기·보류·제외와 점수·이유), 설정(하루 초안 수·바로/나눠 쓰기·간격·기준 점수·예산·모델), 학습 현황(단계·유입 경로·주제별 반응·편집자 발행률), 편집 지침과 버전, 편집 노트(편집자 수정에서 배운 작성 규칙), 실행 기록 |
| `/admin/articles` | 발행 기사: 지표, 수정·정정(버전), 정정 요청, 비공개 |
| `/admin/stories`, `/admin/activity`, `/admin/settings` | 스토리, 감사 로그, 설정 (법정 표기, 텔레그램 연결, AI 초안 모델·이번 달 비용) |

## 아키텍처 요약

```
정보 피드(feed_sources·feed_items) ─▶ 기사 후보(candidates·draft JSON) ─▶ 발행(articles + revisions)
          ▲ 2단계 어댑터/워커                 ▲ DraftGenerator (모의 → Claude)       │
          └─────────── /api/internal/revalidate ◀── updateTag / revalidateTag ◀─────┘
```

- **Next.js 16.4 + Cache Components**
  - 공개 페이지는 전부 **정적 프리렌더(○)**입니다. `(site)/layout.tsx`의 `ensureStatic = 'navigation'`이 이를 빌드 시점에 강제합니다.
  - 데이터는 `'use cache'` + `cacheTag` + `cacheLife`(river 60s / article 30m)로 캐시합니다.
  - 발행·정정 시 `updateTag`로 해당 태그만 즉시 무효화합니다. 기존 기사 페이지에는 `feed` 태그를 달지 않으므로, 기사 하나를 발행해도 수백 개 페이지가 다시 렌더링되지 않습니다.
- **실시간 값은 HTML에 굽지 않습니다.** 티커, 새 기사 알림, 심리 지수는 `/api/pulse`(CDN 캐시 가능한 JSON)로 공급합니다.
- **수집 워커** (`src/worker`, `src/ingest`)
  - 웹과 따로 도는 프로세스입니다. 5초마다 실행할 때가 된 소스를 잠그고(`FOR UPDATE SKIP LOCKED`), 어댑터를 동시에 최대 4개까지 돌립니다.
  - 어댑터(`src/ingest/adapters`):
    - 공식 피드: RSS/Atom, SEC EDGAR, arXiv, Hugging Face, Hacker News, 업비트·빗썸·코인원·디지털엑스·고팍스 마켓 변화, DART, ECOS, KOSIS
    - 시세·지표: 바이낸스, 업비트·빗썸 원화, 바이비트, 환율, 미 국채, 공포·탐욕 지수, 네이버 데이터랩
    - 소셜: 게시판 목록(HTML), 텔레그램, X
    - 범용:
      - **페이지 변경 감시**(`page.watch`): RSS가 없는 페이지를 몇 시간마다 비교합니다. 약관·정책·변경 기록은 바뀐 문단을 한 건으로 올립니다(이전→이후, 긴 문단은 바뀐 말만 `[-지운 말-]{+새로 넣은 말+}`, ‘Effective/Last updated/시행일’ 같은 문서 날짜). 공지 목록(`mode: "links"`)은 새로 생긴 링크를 한 건씩 올립니다(스크립트로 여는 게시판은 `linkTemplate`으로 주소를 만듦). 첫 실행은 지금 모습만 저장하고, 두 판을 오가는 페이지는 한 번만 올립니다. 스크립트로만 그리는 페이지는 읽지 못합니다.
      - **JSON 목록**(`json.list`): 목록 위치(`itemsPath`)와 id·제목·링크·시간 필드만 정하면 어떤 JSON API든 인박스로 받습니다(거래소 공지, 연방관보, 모델 허브). 무료 키는 환경 변수(`DATA_GO_KR_KEY`, `ASSEMBLY_API_KEY`, `CONGRESS_API_KEY`)에서만 읽어 쿼리나 헤더로 보냅니다.
    - AI 데스크는 문서 변경 자료를 ‘무엇이 어떻게 바뀌었나’ 해설 기사 형식으로 씁니다(오탈자·서식만 바뀐 것은 제외).
  - 결과는 네 곳에 저장합니다: 인박스(`feed_items`), 커뮤니티·소셜 게시물(`social_posts`), 시세(`market_quotes`), 지표(`market_metrics`). 실행 기록은 `ingest_runs`에 남습니다.
  - 실패하면 간격을 늘려 다시 시도합니다(최대 6시간, `Retry-After` 준수). 키가 없는 소스는 ‘키 필요’로 표시하고 한 시간 뒤 다시 확인합니다.
  - 게시판은 목록만 읽고 본문은 읽지 않습니다. 게시판·페이지 감시·JSON 목록은 robots.txt를 지키며, 예외는 협의 근거를 설정에 기록해야 켜집니다.
  - 주기 작업: 김치 프리미엄·게시물 분류(10분), 센티먼트 지수(매시 5분), AI 데스크(설정한 간격), 보관 기한 정리(매일).
  - 바뀐 데이터는 `/api/internal/revalidate`로 웹 캐시에 알립니다.
  - 기본 소스 목록은 `src/ingest/catalog`에 있습니다. 워커가 시작할 때 처음 보는 것만 추가하고, 뉴스룸에서 지운 소스는 되살리지 않습니다.
- **센티먼트 v1**
  - 산출 방법은 `/sentiment/method`에 공개합니다.
  - 게시물은 Claude API로 분류합니다(`SENTIMENT_MODEL`). 키·월 예산·동의가 없으면 사전(lexicon)으로 분류합니다.
  - 커뮤니티·소셜 40% + 시장 지표 45% + 관심도 15%를 robust z-score로 합쳐 −100…100으로 냅니다.
  - 새 값은 ‘그림자’로만 쌓입니다. 뉴스룸에서 공개로 바꿔야 사이트에 나갑니다.
- **자동 기사** (`src/server/auto`, 워커 작업 `auto.articles`, 1분마다)
  - 유형: 크립토 데일리(매일 08:30), 투자심리 데일리(매일 21:00, 기본 꺼짐), 급변동 속보(비트코인·이더리움 1시간 ±3% 이상), 업비트·빗썸의 신규 거래지원·거래지원 종료·유의 종목 지정·해제.
  - 유형마다 `/admin/auto`에서 **끄기 / 검토 후 발행 / 자동 발행**을 고릅니다. 기본은 ‘검토 후 발행’이라 후보 보드 ‘검토’에 쌓입니다.
  - 자동 발행이면 예약 발행 스케줄러가 1분 안에 ‘NWM 데이터 데스크’ 이름으로 내고, ‘자동 생성 · 데이터 기반’으로 표기합니다. 필수 체크(출처 라이선스 등)에 걸리면 발행하지 않고 사유와 함께 ‘검토’로 돌려보냅니다.
  - 수치는 코드 템플릿이 실제 시세·지표에서 채웁니다(LLM 없음). 샘플·오래된 값은 쓰지 않고, 같은 사건은 키로 한 번만 만듭니다. 유형별 기사는 시리즈 스토리로 묶입니다.
- **AI 초안** (`src/server/generator`, `DRAFT_GENERATOR=claude`)
  - 피드 승격·아이디어·‘초안 다시 생성’ 때 Claude가 인박스 자료로 브리프를 씁니다. 모델은 `DRAFT_MODEL`(기본 `claude-opus-5-5`)로 정하고, `npm run compare:drafts`로 비교해 고릅니다.
  - 모델에는 신호 전용 소스(다른 언론사 기사)를 보내지 않습니다. 출처 목록은 모델이 아니라 코드가 실제로 쓴 자료에서 만들고, 원문에 없는 수치는 AI 메모에 따로 적습니다.
  - 키가 없거나, 이번 달 한도(`DRAFT_LLM_MONTHLY_USD`, 기본 50달러)를 넘었거나, 호출이 실패하면 규칙 기반 모의 초안으로 대신하고 AI 메모에 사유를 남깁니다. 뉴스룸이 모델 때문에 멈추지 않습니다.
  - 편집기의 어시스트(제목 후보·간결하게·왜 중요한가·숫자·관전 포인트)는 짧은 호출(effort low)로 같은 원칙을 따르고, ‘적용’을 눌러야 반영됩니다.
  - 호출마다 토큰·비용·실패 사유를 `ai_usage`에 남기고, `/admin/settings`에서 이번 달 사용액을 봅니다.
- **AI 데스크** (`src/server/desk`, 워커 작업 `desk.triage`·`desk.learn`·`desk.playbook`·`desk.lessons`)
  - 편집자가 피드를 다 보지 않아도 되게, 새 자료를 읽고 기사가 될 만한 소식을 골라 초안을 씁니다. 초안은 후보 보드 ‘검토’로 들어가고 **발행은 편집자가 합니다**.
  - 실행 간격(기본 1시간)마다:
    1. 아직 판단하지 않은 36시간 안의 자료를 40건씩 판단 모델(기본 Haiku 5.5)에 보내 사건 단위로 묶고, 사건마다 뉴스 가치·독자 관심·근거·위험(0–100)과 초안 / 보류 / 제외, 이유, 주제를 받습니다. 72시간이 지난 자료는 모델에 보내지 않고 제외합니다. 크립토도 다른 분야와 똑같이 판단합니다(등록 심사 기간에는 시험만 하고 발행하지 않으므로 데스크는 제한하지 않습니다. 사이트의 크립토 낮추기는 별도 설정).
    2. 코드가 규칙을 덧씌웁니다: 신호 전용 자료뿐이면 ‘보류(1차 자료 확인 필요)’(텔레그램·X 게시물만은 아래 ‘게시물 판독’으로 넘깁니다), 최근 기사·초안과 겹치거나 상업 이용이 안 되는 출처뿐이면 제외, 커뮤니티·미확인 출처뿐이면 근거 점수를 40으로 깎습니다.
    3. 최종 점수 = 모델 점수 + 학습 보정(±15) + 탐색 가산점(반응을 모르는 주제에 최대 6). 기준 점수(기본 60) 이상인 사건이 대기열에 올라가고, 대기 중에는 한 시간에 1점씩 깎이며 12시간이 지나면 빠집니다.
    4. 기준을 넘은 사건을 하루 초안 수(기본 10) 안에서 곧바로 초안 모델(기본 Opus 5.5)로 씁니다. 하루 몫이 차면 남은 사건은 대기했다가 자정(KST) 뒤에 다시 겨룹니다. ‘하루에 나눠 쓰기’로 바꾸면 07–23시에 고르게 쓰고 88점 이상만 먼저 씁니다.
    5. 하루 몫의 일부(기본 20%)까지는 기준보다 10점 안쪽으로 낮아도 반응을 아직 모르는 주제를 시험 삼아 씁니다. 그런 초안에는 AI 메모에 그렇게 적힙니다.
  - **원문 읽기**: 피드가 제목만 준 자료(요약 300자 미만)는 초안을 쓰기 전에 원문을 읽습니다. 공공기관(`.go.kr`·`.gov`·한국은행·KISA 등)은 항상, 회사 출처는 라이선스 검토에서 상업 이용이 허용된 뒤에만 읽습니다. 페이지 본문을 뽑고, 페이지가 첨부 목록뿐이면 보도자료 PDF를 `pdftotext`로 읽습니다(워커 이미지에 poppler-utils). robots.txt를 따르고, 읽은 본문은 자료의 `payload.body`에 남겨 편집기의 AI 버튼도 씁니다. 실패한 자료는 다시 읽지 않습니다. 그래도 제목밖에 없으면 초안을 쓰지 않고 ‘보류’로 남깁니다.
  - **게시물 판독·사진 재가공** (`src/server/generator/visual.ts`): 텔레그램·X 게시물만으로 된 이야기, 사진이 붙은 이야기는 초안 전에 Sonnet 5.5가 게시물을 읽습니다(사진 포함, AI 데스크 설정 ‘사진 재가공’).
    - 남이 만든 사진은 기사에 넣지 않습니다. 인박스에는 참고용으로만 보입니다.
    - 시세 차트면 바이낸스 공개 시세로 우리 차트를 새로 그리고(날짜 축, 게시물이 짚은 시점 표시, 긴 기간은 로그 눈금), "…할 때마다 비트코인이 두 배" 같은 주장은 표시 시점별 6·12개월 뒤 수익률과 1년 안 최고치 표로 확인합니다. 숫자는 코드가 계산하고 모델은 옮겨 쓰기만 합니다.
    - 계산한 값은 내부 소스 ‘NWM 데스크 계산’(`nwm-desk-data`, 수집 안 함)의 자료로 후보에 연결돼, 편집자가 출처를 보고 수치 체크도 통과합니다. 시세로 확인하지 못한 주장은 초안 없이 보류합니다.
    - 초안은 ‘화제·팩트체크’ 형식(주장은 출처를 밝혀 요약, 표본이 적다는 점과 투자 권유가 아니라는 점)으로 씁니다. 편집기의 AI 초안 버튼도 같은 단계를 거칩니다.
  - 모든 판단은 `desk_decisions`에 점수·이유와 함께 남고, 피드 인박스와 후보 보드에 ‘AI 초안 82’·‘AI 보류’ 같은 표시로 보입니다. 편집자가 먼저 처리한 자료는 데스크가 건드리지 않습니다.
  - **학습** (`desk.learn`, 3시간마다): 모델을 훈련하지 않습니다. 발행 1–60일 된 기사마다 첫 3일(KST)의 반응을 다른 기사와 비교한 점수로 만들고, 분야·주제·출처·시간대별로 평균을 냅니다. 표본이 적으면 평균 쪽으로 당깁니다.
    - 초반에는 검색 색인이 없어 조회수가 사이트 방문량을 따라가므로, 완독률·체류 시간·다음 기사 이동을 더 무겁게 봅니다. 측정 기사가 20건, 기사당 조회 중앙값이 5회를 넘기 전까지(‘수집 중’)는 독자 반응을 점수에 넣지 않고, 80건 전까지는 절반만 넣습니다.
    - 편집자의 결정(데스크 초안의 발행·반려)은 첫날부터 반영합니다.
    - 유입 경로(검색·SNS·직접·사이트 안·기타)는 조회 beacon이 리퍼러를 분류만 해서 보냅니다. 리퍼러 자체는 저장하지 않습니다.
  - **편집 지침** (`desk_playbooks`): 판단 프롬프트에 들어가는 짧은 원칙 목록입니다. 편집자가 고칠 수 있고, ‘지침 자동 검토’가 켜져 있으면 자료가 쌓인 뒤(측정 기사 또는 편집 결정 10건 이상) 주 1회 Sonnet 5.5가 반응과 반려 사유를 보고 새 버전을 씁니다. 버전은 모두 남습니다.
  - **편집 노트** (`draft_feedback`, `desk_lessons`, `desk.lessons`): 편집자가 AI 초안을 고쳐서 발행하면 그 전후를 배웁니다.
    - 첫 사람 저장 직전의 AI 초안과 발행본을 `draft_feedback`에 남깁니다. 텔레그램 ✏️ 지시문도 함께 남깁니다. 손대지 않고 발행한 초안, 반려한 초안, AI가 쓰지 않은 초안은 배울 거리로 쓰지 않습니다.
    - 고친 초안이 3건 쌓이면(6시간 간격, 1건이라도 3일이 지나면, 또는 ‘AI 정리 요청’) Sonnet 5.5가 지금 노트와 비교해 되풀이되는 수정만 노트로 만들거나 이어 갑니다. 근거 사례가 없는 노트는 코드가 버립니다.
    - 노트는 최대 12개입니다. 근거가 새로 나오지 않으면 30일마다 힘이 절반이 되고, 한 번만 확인된 노트는 한 달쯤 지나 빠집니다. 고정한 노트와 편집자가 직접 쓴 노트는 빠지지 않습니다. 읽은 수정 사례는 90일 뒤 지웁니다.
    - 초안을 쓸 때 ‘모든 초안’·그 분야·그 출처의 노트를 강한 순서로 8개까지 프롬프트에 넣습니다(데스크와 뉴스룸의 AI 초안 모두). `/admin/desk`에서 노트를 보고 고치고 고정하거나 지울 수 있습니다.
  - **저위험 표시**: 위험 20 이하, 근거 70 이상, 주 자료가 공식·1차 출처, 라이선스 검토 완료, 체크 통과(법률 확인·책임 편집자 제외)를 모두 만족하면 ‘저위험’을 붙입니다. 자동 발행은 아직 없고, 이 표시가 편집자 판단과 맞는지 본 뒤 일부를 자동으로 돌릴 수 있게 만든 장치입니다.
  - **비용**: 데스크 월 예산(기본 40달러, `desk:*` 호출 합계)과 뉴스룸 전체 한도(`DRAFT_LLM_MONTHLY_USD`)를 둘 다 지킵니다. 판단은 40건에 1센트가 안 되고(Haiku 5.5), 비용 대부분은 초안입니다(Opus 5.5 기준 1건에 대략 5–15센트). 실제 사용액은 `/admin/desk`에 나옵니다.
  - 워커에 `ANTHROPIC_API_KEY`가 없으면 쉬고, 이유를 실행 기록에 남깁니다. ‘지금 실행’은 꺼져 있어도 한 번 돕니다.
- **텔레그램 뉴스룸 봇** (`src/server/telegram`, 웹 서비스)
  - AI 데스크나 자동 기사가 ‘검토’에 초안을 올리면, 연결한 편집자에게 카드(제목·요약·본문·점수·발행을 막는 체크·AI 메모)를 보냅니다. 1분마다 웹 서비스의 스케줄러가 `/api/internal/telegram-tick`으로 새 초안을 찾습니다.
  - 카드 버튼:
    - **✅ 발행** → 한 번 더 ‘법률 검토 확인 · 발행’을 눌러야 나갑니다. 카드가 보여 준 버전에만 법률 확인이 묶이고, 그사이 초안이 바뀌었으면 발행하지 않고 새 카드를 보냅니다. 라이선스 같은 다른 필수 체크에 걸리면 답장으로 사유를 받아, 웹 편집기의 무시 발행처럼 기록합니다.
    - **✏️ 수정** → 답장으로 `제목: …`·`요약: …`을 보내면 그대로 바꾸고, 그 밖의 지시는 Claude(어시스트 모델, 뉴스룸 월 한도 안)가 초안 전체에 반영합니다. 어느 쪽이든 법률 확인은 풀리고 새 카드가 옵니다. 표·차트가 있는 초안은 편집기에서 고칩니다.
    - **🗑 반려** → 사유 4개 중 고르거나 답장으로 적습니다. 반려 사유는 AI 데스크 학습에 쓰입니다.
    - 미리보기·편집기 링크(뉴스룸 로그인 필요).
  - 웹에서 발행·반려·예약·수정하면 카드도 1분 안에 따라 바뀝니다.
  - 운영 명령(연결된 편집자만, 바꾼 내용은 모두 활동 기록에 `via: telegram`으로 남음). 명령 메뉴는 배포 뒤 첫 알림 주기에 등록됩니다.
    - `/status`(또는 ‘상태’): 워커 신호, 수집 소스(작동·오류·쉼, 최근 1시간·24시간 새 자료, 마지막 확인, 실패 중인 소스), AI 데스크(켜짐·오늘 초안·대기·마지막 실행·이번 달 비용), 검토 대기·예약·오늘 발행, 편집 노트. 아래 버튼으로 AI 데스크 켜기·끄기, 지금 실행, **수집 일시정지·재개**(워커 전체 스위치: 수집과 주기 작업이 30초 안에 멈춤, 카드 알림은 계속), 카드 알림 켜기·끄기를 합니다.
    - `/settings`(또는 ‘설정’): 하루 초안 수(5·10·15·20), 실행 간격(30분·1·2·4시간), 바로 쓰기·나눠 쓰기, 기준 점수 ±5, 켜기·끄기. 예산과 모델은 웹의 AI 데스크 화면에서 바꿉니다.
    - `/notes`(또는 ‘노트’): 편집 노트 목록에서 고정·고정 해제·삭제(한 번 더 확인)와 AI 정리 요청. `/note 경제: …`로 노트를 바로 추가합니다(분야를 빼면 모든 초안, 직접 쓴 노트는 고정).
  - 연결: `/admin/settings` → 텔레그램 → ‘연결 링크 만들기’가 웹훅을 이 사이트(`/api/telegram`)로 맞추고 15분짜리 1회용 링크를 만듭니다. 링크를 연 텔레그램 계정만 그 편집자로 연결되고, 모든 작업은 그 편집자 이름으로 활동 기록에 남습니다(`via: telegram`). 텔레그램에서 `/stop`으로 끊습니다.
  - 웹훅은 봇 토큰에서 만든 비밀값(`X-Telegram-Bot-Api-Secret-Token`)으로 확인합니다. `SITE_LOCK=1`이어도 `/api/telegram`은 열려 있습니다.
- **데이터**: Postgres + Drizzle (`src/db/schema.ts`). 테이블은 다음과 같습니다.
  - `articles`: 블록 JSON, `ai_involvement`, 편집자
  - `article_revisions`, `article_corrections`, `correction_requests`
  - `stories`, `candidates`, `candidate_items`
  - `feed_sources`(라이선스 필드), `feed_items`, `experiments`
  - `market_quotes`, `market_metrics`, `social_posts`, `sentiment_snapshots`, `ingest_runs`
  - `article_stats_daily`(유입 경로별 조회 포함), `activity_log`, `site_settings`, `ai_usage`
  - `desk_runs`, `desk_decisions`, `desk_playbooks`, `draft_feedback`, `desk_lessons` (AI 데스크)
  - `telegram_links`, `telegram_messages` (뉴스룸 봇)
- **검색·구글 뉴스**
  - 기사마다 1200×675 대표 이미지를 그립니다(`/a/{slug}/image`: 분야·제목·날짜를 브랜드 카드에). `og:image`·`twitter:image`와 기사 구조화 데이터(`NewsArticle.image`)에 같은 주소가 들어갑니다. 처음 요청 때 그려 기사 캐시와 함께 보관하고, 기사를 고치거나 정정하면 다시 그립니다.
  - 홈에 `NewsMediaOrganization`(이름·로고·연락처·정정 정책)과 `WebSite` 구조화 데이터, 대표 주소(canonical)를 둡니다. ‘등록 예정’인 법정 표기 값은 넣지 않습니다.
  - 독자 페이지는 `max-image-preview:large`로 큰 이미지 카드를 허용합니다. 사이트맵은 기사 4만 5천 건까지, 뉴스 사이트맵은 최근 48시간 기사입니다.
- **신뢰 장치**
  - 모든 기사에 AI 표기를 붙입니다. 화면 배지, 메타 태그, JSON-LD IPTC `digitalSourceType`.
  - AI 초안·보조 기사는 **책임 편집자가 없으면 DB가 거부**합니다 (CHECK 제약).
  - 발행 전 체크(1차 출처, 라이선스, 원문 인용, 수치 대조, 중복, 법률)를 거칩니다.
  - 정정 이력을 공개하고, 언론중재법 7일 기한에 맞춰 경보를 띄웁니다.
- **성능**
  - 래스터 이미지가 없습니다. 기사 커버는 결정적 SVG로 그립니다.
  - Pretendard는 dynamic subset(필요한 글자 조각만)으로 받습니다.
  - 서드파티 스크립트 0, 클라이언트 JS는 섬(island) 단위로 최소화했습니다.

## 배포 (Railway)

Postgres 하나와 서비스 두 개(**웹**, **수집 워커**)로 운영합니다. 두 서비스는 같은 저장소에서 빌드합니다.

> Railway는 저장소 안 설정 파일(`railway.json`/`railway.toml`, Config as Code)을 지원 종료했습니다. 새 서비스는 이 파일을 읽지 않고, 기존 서비스도 2026-12-01부터 읽지 않습니다. 그래서 이 저장소는 설정 파일 없이 **대시보드 설정과 서비스 변수**만으로 배포되게 했습니다. 설정을 코드(`.railway/railway.ts`)로 관리하려면 실제 프로젝트에서 `railway config pull`로 파일을 받아 고치세요. 이 파일은 Postgres를 포함한 프로젝트 전체를 관리합니다.

### 웹 서비스

1. Railway 프로젝트에 **Postgres**를 추가하고, 이 GitHub 저장소를 **서비스로 연결**합니다. 루트의 `Dockerfile`로 빌드됩니다.
   - Railway의 Postgres 템플릿은 외부 접속 주소를 만들지 않습니다. 빌드가 DB에 닿도록 Postgres 서비스 → Settings → Networking에서 **TCP Proxy**(포트 5432)를 켜고, Postgres 서비스 변수에 `DATABASE_PUBLIC_URL` = `postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_TCP_PROXY_DOMAIN}}:${{RAILWAY_TCP_PROXY_PORT}}/${{PGDATABASE}}`를 추가합니다.
2. 리전은 **Singapore**를 권장합니다 (한국과 가장 가까움). Postgres도 같은 리전에 둡니다.
3. Settings에서 **Healthcheck Path**를 `/api/health`로 둡니다.
4. 서비스 변수를 설정합니다.

   | 변수 | 값 |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (런타임·사설망) |
   | `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}?sslmode=require` — **빌드 시** 사용 (Railway 빌드는 사설망에 접근 불가) |
   | `ADMIN_USERS` | `npm run hash-password` 결과 |
   | `INTERNAL_API_SECRET` | 임의의 긴 문자열 |
   | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` (배포 간 고정) |
   | `NEXT_PUBLIC_SITE_URL` | `https://newweb.media` |
   | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (선택) | Google 서치 콘솔 소유권 확인용 HTML 태그 값(`content="…"` 안의 문자열). 도메인 DNS에 TXT 레코드로 확인했다면 필요 없습니다. 빌드 때 들어가므로 **다음 배포부터** 반영됩니다 |
   | `NEXT_PUBLIC_GA_ID` (선택) | Google 애널리틱스 4 측정 ID(`G-…`). 독자 페이지에만 붙고 뉴스룸에는 붙지 않습니다. 설정하면 개인정보처리방침에 방문 통계 항목이 함께 나갑니다. 빌드 때 들어가므로 **다음 배포부터** 반영됩니다 |
   | `SEED_ON_EMPTY` | 첫 배포만 `1` (샘플 데이터), 이후 `0`. 이미 쓰고 있는 DB(실제 기사·계정·가설이 있거나 샘플을 지운 적이 있음)에는 다시 넣지 않습니다. |
   | `LEGAL_*` (선택) | 법정 표기(제호·상호·등록번호·등록일·발행인·편집인·발행소·전화·사업자등록번호·청소년보호책임자·개인정보보호책임자·이메일·제보 이메일·창간). 빌드 때 페이지에 들어가므로 **다음 배포부터** 반영됩니다. 바로 반영하려면 `/admin/settings`에서 입력합니다. 예전 이름 `SITE_*`(`SITE_REG_NO`, `SITE_PUB_DATE` 등)도 읽습니다. 이름 목록은 `src/lib/site.ts`의 `LEGAL_FIELDS` |
   | `TRUSTED_PROXY_HOPS` | 기본 `1` (Railway 엣지). 앞에 CDN을 두면 `2` |
   | `PORT` | `3000`. 이미지가 듣는 포트입니다. 도메인의 대상 포트(Target Port)도 3000으로 맞춥니다 |
   | `DRAFT_GENERATOR` | `claude`면 AI 초안·어시스트에 Claude를 씁니다. 기본 `mock` |
   | `ANTHROPIC_API_KEY` | AI 초안용. 워커와 같은 키라면 Shared Variable로 두고 `${{shared.ANTHROPIC_API_KEY}}`로 참조합니다 |
   | `DRAFT_MODEL` · `DRAFT_ASSIST_MODEL` · `DRAFT_EFFORT` (선택) | 초안 모델(기본 `claude-opus-5-5`), 어시스트 모델(기본: 초안 모델), effort(기본: 모델 기본값) |
   | `DRAFT_LLM_MONTHLY_USD` | 초안·어시스트 합산 월 한도, 달러 (기본 50) |
   | `NEWSROOM_TELEGRAM_BOT_TOKEN` (선택) | 뉴스룸 텔레그램 봇 토큰(@BotFather → `/newbot`). 수집용 `TELEGRAM_BOT_TOKEN`과 다른 봇을 씁니다. 넣은 뒤 `/admin/settings` → 텔레그램에서 연결합니다 |

5. 빌드 순서 (Dockerfile → `scripts/docker-build.sh`): `db:migrate`(advisory lock) → (선택) `db:seed --if-empty` → `next build`.
   - DB 주소에는 비밀번호가 들어 있어서 `RUN` 줄에 직접 쓰지 않고 스크립트가 환경변수로 읽습니다. BuildKit은 `RUN` 줄을 빌드 인자 값으로 채워 로그에 찍습니다.
   - 빌드가 DB에서 데이터를 읽어 페이지를 미리 만듭니다.
   - 마이그레이션은 **추가형(expand/contract)만** 허용합니다.
6. 레플리카는 **1개**로 운영합니다. 다중 인스턴스는 Redis cache handler를 도입한 뒤에 늘립니다.
7. CDN: 정적 페이지는 `s-maxage` 헤더가 붙어 나갑니다. HTML을 CDN에 태우는 것은 purge 훅(`CDN_PURGE_*`)을 연결·검증한 뒤 켭니다.
8. 도메인: 웹 서비스에 `newweb.media`를 연결합니다.

### 수집 워커 서비스

1. 같은 프로젝트에서 **New → GitHub Repo**로 같은 저장소를 한 번 더 연결하고, 서비스 이름을 `worker` 등으로 바꿉니다. 공개 도메인은 만들지 않습니다.
2. 서비스 변수 `RAILWAY_DOCKERFILE_PATH`를 `Dockerfile.worker`로 둡니다.
   - 이 이미지에는 워커 번들 하나만 들어갑니다 (`node dist/worker.cjs`).
   - 빌드에 DB가 필요 없습니다.
3. 헬스체크는 비워 둡니다. 워커는 HTTP를 열지 않습니다. 리전은 웹과 같게, 레플리카는 1개로 둡니다.
4. 서비스 변수를 설정합니다.

   | 변수 | 값 |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `INTERNAL_API_SECRET` | 웹 서비스와 같은 값: `${{<웹 서비스 이름>.INTERNAL_API_SECRET}}` |
   | `NEXT_PUBLIC_SITE_URL` | `https://newweb.media` |
   | `REVALIDATE_URL` | `http://${{<웹 서비스 이름>.RAILWAY_PRIVATE_DOMAIN}}:${{<웹 서비스 이름>.PORT}}`. 캐시 갱신 요청을 사설망으로 보내므로 도메인 연결 전에도 동작합니다. 비우면 `NEXT_PUBLIC_SITE_URL`로 보냅니다 |
   | `FEED_CONTACT_EMAIL` | 수집기 User-Agent에 붙는 연락처. 사이트 운영자가 문의할 수 있게 넣어 두세요 |
   | 데이터 키 | 있는 것만 넣습니다: `DART_API_KEY`, `ECOS_API_KEY`, `KOSIS_API_KEY`, `KOREAEXIM_API_KEY`, `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`, `X_BEARER_TOKEN`, `TELEGRAM_BOT_TOKEN` |
   | `ANTHROPIC_API_KEY` | 센티먼트용 게시물 분류와 AI 데스크. 없으면 분류는 사전만 쓰고 데스크는 쉽니다 |
   | `DRAFT_LLM_MONTHLY_USD` | 뉴스룸 전체 AI 한도 — 웹 서비스와 같은 값(`${{<웹 서비스 이름>.DRAFT_LLM_MONTHLY_USD}}`)으로 두면 데스크도 같은 한도를 지킵니다 |
   | `NEXT_PUBLIC_CRYPTO_LOW_PROFILE` | 웹 서비스와 같은 값. 켜져 있으면 데스크도 크립토 소식을 고르지 않습니다 |
   | `SENTIMENT_LLM_MONTHLY_USD` | 분류 비용의 월 한도 (기본 30) |

5. 데이터 키는 프로젝트의 **Shared Variables**에 한 번 넣고, 두 서비스에서 `${{shared.DART_API_KEY}}`처럼 참조하기를 권합니다.
   - 수집은 워커가 하지만, 뉴스룸의 ‘미리 실행’은 웹 서비스에서 돌기 때문입니다.
   - 뉴스룸의 키 표시(✓/✕)는 워커가 보고한 값을 기준으로 합니다.
6. 배포 순서는 신경 쓰지 않아도 됩니다. 같은 푸시로 두 서비스가 함께 빌드되면, 워커는 웹 빌드가 마이그레이션을 끝낼 때까지 30초 간격으로 기다렸다가 시작합니다.
7. 확인 방법:
   - 워커 로그에 `worker started (… keys: …)`가 찍힙니다.
   - `/admin/ingest`의 ‘워커’가 **정상**으로 바뀝니다.
   - 처음 시작할 때 기본 소스 목록(`src/ingest/catalog`)이 추가되고, 키가 없는 소스는 ‘키 필요’로 표시됩니다.
8. (선택) Settings → **Watch Paths**에 `/src/**`, `/drizzle/**`, `/package*.json`, `/Dockerfile.worker`를 넣으면, 문서만 바뀐 푸시에서는 워커를 다시 빌드하지 않습니다.
9. 수집 멈추기: `/admin/ingest`의 **전체 일시정지**를 누르면 워커는 떠 있고 수집만 멈춥니다. 완전히 멈추려면 서비스를 중지합니다.

**출시 전 체크리스트**
- 샘플 데이터를 지웁니다: `railway run -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:purge-samples'` (웹 서비스에 연결한 상태에서 실행). 내 컴퓨터에서는 사설망 주소인 `DATABASE_URL`에 닿지 않으므로 공개 주소로 바꿔 실행합니다. 샘플이 남아 있으면 데모 배너가 뜨고 검색엔진 색인도 막힌 상태입니다.
  - 스크립트가 끝나면 `NEXT_PUBLIC_SITE_URL`의 `/api/internal/revalidate`를 호출해 데모 배너·noindex·샘플 기사 캐시를 바로 지웁니다 (`INTERNAL_API_SECRET` 필요). 호출하지 못하면 경고만 남고, 페이지는 각자의 갱신 주기(최대 6시간)에 맞춰 바뀝니다.
- 첫 로그인 계정은 이름이 ‘편집국’입니다. `/admin/settings` → **내 편집자 프로필**에서 실명을 입력해야 AI 초안·보조 기사를 발행할 수 있습니다.
- 인터넷신문 등록 후 `/admin/settings`에서 법정 표기를 입력합니다.
- 등록 완료 전에는 `SITE_LOCK=1`로 사이트 전체를 잠글 수 있습니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 / 프로덕션 빌드 / 실행 |
| `npm run typecheck` · `lint` | 타입·린트 |
| `npm run db:generate` · `db:migrate` | 마이그레이션 생성·적용 |
| `npm run db:seed [-- --if-empty]` | 샘플 데이터 (재실행하면 샘플을 갈아끼우고 시각을 지금으로 맞춤) |
| `npm run db:purge-samples` | 샘플 데이터 삭제 (실행 중인 서버의 캐시도 갱신) |
| `npm run worker` | 수집 워커 (개발용, `.env.local` 사용) |
| `npm run worker:build` | 워커 번들 `dist/worker.cjs` (워커 이미지에서 사용) |
| `npm run sources:sync [-- --update \| --dry]` | 기본 소스 목록을 DB에 반영. `--update`는 목록에서 온 소스의 기술 설정을 다시 맞춤, `--dry`는 미리 보기 |
| `npm run test:unit` | 수집기·센티먼트·자동 기사·AI 초안(가짜 클라이언트) 단위 테스트 + DB 통합 테스트(`DATABASE_URL` 없으면 건너뜀) |
| `npm run probe:adapters [-- slug…]` | 기본 소스를 실제 엔드포인트에 한 번씩 실행해 파싱 결과 출력 (DB 사용 안 함) |
| `npm run compare:drafts [-- --run --items 5 --models a,b@effort --candidates id,…]` | 같은 인박스 자료로 모델별 초안을 써서 시간·토큰·비용·체크 결과를 비교 (`reports/`에 보고서). `--run` 없이 실행하면 대상과 예상 비용만 보여 주고, `--run`에는 `ANTHROPIC_API_KEY`가 필요합니다. 운영 DB의 자료로 비교하려면 웹 서비스에 연결한 상태에서 `railway run -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run compare:drafts -- --run'` |
| `npm run audit:build` | 공개 라우트가 모두 정적인지 빌드 결과를 검사 |
| `npm run test:e2e` | Playwright (공개·읽기 흐름·회귀·성능 예산). 프로덕션 서버에 `ADMIN_USERS`가 없으면 뉴스룸 흐름은 건너뜁니다 |
| `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/newsroom.spec.ts` | 뉴스룸 흐름 (승격 → 편집 → 발행 → 독자 화면 즉시 반영 → 정정 → 비공개). `npm run dev` 상태에서 실행하며, 만든 데이터는 끝나면 지웁니다 |
| `npm run verify` | 위 전체 |

## CI (GitHub Actions)

`.github/workflows/ci.yml`이 푸시와 PR마다 두 작업을 돌립니다 (각 3–4분).

| 작업 | 내용 |
|---|---|
| Typecheck · lint · build · e2e | Postgres 서비스 → migrate + 샘플 시드 → 타입·린트 → 수집기·센티먼트 테스트 → 워커 번들 → 빌드 → 정적 감사 → 프로덕션 빌드 e2e → `next dev`에서 뉴스룸 흐름 e2e |
| Docker image builds and serves | Railway와 같은 방식으로 웹 이미지 빌드(마이그레이션·시드·프리렌더) → 컨테이너 실행 → 주요 경로 응답 확인 (`ADMIN_USERS` 없으면 `/admin`이 503으로 닫히는지 포함) → 워커 이미지 빌드·실행·정상 종료와 하트비트 확인 |

`.github/workflows/feeds-probe.yml`은 수집 코드가 바뀔 때(또는 수동 실행 시) GitHub 러너에서 실제 피드·API에 접속해 원본 응답과 어댑터 파싱 결과를 출력합니다. 통과·실패를 가르는 검사는 아닙니다. 러너는 미국 네트워크라 지역 차단(바이비트·바이낸스 선물 등)은 Railway(싱가포르)와 다를 수 있습니다.

## 다음 단계 메모

- **등록 심사 기간 (임시)** — 웹 서비스 변수 `NEXT_PUBLIC_CRYPTO_LOW_PROFILE`(기본 `1`)이 켜져 있어 크립토 분야를 앞에 내세우지 않습니다 (`src/lib/beats.ts`).
  - 메뉴·푸터·검색 명령·홈 분야 목록·사이트맵에서 빠지고, 소개 문구는 ‘AI·경제·테크 전문 인터넷신문’이 됩니다. 시세 띠에서는 거래소(Binance·업비트·빗썸) 시세가 빠집니다.
  - `/crypto` 페이지와 크립토 기사 주소는 그대로 열립니다. 자동 기사는 기본값이 ‘검토 후 발행’이라 저절로 나가지 않습니다.
  - 등록이 끝나면 Railway에서 값을 `0`으로 바꿉니다. 변수를 바꾸면 다시 배포되고(3~4분), 배포가 끝나면 모두 돌아옵니다.
- **AI 사용 표시 (꺼짐)** — 웹 서비스 변수 `NEXT_PUBLIC_AI_DISCLOSURE`(기본 `0`)가 꺼져 있어 독자 화면에 AI 사용 여부를 표시하지 않습니다 (`src/lib/labels.ts`).
  - 기사 배지·목록의 짧은 표시·‘제작 방식’ 줄·`nwm:ai-*` 메타·JSON-LD의 IPTC 출처 유형과 투자심리지수 산출 방법의 AI 언급이 빠지고, `/policy/ai`는 404입니다.
  - AI가 관여한 기사는 ‘편집 이름’(책임 편집자)으로, 기자가 쓴 기사는 바이라인으로 나갑니다. AI 관여 기사를 기자 작성으로 표시하지는 않습니다.
  - 뉴스룸은 기사마다 `ai_involvement`를 그대로 기록합니다. 값을 `1`로 바꾸면 다시 배포되면서 모든 기사에 표시가 돌아옵니다.
  - 포털 뉴스 제휴나 AI 기본법 투명성 의무를 검토할 때 이 설정을 다시 확인합니다.
- **수집 (2단계) 남은 일** — 조사와 결정 기록은 `docs/phase2-feeds-research.md`에 있습니다.
  - 키 발급: DART, ECOS, KOSIS, 수출입은행, 네이버, X, 텔레그램 봇, Anthropic.
  - 커뮤니티: 협의한 게시판은 소스 설정에 `respectRobots: false`와 `robotsOverride`(협의 내용·일자)를 기록합니다. AI 분석까지 동의받은 곳만 `llmConsent: true`로 둡니다 (기본 소스는 `false`).
  - 텔레그램·X: `/admin/sources/connect`에서 채널·계정을 붙여넣어 추가합니다. 같은 채널의 일시정지된 소스(예시 소스 포함)는 그 자리에서 다시 켜고, 이미 수집 중인 것은 건너뜁니다.
    - 텔레그램은 공개 채널의 미리보기(t.me/s)를 2분마다 읽습니다. 텔레그램 약관(Content Licensing and AI Scraping, 2026-02)은 운영자의 명시적 동의 없는 수집·AI 활용을 금지하므로, 동의는 편집국이 따로 받고 소스마다 `llmConsent`로 기록합니다(추가 화면 기본값: 받음). `false`인 채널은 AI 데스크와 투자심리 채점에서 빠지고 편집자만 봅니다.
    - X는 계정마다 소스 하나(공식 API, 10분 간격, 계정당 월 3,000건 상한 ≈ $15)입니다. 확인 단계는 무료 임베드 주소(publish.x.com)로 계정이 있는지만 봅니다. `X_BEARER_TOKEN`이 worker에 없으면 추가는 되지만 읽지 않습니다.
  - 바이비트·바이낸스 선물은 미국 러너에서 지역 차단됩니다. Railway에 올린 뒤 `/admin/ingest`에서 수집되는지 확인합니다.
  - 센티먼트는 2주 이상 그림자로 운영하고, `/admin/sentiment`에서 공포·탐욕 지수와 비교한 뒤 공개합니다.
  - 인박스 항목의 라이선스 필드를 먼저 검토해야 발행 체크를 통과합니다.
- **AI 연동 (3단계) 남은 일**
  - Anthropic 키를 받으면 `npm run compare:drafts -- --run`으로 모델을 비교하고, `DRAFT_MODEL`을 정한 뒤 웹 서비스에 `DRAFT_GENERATOR=claude`를 켭니다.
  - 자동 기사는 처음엔 ‘검토 후 발행’으로 두고, 유형별로 결과가 안정되면 ‘자동 발행’으로 바꿉니다. 자동 발행 유형의 출처(거래소 마켓 소스 등)는 라이선스 검토를 먼저 마쳐야 합니다.
  - 데이터 자동 기사의 수치는 계속 코드 템플릿으로 채웁니다.
- **영문 Pro (보류)**
  - 스키마의 `edition` 컬럼(ko/en)이 확장 지점입니다.
