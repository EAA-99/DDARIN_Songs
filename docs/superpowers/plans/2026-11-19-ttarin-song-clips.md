# 따린 노래 클립 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SOOP insome0319 채널의 시청자 클립 중 따린님이 부른 노래를 모아 검색·필터·정렬·순위·곡/가수 페이지로 보여주는 공개 사이트와 관리자 화면, 매일 자동 수집기를 만든다.

**Architecture:** Next.js(App Router, TypeScript) 앱 하나를 Vercel에 배포한다. 데이터는 Neon Postgres(Drizzle ORM). 순수 로직(제목 분석·정규화·SOOP 응답 검증·무대 묶기)은 `src/lib`에 두고 단위 테스트하며, DB를 쓰는 로직은 테스트에서 PGlite(메모리 Postgres)로 검증한다. Vercel Cron이 하루 한 번 수집 API를 부른다.

**Tech Stack:** Next.js(최신 안정판, App Router) · TypeScript · Tailwind CSS · Drizzle ORM + `@neondatabase/serverless`(운영) / `@electric-sql/pglite`(테스트) · zod · Vitest · Pretendard 글꼴

**Spec:** `docs/superpowers/specs/2026-11-19-ttarin-song-clips-design.md`

## Global Constraints

- 채널 ID `insome0319`, 따린 이름 표기 `따린`.
- SOOP 목록 API: `https://api-channel.sooplive.com/v1.3/channel/insome0319/vod/clip`, `perPage=60`, `field=title,contents,user_nick,user_id`, 정렬 `orderBy=reg_date|read_cnt`, 기간 `startDate`/`endDate`(YYYY-MM-DD).
- 임베드 주소: `https://vod.sooplive.com/player/{titleNo}/embed`, 바깥 링크: `https://vod.sooplive.com/player/{titleNo}`.
- SOOP `regDate`(`YYYY-MM-DD HH:mm:ss`)는 KST(+09:00)로 해석해 timestamptz로 저장. "이번 주/이번 달"도 KST 기준(주는 월요일 시작).
- 요청 예절: 동시 요청 최대 2, 요청 간 간격 300ms 이상, 한 번 실행의 요청 예산 기본 60번.
- 무대 묶기 창: 같은 곡, 등록 시각 차이 **3시간 이내**.
- 매일 갱신: 새 클립 → 최근 **90일** 조회수 → 오래된 기간 순환(**14일**에 한 바퀴) → 삭제 확인.
- 공개 노출 상태: `auto`, `confirmed`만. `locked=true`인 클립·무대는 자동 갱신이 조회수·썸네일 외에 바꾸지 않는다.
- 듀엣 = 부른 사람 2명 이상(3인 이상 포함).
- 비밀값은 환경변수: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`.
- 색: 흰 바탕 + 파란 헤더(그라데이션 `#2f6bff → #5fa8ff`), 글자 `#0b0d12`, 다크 모드 지원. 파랑 값은 CSS 변수 `--brand` 하나로 바꿀 수 있게.
- UI 문구는 한국어. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 비상업(광고·후원 없음).

## Review Focus

1. **SOOP 응답 형식 변화** — 필드가 빠지거나 타입이 바뀐 응답: 아무것도 저장하지 않고 실행을 실패로 기록, 기존 데이터·사이트는 그대로. (Task 3, Task 6 테스트)
2. **관리자 수정값 보존** — 관리자가 고친 클립을 다음 날 갱신이 다시 분류: 곡·부른 사람·상태·무대가 그대로여야 함. (Task 5 테스트)
3. **동시 실행** — Cron과 관리자 버튼이 겹침: 두 번째 실행은 즉시 "이미 실행 중"으로 끝남. (Task 6 테스트)
4. **한글·영문 섞인 검색** — `feel good`, `FEELGOOD`, `메모리즈` 아닌 `Memories`, 띄어쓰기 차이: 정규화 비교로 찾아져야 함. (Task 7 테스트)
5. **SOOP에서 지워진 클립** — 다시 받은 기간에서 사라진 클립: `gone`으로 숨기고, 그 무대의 대표 클립·조회수·순위가 다시 계산됨. (Task 5, Task 7 테스트)

---

## 파일 구조

