# NWM · 뉴웹미디어 — newweb.media

> 소음은 빼고, 신호만. AI · 크립토 · 경제 · 테크, 그리고 투자자 심리를 짧고 구조적으로 전하는 인터넷 신문.

이 저장소는 **독자용 사이트**와 **뉴스룸 콘솔**(정보 피드 → 기사 후보 → 발행)을 하나의 Next.js 앱으로 담고 있습니다. 피드·시세·커뮤니티 수집은 같은 저장소의 **수집 워커**(별도 프로세스)가 맡습니다.

| 단계 | 범위 | 상태 |
|---|---|---|
| 1 | 화면 전체 + 실제로 동작하는 뉴스룸 (Postgres) | ✅ 완료 |
| 2 | 정보 피드·시세·센티먼트 수집 (수집 워커, 어댑터, 기본 소스 40개) | 🔧 진행 중 — 공식 피드·시세는 실데이터로 수집. 키가 필요한 소스(DART·ECOS·X 등)는 키 대기. 센티먼트는 그림자 운영 |
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
| `/admin/candidates` | 칸반 (신규 → 작성중 → 검토 → 예약) |
| `/admin/candidates/[id]` | 구조화 편집기: 블록 편집, 자동저장, AI 어시스트(모의), 체크리스트, 미리보기, 발행·예약 |
| `/admin/articles` | 발행 기사: 지표, 수정·정정(버전), 정정 요청, 비공개 |
| `/admin/stories`, `/admin/activity`, `/admin/settings` | 스토리, 감사 로그, 법정 표기 |

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
    - 공식 피드: RSS/Atom, SEC EDGAR, arXiv, Hugging Face, Hacker News, 업비트·빗썸 마켓 변화, DART, ECOS, KOSIS
    - 시세·지표: 바이낸스, 업비트·빗썸 원화, 바이비트, 환율, 미 국채, 공포·탐욕 지수, 네이버 데이터랩
    - 소셜: 게시판 목록(HTML), 텔레그램, X
  - 결과는 네 곳에 저장합니다: 인박스(`feed_items`), 커뮤니티·소셜 게시물(`social_posts`), 시세(`market_quotes`), 지표(`market_metrics`). 실행 기록은 `ingest_runs`에 남습니다.
  - 실패하면 간격을 늘려 다시 시도합니다(최대 6시간, `Retry-After` 준수). 키가 없는 소스는 ‘키 필요’로 표시하고 한 시간 뒤 다시 확인합니다.
  - 게시판은 목록만 읽고 본문은 읽지 않습니다. robots.txt를 지키며, 예외는 협의 근거를 설정에 기록해야 켜집니다.
  - 주기 작업: 김치 프리미엄·게시물 분류(10분), 센티먼트 지수(매시 5분), 보관 기한 정리(매일).
  - 바뀐 데이터는 `/api/internal/revalidate`로 웹 캐시에 알립니다.
  - 기본 소스 목록은 `src/ingest/catalog`에 있습니다. 워커가 시작할 때 처음 보는 것만 추가하고, 뉴스룸에서 지운 소스는 되살리지 않습니다.
- **센티먼트 v1**
  - 산출 방법은 `/sentiment/method`에 공개합니다.
  - 게시물은 Claude API로 분류합니다(`SENTIMENT_MODEL`). 키·월 예산·동의가 없으면 사전(lexicon)으로 분류합니다.
  - 커뮤니티·소셜 40% + 시장 지표 45% + 관심도 15%를 robust z-score로 합쳐 −100…100으로 냅니다.
  - 새 값은 ‘그림자’로만 쌓입니다. 뉴스룸에서 공개로 바꿔야 사이트에 나갑니다.
