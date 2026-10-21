# NWM · 뉴웹미디어 — newweb.media

> 소음은 빼고, 신호만. AI · 크립토 · 경제 · 테크, 그리고 투자자 심리를 짧고 구조적으로 전하는 인터넷 신문.

이 저장소는 **독자용 사이트**와 **뉴스룸 콘솔**(정보 피드 → 기사 후보 → 발행)을 하나의 Next.js 앱으로 담고 있습니다.

| 단계 | 범위 | 상태 |
|---|---|---|
| 1 | 화면 전체 + 실제로 동작하는 뉴스룸 (Postgres) | ✅ 이 저장소 |
| 2 | 정보 피드 연동 (어댑터·워커, 가설 H1–H4 A/B) | 준비됨 — 소스/아이템 모델·라이선스·실험 지표 |
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
| `/admin/sources`, `/admin/experiments` | 소스(라이선스 기록·신뢰 등급), 가설 관리 |
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
- **데이터**: Postgres + Drizzle (`src/db/schema.ts`). 테이블은 다음과 같습니다.
  - `articles`: 블록 JSON, `ai_involvement`, 편집자
  - `article_revisions`, `article_corrections`, `correction_requests`
  - `stories`, `candidates`, `candidate_items`
  - `feed_sources`(라이선스 필드), `feed_items`, `experiments`
  - `market_quotes`, `sentiment_snapshots`, `article_stats_daily`, `activity_log`, `site_settings`
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

1. Railway 프로젝트에 **Postgres**를 추가하고, 이 GitHub 저장소를 **서비스로 연결**합니다. `railway.json`이 Dockerfile 빌드와 `/api/health` 헬스체크를 지정합니다.
2. 리전은 **Singapore**를 권장합니다 (한국과 가장 가까움). Postgres도 같은 리전에 둡니다.
3. 서비스 변수를 설정합니다.

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

4. 빌드 순서 (Dockerfile): `db:migrate`(advisory lock) → (선택) `db:seed --if-empty` → `next build`.
   - 빌드가 DB에서 데이터를 읽어 페이지를 미리 만듭니다.
   - 마이그레이션은 **추가형(expand/contract)만** 허용합니다.
5. 레플리카는 **1개**로 운영합니다. 다중 인스턴스는 Redis cache handler를 도입한 뒤에 늘립니다 (2단계).
6. CDN: 정적 페이지는 `s-maxage` 헤더가 붙어 나갑니다. HTML을 CDN에 태우는 것은 purge 훅(`CDN_PURGE_*`)을 연결·검증한 뒤 켭니다.
7. 도메인: Railway 서비스에 `newweb.media`를 연결합니다.

**출시 전 체크리스트**
- 샘플 데이터를 지웁니다: `railway run npm run db:purge-samples`. 샘플이 남아 있으면 데모 배너가 뜨고 검색엔진 색인도 막힌 상태입니다.
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
| `npm run audit:build` | 공개 라우트가 모두 정적인지 빌드 결과를 검사 |
| `npm run test:e2e` | Playwright (공개·읽기 흐름·회귀·성능 예산). 프로덕션 서버에 `ADMIN_USERS`가 없으면 뉴스룸 흐름은 건너뜁니다 |
| `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/newsroom.spec.ts` | 뉴스룸 흐름 (승격 → 편집 → 발행 → 독자 화면 즉시 반영 → 정정 → 비공개). `npm run dev` 상태에서 실행하며, 만든 데이터는 끝나면 지웁니다 |
| `npm run verify` | 위 전체 |

## 다음 단계 메모

- **피드 연동 (2단계)**
  - `feed_sources.adapter`/`config`에 어댑터를 붙이고, 워커가 `feed_items`를 채운 뒤 `/api/internal/revalidate`를 호출합니다.
  - 후보 소스: DART, ECOS, 관세청, 거래소·온체인, SEC EDGAR, arXiv, 커뮤니티 집계.
  - 라이선스 필드를 먼저 검토해야 발행 체크를 통과합니다.
- **AI 연동 (3단계)**
  - `src/server/generator`에 Claude 구현을 추가하고 `DRAFT_GENERATOR=claude`로 전환합니다.
  - 데이터 자동 기사의 수치는 계속 코드 템플릿으로 채웁니다.
- **영문 Pro (보류)**
  - 스키마의 `edition` 컬럼(ko/en)이 확장 지점입니다.