```
src/
  lib/
    normalize.ts        정규화(norm), slug 만들기
    parse-title.ts      제목 → 곡명·원곡 가수·부른 사람·상태
    soop.ts             SOOP API 호출 + zod 검증 + 요청 예절
    kst.ts              KST 시각 변환, 주/월 시작
  db/
    schema.ts           Drizzle 테이블
    index.ts            getDb(): 운영 Neon / 테스트 주입
    migrations/         drizzle-kit 생성물
  server/
    catalog.ts          곡 연결, 무대 묶기, 대표 클립 재계산
    ingest.ts           SOOP 클립 → DB 반영(잠금 보존, 삭제 표시)
    sync.ts             runDaily / runBackfillStep / 실행 잠금 / 기록
    queries.ts          공개 조회: 검색·순위·곡·가수
    admin.ts            관리자 변경: 수정·일괄·합치기·나누기
    auth.ts             비밀번호 확인, 서명 쿠키, 시도 제한
  app/
    layout.tsx, globals.css
    page.tsx                    첫 화면
    song/[slug]/page.tsx        곡 페이지
    artist/[slug]/page.tsx      가수 페이지
    admin/page.tsx, admin/login/page.tsx, admin/actions.ts
    api/cron/route.ts           Vercel Cron 진입점
  components/
    PlayerProvider.tsx, Player.tsx, PerformanceList.tsx, RankingPanel.tsx,
    SearchControls.tsx, AdminTable.tsx
scripts/
  measure-parser.ts     실제 제목 샘플로 분류 비율 측정
  backfill.ts           로컬에서 첫 수집 반복 실행
tests/
  helpers/db.ts         PGlite + 마이그레이션 적용한 테스트 DB
  fixtures/soop-page.json, fixtures/titles.json
  *.test.ts
vercel.json             Cron 설정
```

---

### Task 1: 프로젝트 뼈대, DB 스키마, 테스트 DB

**Files:**
- Create: 프로젝트 전체 뼈대(`create-next-app`), `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`, `tests/helpers/db.ts`, `tests/schema.test.ts`, `vitest.config.ts`, `.env.example`

**Interfaces:**
- Produces:
  - 테이블 `clips`, `songs`, `performances`, `syncRuns`, `syncState`, `loginAttempts` (Drizzle 객체, 아래 컬럼)
  - `type Db` (Drizzle 인스턴스 타입, Neon/PGlite 공통으로 쓰는 쿼리 API)
  - `getDb(): Db` — `DATABASE_URL`로 Neon 연결(모듈 단위 1회 생성)
  - `createTestDb(): Promise<Db>` — PGlite 메모리 DB에 마이그레이션 적용

컬럼(스펙 5장 그대로, 이름은 snake_case):
- `clips`: `title_no bigint pk`, `title_raw text`, `uploader_nick text`, `uploader_id text`, `reg_date timestamptz`, `read_cnt int`, `thumb_url text`, `duration_ms int`, `status text` (`auto|review|not_song|confirmed|gone`), `song_id int null fk`, `performers text[]`, `is_duet bool`, `performance_id int null fk`, `locked bool default false`, `first_seen_at timestamptz`, `views_updated_at timestamptz`. 인덱스: `reg_date`, `status`, `song_id`, `performance_id`.
- `songs`: `id serial`, `slug text unique`, `title text`, `title_norm text`, `original_artist text null`, `artist_norm text null`. 인덱스 `title_norm`, `artist_norm`.
- `performances`: `id serial`, `song_id int fk`, `started_at timestamptz`, `best_clip_no bigint null`, `best_read_cnt int default 0`, `clip_count int default 0`, `is_duet bool`, `performers text[]`, `performers_norm text[]`, `locked bool default false`.
- `sync_runs`: `id serial`, `kind text` (`daily|manual|backfill`), `started_at`, `finished_at null`, `new_clips int`, `updated_views int`, `error text null`.
- `sync_state`: `key text pk`, `value jsonb`, `updated_at`.
- `login_attempts`: `id serial`, `at timestamptz`, `ok bool`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --import-alias "@/*"`(기존 `docs/`, `.gitignore` 유지), 의존성 설치: `drizzle-orm @neondatabase/serverless zod`, dev: `drizzle-kit @electric-sql/pglite vitest tsx`. `package.json` 스크립트 `test: vitest run`, `db:generate: drizzle-kit generate`.
- [ ] **Step 2: 실패하는 테스트** `tests/schema.test.ts`

```ts
test("migrations create all tables", async () => {
  const db = await createTestDb();
  const r = await db.execute(sql`select table_name from information_schema.tables where table_schema='public' order by 1`);
  expect(r.rows.map((x: any) => x.table_name)).toEqual(
    ["clips", "login_attempts", "performances", "songs", "sync_runs", "sync_state"]);
});
```
- [ ] **Step 3:** `npx vitest run tests/schema.test.ts` → FAIL (`createTestDb` 없음)
- [ ] **Step 4:** 스키마 작성 → `npm run db:generate` → `createTestDb`가 `src/db/migrations`의 SQL을 PGlite에 적용.
- [ ] **Step 5:** `npx vitest run tests/schema.test.ts` → PASS. `npm run build` 성공.
- [ ] **Step 6: Commit** `chore: Next.js 뼈대, DB 스키마, 테스트 DB`

---

### Task 2: 정규화와 제목 분석기

**Files:**
- Create: `src/lib/normalize.ts`, `src/lib/parse-title.ts`, `tests/normalize.test.ts`, `tests/parse-title.test.ts`, `scripts/measure-parser.ts`, `tests/fixtures/titles.json`

**Interfaces:**
- Produces:
  - `norm(s: string): string` — NFKC, 소문자, 공백·기호(`'’"·.,!?~-`) 제거
  - `slugify(s: string): string` — 주소용: NFKC, 소문자, 공백→`-`, 한글·영숫자·`-`만 남김, 비면 `"x"`
  - `type Parsed = { status: "auto" | "review" | "not_song"; songTitle: string | null; originalArtist: string | null; performers: string[] }`
  - `parseTitle(raw: string): Parsed` — 스펙 6장 규칙 1~6