- **데이터**: Postgres + Drizzle (`src/db/schema.ts`). 테이블은 다음과 같습니다.
  - `articles`: 블록 JSON, `ai_involvement`, 편집자
  - `article_revisions`, `article_corrections`, `correction_requests`
  - `stories`, `candidates`, `candidate_items`
  - `feed_sources`(라이선스 필드), `feed_items`, `experiments`
  - `market_quotes`, `market_metrics`, `social_posts`, `sentiment_snapshots`, `ingest_runs`
  - `article_stats_daily`, `activity_log`, `site_settings`
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
   | `SEED_ON_EMPTY` | 첫 배포만 `1` (샘플 데이터), 이후 `0`. 이미 쓰고 있는 DB(실제 기사·계정·가설이 있거나 샘플을 지운 적이 있음)에는 다시 넣지 않습니다. |
   | `LEGAL_*` (선택) | 법정 표기. 빌드 때 페이지에 들어가므로 **다음 배포부터** 반영됩니다. 바로 반영하려면 `/admin/settings`에서 입력합니다. |
   | `TRUSTED_PROXY_HOPS` | 기본 `1` (Railway 엣지). 앞에 CDN을 두면 `2` |

5. 빌드 순서 (Dockerfile): `db:migrate`(advisory lock) → (선택) `db:seed --if-empty` → `next build`.
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
   | `NEXT_PUBLIC_SITE_URL` | `https://newweb.media`. 캐시 갱신 요청을 이 주소로 보냅니다 (`REVALIDATE_URL`로 따로 지정 가능) |
   | `FEED_CONTACT_EMAIL` | 수집기 User-Agent에 붙는 연락처. 사이트 운영자가 문의할 수 있게 넣어 두세요 |
   | 데이터 키 | 있는 것만 넣습니다: `DART_API_KEY`, `ECOS_API_KEY`, `KOSIS_API_KEY`, `KOREAEXIM_API_KEY`, `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`, `X_BEARER_TOKEN`, `TELEGRAM_BOT_TOKEN` |
   | `ANTHROPIC_API_KEY` | 센티먼트용 게시물 분류. 없으면 사전만 씁니다 |
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
| `npm run test:unit` | 수집기·센티먼트 단위 테스트(실제 응답 캡처 사용) + DB 통합 테스트(`DATABASE_URL` 없으면 건너뜀) |
| `npm run probe:adapters [-- slug…]` | 기본 소스를 실제 엔드포인트에 한 번씩 실행해 파싱 결과 출력 (DB 사용 안 함) |
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

- **수집 (2단계) 남은 일** — 조사와 결정 기록은 `docs/phase2-feeds-research.md`에 있습니다.
  - 키 발급: DART, ECOS, KOSIS, 수출입은행, 네이버, X, 텔레그램 봇, Anthropic.
  - 커뮤니티: 협의한 게시판은 소스 설정에 `respectRobots: false`와 `robotsOverride`(협의 내용·일자)를 기록합니다. AI 분석까지 동의받은 곳만 `llmConsent: true`로 둡니다 (기본 소스는 `false`).
  - 텔레그램·X: 동의받은 채널과 지정 계정을 일시정지된 예시 소스에 채운 뒤 켭니다.
  - 바이비트·바이낸스 선물은 미국 러너에서 지역 차단됩니다. Railway에 올린 뒤 `/admin/ingest`에서 수집되는지 확인합니다.
  - 센티먼트는 2주 이상 그림자로 운영하고, `/admin/sentiment`에서 공포·탐욕 지수와 비교한 뒤 공개합니다.
  - 인박스 항목의 라이선스 필드를 먼저 검토해야 발행 체크를 통과합니다.
- **AI 연동 (3단계)**
  - `src/server/generator`에 Claude 구현을 추가하고 `DRAFT_GENERATOR=claude`로 전환합니다.
  - 데이터 자동 기사의 수치는 계속 코드 템플릿으로 채웁니다.
- **영문 Pro (보류)**
  - 스키마의 `edition` 컬럼(ko/en)이 확장 지점입니다.