- [ ] **Step 1: 실패하는 테스트** `tests/normalize.test.ts`

```ts
expect(norm("Feel Good")).toBe(norm("feelgood"));
expect(norm("Rockin’ Around The Christmas Tree")).toBe(norm("rockin around the christmas tree"));
expect(slugify("Viva La Vida")).toBe("viva-la-vida");
expect(slugify("돌고 돌아가는 길")).toBe("돌고-돌아가는-길");
```

`tests/parse-title.test.ts` — `test.each`로 실제 제목 형식을 고정:

| 입력 | status | songTitle | originalArtist | performers |
|---|---|---|---|---|
| `따린 - Feel Good` | auto | Feel Good | null | [따린] |
| `따린 - Snowman (짧) [로이세끼2]` | auto | Snowman | null | [따린] |
| `[클립][따린]따린-Highlight` | auto | Highlight | null | [따린] |
| `따린 - HighLight [더블링]` | auto | HighLight | null | [따린] |
| `[클립]허니 - 따린 Cover` | auto | 허니 | null | [따린] |
| `[클립]붉은노을 - 구슬요x따린x냐냐 Cover` | auto | 붉은노을 | null | [구슬요, 따린, 냐냐] |
| `[클립]8282 - 구슬요x따린 Cover` | auto | 8282 | null | [구슬요, 따린] |
| `[클립][로이세끼 특별공연] 따린 -Memories(윤미래)` | auto | Memories | 윤미래 | [따린] |
| `[클립]memories - 따린님` | auto | memories | null | [따린] |
| `[로이세끼2] 윤미래 - Memories` | review | Memories | 윤미래 | [] |
| `[클립]안동역에서 - 구슬요 Cover` | not_song | null | null | [] |
| `[따린 반응] 키마 - 운다(리누)` | not_song | null | null | [] |
| `Coldplay - Viva La Vida [구슬요&따린 풀트 저스트댄스 2026]` | not_song | null | null | [] |
| `[클립]따린 더빙` | not_song | null | null | [] |
| `[클립]사탕 따는 팁` | not_song | null | null | [] |
| `[클립]따린` | not_song | null | null | [] |

(`따린님` → `따린`으로 정리. 부른 사람 구분자: `x`, `×`, `X`(이름 사이), `&`, `,`. `Cover`/`cover`/`커버` 단어는 이름에서 제거.)
- [ ] **Step 2:** `npx vitest run tests/normalize.test.ts tests/parse-title.test.ts` → FAIL
- [ ] **Step 3:** 구현. 규칙 순서는 스펙 6장. 하이픈 구분은 공백 유무와 무관하게 첫 `-`(`따린-Highlight`, `따린 -Memories` 처리).
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5: 분류 비율 측정.** `scripts/measure-parser.ts`: SOOP API로 최신순 20쪽(1,200개)을 받아(Task 3의 `fetchClipPage`가 아직 없으므로 이 스크립트 안에서 `fetch`로 직접) `tests/fixtures/titles.json`(제목만)으로 저장하고 상태별 개수와 `review` 예시 30개를 출력. 실행: `npx tsx scripts/measure-parser.ts`. 결과(비율)를 커밋 메시지에 적는다. `review`가 노래 후보의 30%를 넘으면 흔한 형식을 테스트 표에 추가하고 규칙을 보강한 뒤 다시 측정.
- [ ] **Step 6: Commit** `feat: 제목 분석기(측정: auto N% / review N% / not_song N%)`

---

### Task 3: SOOP 클라이언트

**Files:**
- Create: `src/lib/soop.ts`, `src/lib/kst.ts`, `tests/soop.test.ts`, `tests/kst.test.ts`, `tests/fixtures/soop-page.json`(실제 응답 1쪽 저장, 60개)

**Interfaces:**
- Produces:
  - `type SoopClip = { titleNo: number; title: string; uploaderNick: string; uploaderId: string; regDate: Date; readCnt: number; thumbUrl: string; durationMs: number }`
  - `type PageQuery = { page: number; orderBy: "reg_date" | "read_cnt"; startDate?: string; endDate?: string }`
  - `fetchClipPage(q: PageQuery, f?: typeof fetch): Promise<{ clips: SoopClip[]; totalPages: number; totalItems: number }>` — 응답을 zod로 검증, 실패 시 `SoopFormatError` throw. HTTP 오류는 `SoopHttpError`. `fileType !== "CLIP"` 항목은 제외.
  - `class Throttle { constructor(concurrency = 2, gapMs = 300); run<T>(fn: () => Promise<T>): Promise<T> }`
  - `parseKst(s: string): Date`, `kstWeekStart(now: Date): Date`, `kstMonthStart(now: Date): Date`, `kstDate(d: Date): string` (YYYY-MM-DD)

- [ ] **Step 1: 실패하는 테스트**
  - `fetchClipPage`에 fixture를 돌려주는 가짜 fetch → 60개, 첫 항목 `titleNo`·`regDate`(KST 해석)·`readCnt`가 fixture 값과 같음. 요청 URL에 `orderBy`, `page`, `perPage=60`, `startDate`/`endDate`가 들어감.
  - `contents[0].count` 삭제한 응답 → `SoopFormatError`.
  - 상태 503 → `SoopHttpError`.
  - `Throttle(2, 50)`: 작업 5개 동시 요청 시 동시에 2개 넘게 안 돎, 시작 간격 ≥ 50ms.
  - `parseKst("2026-11-17 01:08:50").toISOString() === "2026-11-16T16:08:50.000Z"`; `kstWeekStart(2026-11-19 KST)` = 2026-11-16 00:00 KST; `kstMonthStart` = 2026-11-01 00:00 KST.
- [ ] **Step 2:** `npx vitest run tests/soop.test.ts tests/kst.test.ts` → FAIL
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5: Commit** `feat: SOOP 클립 API 클라이언트와 KST 도우미`

---

### Task 4: 곡 연결과 무대 묶기

**Files:**
- Create: `src/server/catalog.ts`, `tests/catalog.test.ts`

**Interfaces:**
- Consumes: `norm`, `slugify` (Task 2), 스키마 (Task 1)
- Produces:
  - `findOrCreateSong(db: Db, title: string, artist: string | null): Promise<number>` — 정규화 곡명이 같고 (가수 정규화가 같거나 한쪽이 null)이면 기존 곡; 기존 곡 가수가 null이고 새 값이 있으면 채움. 새 곡 slug 충돌 시 `-2`, `-3`… 붙임.
  - `guessArtist(db: Db, title: string): Promise<string | null>` — 같은 정규화 곡명의 곡 중 가수가 있는 것.
  - `assignPerformance(db: Db, clipNo: number): Promise<number>` — 클립의 곡과 `reg_date` 기준 ±3시간 안에 같은 곡 클립이 있는 무대(잠긴 무대 포함)에 넣고, 없으면 새 무대.
  - `refreshPerformance(db: Db, performanceId: number): Promise<void>` — 공개 상태 클립 기준으로 `started_at`, `best_clip_no`, `best_read_cnt`, `clip_count`, `performers`(합집합), `performers_norm`(각 이름 `norm`), `is_duet` 재계산. 공개 클립이 0개면 `clip_count=0`.

- [ ] **Step 1: 실패하는 테스트** (`createTestDb` 사용)
  - `findOrCreateSong("Feel Good", null)`과 `("feelgood", null)` → 같은 id. `("Memories", null)` 후 `("Memories","윤미래")` → 같은 id, 가수 채워짐. `("Memories","다른가수")` → 다른 id, slug `memories-2`.
  - 같은 곡 클립 3개(00:00, 02:30, 05:00) → 무대 1개(05:00은 02:30과 2.5시간 차이라 같은 무대). 같은 곡 00:00과 04:00 → 무대 2개. 다른 곡 같은 시각 → 무대 2개.
  - `refreshPerformance`: 조회수 5/37/16 → `best_read_cnt=37`, `clip_count=3`. 37짜리를 `gone`으로 바꾸고 재계산 → `best_read_cnt=16`, `clip_count=2`. 부른 사람 [따린]과 [구슬요,따린] → `performers=[따린,구슬요]`(순서 무관), `is_duet=true`.
- [ ] **Step 2:** `npx vitest run tests/catalog.test.ts` → FAIL
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** → PASS
- [ ] **Step 5: Commit** `feat: 곡 연결과 무대 묶기`

---

### Task 5: 수집 반영(ingest)

**Files:**
- Create: `src/server/ingest.ts`, `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `SoopClip`(Task 3), `parseTitle`(Task 2), `findOrCreateSong`/`guessArtist`/`assignPerformance`/`refreshPerformance`(Task 4)
- Produces:
  - `ingestClips(db: Db, clips: SoopClip[], now: Date): Promise<{ inserted: number; updated: number }>` — 새 클립: 분류 → (노래면) 곡 연결 → 무대 배정. 기존 클립: `read_cnt`, `thumb_url`, `views_updated_at`만 갱신(잠김 여부 무관); 잠기지 않았고 `gone`이었으면 다시 분류 상태로 복구. 영향받은 무대 `refreshPerformance`.
  - `markGone(db: Db, seenNos: Set<number>, range: { from: Date; to: Date }): Promise<number>` — `reg_date`가 범위 안인데 `seenNos`에 없는 클립을 `gone`으로(잠긴 클립도 상태만 `gone`, 나머지 필드 보존), 무대 재계산.

- [ ] **Step 1: 실패하는 테스트**
  - 새 클립 `따린 - Feel Good` → status `auto`, 곡 연결, 무대 배정, `inserted=1`.
  - 같은 클립을 조회수만 바꿔 다시 → `read_cnt` 갱신, `updated=1`, 곡·무대 그대로.
  - 관리자가 잠근 클립(`locked=true`, `song_id`=다른 곡, status `confirmed`)을 제목이 다른 응답으로 다시 → 조회수만 바뀌고 곡·상태·무대 그대로.
  - `not_song` 제목 → `song_id` null, `performance_id` null.
  - `markGone`: 범위 안 3개 중 1개 누락 → 그 1개 `gone`, 무대 `best_read_cnt` 재계산; 범위 밖 클립은 그대로.
- [ ] **Step 2:** `npx vitest run tests/ingest.test.ts` → FAIL
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** → PASS
- [ ] **Step 5: Commit** `feat: 수집 결과 반영(잠금 보존, 삭제 표시)`

---

### Task 6: 수집 작업, 실행 잠금, Cron

**Files:**
- Create: `src/server/sync.ts`, `src/app/api/cron/route.ts`, `vercel.json`, `scripts/backfill.ts`, `tests/sync.test.ts`

**Interfaces:**
- Consumes: `fetchClipPage`, `Throttle`, `kstDate` (Task 3), `ingestClips`, `markGone` (Task 5)
- Produces:
  - `type SyncDeps = { fetchPage: typeof fetchClipPage; now: () => Date; budget?: number }`
  - `runDaily(db: Db, deps: SyncDeps, kind: "daily" | "manual"): Promise<SyncResult>`
  - `runBackfillStep(db: Db, deps: SyncDeps): Promise<SyncResult & { done: boolean; progress: number }>` — 2023-01-01부터 오늘까지 3개월 창을 순서대로, 창 안의 쪽 단위로 진행 위치를 `sync_state['backfill']`에 저장.
  - `type SyncResult = { status: "ok" | "busy" | "error"; newClips: number; updatedViews: number; error?: string }`
  - 잠금: `sync_state['lock']`에 `{ until }`를 원자적으로 기록(조건부 upsert), 15분 지나면 만료로 간주. 잠금 실패 → `status: "busy"`, `sync_runs` 기록 안 함.
  - `GET /api/cron` — `Authorization: Bearer ${CRON_SECRET}` 아니면 401; 맞으면 `runDaily(getDb(), …, "daily")` 결과 JSON.
  - `vercel.json`: `{"crons":[{"path":"/api/cron","schedule":"0 19 * * *"}]}` (매일 04:00 KST).

`runDaily` 단계(스펙 7장): ① 최신순 쪽을 받아 `ingestClips`, 한 쪽 60개가 모두 이미 있던 클립이면 멈춤 ② 최근 90일을 기간 조회로 모두 받아 ingest + 그 범위 `markGone` ③ 오래된 기간(2023-01-01 ~ 90일 전)을 월 단위 창으로 나눠 `ceil(창 수 / 14)`개씩 `sync_state['rotation']` 위치부터 처리 + `markGone` ④ `sync_runs`에 결과. 요청 예산을 넘기면 남은 단계는 다음 실행으로(위치 저장). 어느 단계든 `SoopFormatError`/`SoopHttpError` → 그 시점까지 DB 반영분은 유지하되 해당 쪽은 반영 안 함, `status:"error"`, `sync_runs.error` 기록.

- [ ] **Step 1: 실패하는 테스트** (가짜 `fetchPage`로 기간·쪽별 응답 구성)
  - 첫 쪽에 새 클립 2개 + 기존 58개 → `newClips=2`, 두 번째 쪽 요청 안 함.
  - 잠금이 잡힌 상태에서 `runDaily` → `status:"busy"`, `sync_runs` 행 수 그대로.
  - 두 번째 쪽에서 `SoopFormatError` → `status:"error"`, 첫 쪽 반영분 유지, `sync_runs.error` 채워짐, 잠금 해제.
  - `budget=3`일 때 요청 3번 후 멈추고 `sync_state` 위치 저장 → 다음 실행이 이어서 진행.
  - 순환: 오래된 창 28개면 하루 2개씩, 15번째 실행이 다시 첫 창부터.
  - `runBackfillStep` 반복 호출 → 마지막에 `done:true`, 모든 가짜 클립 저장.
  - `/api/cron` 비밀값 없이 → 401.
- [ ] **Step 2:** `npx vitest run tests/sync.test.ts` → FAIL
- [ ] **Step 3:** 구현. `scripts/backfill.ts`: `getDb()`로 `runBackfillStep`을 `done`까지 반복, 진행률 출력.
- [ ] **Step 4:** → PASS
- [ ] **Step 5: Commit** `feat: 매일 수집·첫 수집·실행 잠금·Cron`

---

### Task 7: 공개 조회

**Files:**
- Create: `src/server/queries.ts`, `tests/queries.test.ts`

**Interfaces:**
- Consumes: 스키마, `norm`, `kstWeekStart`/`kstMonthStart`
- Produces:
  - `type PerfRow = { id: number; songTitle: string; songSlug: string; artist: string | null; artistSlug: string | null; startedAt: Date; isDuet: boolean; performers: string[]; clipCount: number; best: { titleNo: number; readCnt: number; thumbUrl: string; durationMs: number } }`
  - `searchPerformances(db, p: { q?: string; type?: "all" | "solo" | "duet"; sort?: "latest" | "views"; page?: number }): Promise<{ rows: PerfRow[]; total: number }>` — 20개씩. `q`는 `norm` 후 곡명·원곡 가수·부른 사람(정규화) 부분 일치. `clip_count > 0`인 무대만.
  - `performanceClips(db, performanceId): Promise<{ titleNo; readCnt; uploaderNick; regDate; thumbUrl; durationMs }[]>` — 공개 클립, 조회수순.
  - `topViews(db, period: "week" | "month" | "all", now: Date): Promise<PerfRow[]>` — 기간 안 `started_at` 무대를 `best_read_cnt`순 10개.
  - `topSongs(db): Promise<{ title; slug; artist; performances: number }[]>` — 무대 수순 10개.
  - `songPage(db, slug, sort: "latest" | "views")`, `artistPage(db, slug)` — 스펙 8장 내용. 가수 slug는 원곡 가수 이름 또는 함께 부른 사람 이름의 `slugify`; 두 역할 결과를 함께 돌려줌(`asOriginal`, `asPartner`). 없으면 `null`.

- [ ] **Step 1: 실패하는 테스트** (테스트 DB에 곡 3개·무대 5개·클립 12개 심기)
  - `q:"feel good"`과 `q:"FEELGOOD"` 결과 같음; `q:"윤미래"` → Memories 무대; `q:"구슬요"` → 듀엣 무대만.
  - `type:"solo"` → `isDuet=false`만; `sort:"views"` → `best.readCnt` 내림차순; `latest` → `startedAt` 내림차순.
  - `review`/`not_song`/`gone` 클립은 어떤 결과에도 안 나옴; 공개 클립이 모두 `gone`인 무대는 목록에서 빠짐.
  - `topViews("week")`는 이번 주 KST 월요일 이후 무대만; `topSongs` 순서는 무대 수.
  - `artistPage("구슬요")` → `asPartner`에 듀엣 곡, `asOriginal` 비어 있음.
- [ ] **Step 2:** `npx vitest run tests/queries.test.ts` → FAIL
- [ ] **Step 3:** 구현(Drizzle 쿼리; 정규화 비교는 `songs.title_norm`, `songs.artist_norm`, `performances.performers_norm`에 대한 부분 일치).
- [ ] **Step 4:** → PASS
- [ ] **Step 5: Commit** `feat: 공개 조회(검색·필터·정렬·순위·곡·가수)`

---

### Task 8: 공개 화면

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/song/[slug]/page.tsx`, `src/app/artist/[slug]/page.tsx`, `src/components/PlayerProvider.tsx`, `Player.tsx`, `PerformanceList.tsx`, `RankingPanel.tsx`, `SearchControls.tsx`, `tests/player.test.tsx`

**Interfaces:**
- Consumes: Task 7의 모든 조회 함수
- Produces:
  - `PlayerProvider` 컨텍스트: `play(titleNo: number, label: string)`, 현재 곡 상태
  - `embedUrl(titleNo: number): string`, `soopUrl(titleNo: number): string`

동작:
- 첫 화면은 서버 컴포넌트에서 `searchParams`(`q`, `type`, `sort`, `page`)를 읽어 `searchPerformances`, `topViews`, `topSongs` 호출. 검색·필터·정렬 변경은 주소를 바꿈(공유 가능).
- 플레이어: 헤더 안 고정 영역, `iframe src=embedUrl(titleNo)` (`allow="autoplay; fullscreen"`), 아래에 항상 "SOOP에서 보기" 링크. 첫 진입 시 목록 첫 무대의 대표 클립을 재생 대기(자동재생 안 함).
- 무대 줄: 곡명(곡 페이지 링크) · 원곡 가수(가수 페이지 링크) · 듀엣 배지 + "with 이름들"(각 이름 가수 페이지 링크) · 날짜 · 대표 조회수 · "클립 N개 ▾"(펼치면 `performanceClips`를 불러와 각 클립 재생 버튼).
- 순위: PC 오른쪽 열, 휴대폰(≤ 768px) 검색창 위 가로 스크롤. 조회수 TOP 10 탭 `이번 주 / 이번 달 / 전체`.
- 상태 화면: 검색 결과 없음, 불러오는 중(skeleton), 데이터 0개(첫 수집 전 안내).
- 디자인: Global Constraints의 색·글꼴, 16px 좌우 여백(휴대폰), 가로 스크롤 없음, 다크 모드(`prefers-color-scheme`).
- 곡·가수 페이지: `generateMetadata`로 제목 설정, 없는 slug는 `notFound()`.

- [ ] **Step 1: 실패하는 테스트** `tests/player.test.tsx`(Vitest + Testing Library, jsdom): `embedUrl(212858915)`가 Global Constraints 주소; `play()` 호출 후 iframe `src`가 바뀌고 "SOOP에서 보기" 링크가 같은 클립을 가리킴.
- [ ] **Step 2:** `npx vitest run tests/player.test.tsx` → FAIL
- [ ] **Step 3:** 화면 구현.
- [ ] **Step 4:** → PASS. `npm run build` 성공.
- [ ] **Step 5: 실제 데이터로 화면 확인.** 로컬 Neon 브랜치(또는 로컬 Postgres) + `scripts/backfill.ts`로 최근 몇 달치만 넣고 `npm run dev` → 휴대폰 폭(390px)과 PC 폭(1280px) 스크린샷을 찍어 사용자에게 보여주고 디자인 피드백 반영.
- [ ] **Step 6: Commit** `feat: 공개 화면(첫 화면·곡·가수 페이지, 플레이어)`

---

### Task 9: 관리자 인증

**Files:**
- Create: `src/server/auth.ts`, `src/app/admin/login/page.tsx`, `src/middleware.ts`, `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `checkPassword(input: string): boolean` — `ADMIN_PASSWORD`와 상수 시간 비교
  - `signSession(now: Date): string` / `verifySession(token: string | undefined, now: Date): boolean` — HMAC-SHA256(`SESSION_SECRET`), 7일 만료
  - `canAttempt(db, now): Promise<boolean>` — 최근 15분 실패 5회 이상이면 false; `recordAttempt(db, ok, now)`
  - `middleware`: `/admin`(로그인 페이지 제외) 요청에 쿠키 `admin_session` 검증, 실패 시 `/admin/login`으로

- [ ] **Step 1: 실패하는 테스트**: 맞는/틀린 비밀번호; 서명 토큰 검증 성공, 변조 토큰 실패, 8일 지난 토큰 실패; 15분 안 실패 5회 → `canAttempt=false`, 16분 뒤 → true.
- [ ] **Step 2:** `npx vitest run tests/auth.test.ts` → FAIL
- [ ] **Step 3:** 구현. 로그인 폼은 server action: `canAttempt` → `checkPassword` → `recordAttempt` → 쿠키(`httpOnly`, `secure`, `sameSite=lax`).
- [ ] **Step 4:** → PASS
- [ ] **Step 5: Commit** `feat: 관리자 비밀번호 로그인`

---

### Task 10: 관리자 화면과 기능

**Files:**
- Create: `src/server/admin.ts`, `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/components/AdminTable.tsx`, `tests/admin.test.ts`

**Interfaces:**
- Consumes: `findOrCreateSong`, `assignPerformance`, `refreshPerformance`(Task 4), `runDaily`/`runBackfillStep`(Task 6), `verifySession`(Task 9)
- Produces (모두 `locked=true` 설정):
  - `editClip(db, titleNo, v: { songTitle: string; artist: string | null; performers: string[] }): Promise<void>` — 곡 다시 연결, `is_duet` 재계산, status `confirmed`, 무대 재배정, 이전·새 무대 재계산
  - `setStatus(db, titleNos: number[], status: "confirmed" | "not_song"): Promise<void>`
  - `sameSongCandidates(db, titleNo): Promise<number[]>` / `applyArtistToSameSong(db, titleNo, artist): Promise<number>`
  - `mergeSongs(db, keepId, dropId): Promise<void>` — 클립·무대를 keep으로 옮기고 drop 삭제, 겹치는 무대는 3시간 규칙으로 합침
  - `mergePerformances(db, keepId, dropId)`, `splitPerformance(db, performanceId, titleNos: number[]): Promise<number>` (새 무대 id)
  - `adminCounts(db)`: 확인 필요 / 원곡 가수 없음 / 공개 중 / 노래 아님 개수, `adminList(db, tab, q, page)`
  - 서버 액션: 위 함수 + `syncNow()`(`runDaily(…,"manual")`, busy면 안내) + `backfillStep()`. 모든 액션은 시작 시 `verifySession` 확인.

화면(스펙 9장): 상단 상태줄(마지막 `sync_runs`, 최근 실패, 첫 수집 진행률, **지금 가져오기**), 탭과 숫자, 표에서 바로 수정(곡명·원곡 가수·부른 사람, 미리보기 재생), 체크박스 일괄 승인/노래 아님, 원곡 가수 수정 후 "같은 곡 N개에도 적용?" 안내, 곡 합치기·무대 합치기/나누기 대화상자.

- [ ] **Step 1: 실패하는 테스트**
  - `editClip`으로 곡을 바꾸면 클립 `locked`, `confirmed`, 새 곡의 무대로 이동, 이전 무대 `clip_count` 감소.
  - 수정 후 `ingestClips`(같은 클립, 다른 제목) → 수정값 유지(Review Focus 2의 교차 확인).
  - `applyArtistToSameSong` → 같은 정규화 곡명 클립 5개 모두 가수 반영, 반환값 5.
  - `mergeSongs` → drop 곡 없어지고 클립 수 합쳐짐, 3시간 안 무대는 하나로.
  - `splitPerformance`로 2개 분리 → 새 무대 `clip_count=2`, 원래 무대 감소, 둘 다 `locked`.
  - 세션 없이 서버 액션 호출 → 거부(에러), DB 변화 없음.
- [ ] **Step 2:** `npx vitest run tests/admin.test.ts` → FAIL
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** → PASS. 전체 `npm test` 통과, `npm run build` 성공.
- [ ] **Step 5: Commit** `feat: 관리자 화면(수정·일괄·합치기·지금 가져오기)`

---

### Task 11: 배포와 첫 수집 (사용자와 함께)

배포는 외부에 공개되는 작업이라 단계마다 사용자 확인을 받는다.

- [ ] **Step 1:** 사용자가 Vercel 계정으로 GitHub 저장소(비공개)를 연결하거나 `vercel` CLI로 프로젝트 생성. Vercel 마켓플레이스에서 Neon Postgres 추가 → `DATABASE_URL` 자동 등록. `ADMIN_PASSWORD`, `SESSION_SECRET`(32바이트 랜덤), `CRON_SECRET`(랜덤) 등록. 이 시점에 무료 플랜 조건(Cron 하루 1회, 함수 최대 실행 시간, DB 용량) 재확인.
- [ ] **Step 2:** `npx drizzle-kit migrate`로 운영 DB에 스키마 적용.
- [ ] **Step 3:** 로컬에서 `DATABASE_URL`(운영)로 `npx tsx scripts/backfill.ts` 실행 → `done` 확인, 클립 수 ≈ SOOP 기간별 합계(약 25,000)인지 확인.
- [ ] **Step 4:** 배포 후 확인: 첫 화면·검색·필터·정렬·순위·곡/가수 페이지·재생(사이트 안), `/admin` 로그인·지금 가져오기, `/api/cron`이 비밀값 없이 401. 다음 날 `sync_runs`에 `daily` 기록 확인.
- [ ] **Step 5:** 관리자 화면 `확인 필요` 개수를 사용자에게 보고. 많으면 Task 2 규칙 보강 여부 논의.
- [ ] **Step 6: Commit** (배포 설정 변경분이 있으면) `chore: 배포 설정`
