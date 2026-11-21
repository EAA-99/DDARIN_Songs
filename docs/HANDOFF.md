# 인수인계: 따린 노래 클립 사이트 (ttarin-songs)

> 받는 쪽: `C:\Users\user\일정표\pwa`(ddarin-sechule.vercel.app)에서 작업 중인 Claude Code 세션.
> 목적: 이 사이트를 그 프로젝트에 붙인다. 사용자와 아직 정하지 않은 결정은 맨 아래 "정해야 할 것"에 있다. 거기 적힌 것은 사용자에게 먼저 물어볼 것.

## 사용자 작업 규칙 (지금까지 지켜 온 것)

- 답변·진행 메모는 한국어로 쓴다. 시니어 개발자·디자이너 관점에서 판단한다.
- 되돌리기 어렵거나 밖으로 나가는 작업(배포, 푸시, 삭제, 외부 서비스 설정)은 먼저 물어본다. 배포는 사용자와 함께 한다.
- `C:\Users\user\Downloads`의 따린 일정표 csv 파일은 건드리지 않는다.
- 사용자가 "보류"라고 한 기능은 "진행해"라고 할 때까지 손대지 않는다(아래 "보류 중").

## 한눈에

- **무엇:** SOOP 스트리머 따린(insome0319) 방송에서 시청자들이 딴 노래 클립을 곡별로 모아, 검색하고 사이트 안에서 바로 재생하는 비공식 팬 사이트.
- **어디:** `C:\Users\user\ttarin-songs`, git 브랜치 `feat/site`(최근 커밋 `f758b01`), 원격 저장소 없음, 아직 배포 안 함.
- **스택:**
  - Next.js 16.4.6 App Router(`cacheComponents`, Turbopack), React 19.3, TypeScript 5, Tailwind 4 + 직접 쓴 CSS(`src/app/globals.css`)
  - Drizzle ORM 0.45. DB는 Postgres: 실제 사이트는 Neon(`@neondatabase/serverless`), 로컬·테스트는 PGlite
  - zod 4, Vitest 5(테스트 164개 통과), Playwright(Python, 스크린샷 확인용)
- **일정표 PWA와의 차이:** 이쪽은 서버(DB, 크론, 관리자 로그인)가 필요하다. 그래서 순수 HTML 프로젝트에 코드를 합칠 수 없고, **별도 Vercel 프로젝트로 배포한 뒤 연결**해야 한다.

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 소개 영역(프로필, 검색창, "곡 N · 클립 N"), 목록(필터 전체/솔로/듀엣, 정렬 최신순/조회수순, 이미지·목록 보기 전환, 20개씩 페이지), 오른쪽 인기 순위 카드(이번 주/이번 달/전체 조회수 TOP 10, 같은 곡은 한 번만 + "많이 부른 곡") |
| `/song/[slug]` | 곡 제목, "원곡 가수 · 클립 N개", 최신순/조회수순, 이 곡을 부른 날짜별 목록 |
| `/artist/[name]` | 따린님이 부른 그 가수의 곡, 그 사람과 함께 부른 노래 |
| `/admin`, `/admin/login` | 관리자(비밀번호). 탭: 확인 필요 / 원곡 가수 없음 / 공개 중 / 노래 아님 |
| `/api/cron` | 매일 갱신. `vercel.json` 크론 `0 19 * * *`(한국 시간 04시), `CRON_SECRET`로 보호 |

**공통 요소**
- 상단 바: 프로필 + "따린 노래 클립", "SOOP 방송국 ↗" 버튼.
- 플레이어: 클립을 누르면 상단 바 아래에 붙는다.
  - 스크롤해도 따라오고, 페이지를 옮겨도 계속 재생된다. 클립을 눌러도 화면 스크롤은 움직이지 않는다(사용자 요청).
  - SOOP 임베드 iframe(`https://vod.sooplive.com/player/{titleNo}/embed`)을 쓴다. 바에는 곡 이름, "SOOP에서 보기 ↗", ✕ 닫기가 있다.

**목록 보기 두 가지**
- 보기 선택은 `<html data-view="list">`와 `localStorage["view"]`에 저장된다. `layout.tsx` 머리의 인라인 스크립트가 새로고침 때 먼저 되살린다.
- 이미지 보기(기본): 휴대폰은 썸네일 + 글자 가로 줄, 600px 이상은 썸네일 카드 격자.
- 목록 보기(플레이리스트): 이미지 없이 한 줄씩 나열한다.
  - 왼쪽에 순번이 나온다. CSS counter를 쓰고, 2페이지는 21번부터 이어진다.
  - 마우스를 올리면 ▶, 재생 중이면 ♪로 바뀐다.

**"클립 N개 ▾"**
- 같은 순간을 여러 시청자가 딴 클립을 펼쳐서 클립별로 재생한다.

**용어**
- 내부 데이터: 곡(song) ⊃ 무대(performance, 따린님이 한 번 부른 것) ⊃ 클립(clip).
- 시청자 화면에는 **곡 수와 클립 수만** 보이고, "무대"라는 말은 쓰지 않는다(사용자 결정). 단, 순위의 "많이 부른 곡" 탭은 부른 횟수를 "N번"으로 보여 준다.

## 디자인

- 토큰은 `globals.css` 맨 위 `:root`에 있다. 대표색 `--brand: #2f6bff`(파랑), 글자 `--ink: #0b0d12`, `--radius: 16px`, 옅은 파란 그림자.
- 다크 모드는 `prefers-color-scheme`로 자동 전환된다.
- 글꼴은 Pretendard(jsdelivr CSS)이고, `word-break: keep-all`.
- 버튼은 알약 모양 칩(`.chip`), 세그먼트 컨트롤(`.sort`, `.view-toggle`)이다.
- 휴대폰부터 대응한다. 600px 이상에서 카드 격자, 넓은 화면에서 순위 카드가 오른쪽 열로 간다.
- **일정표와 디자인을 맞추려면 `--brand` 등 토큰만 바꾸면 된다.**

## 데이터와 자동 갱신

**DB 테이블** (`src/db/schema.ts`, 마이그레이션 `src/db/migrations/0000~0002`)
- `songs`, `performances`, `clips`, `sync_runs`, `sync_state`, `login_attempts`

**SOOP에서 받는 것** (`src/lib/soop.ts`)
- 클립 목록: `https://api-channel.sooplive.com/v1.3/channel/insome0319/vod/clip`
- 클립 상세: `https://api.m.sooplive.com/station/video/a/view` (POST)
  - 어느 방송(`copyright_id`)의 어느 다시보기(`original_vod`) 몇 초 지점(`clip_seek_time`)에서 땄는지를 준다.
- 둘 다 비공식 API다. 응답 형식이 바뀌면 zod 검사에서 막히고 갱신이 멈춘다.

**매일 갱신** (`src/server/sync.ts` `runDaily`)
- ① 새 클립을 받는다.
- ② 최근 90일 클립의 조회수를 갱신하고, SOOP에서 지워진 클립은 숨긴다.
- ③ 오래된 기간을 날마다 조금씩 다시 확인한다.
- 요청 예산이 있고 속도를 제한한다. 응답이 이상하거나 한꺼번에 많이 사라지면 멈춘다.

**제목 분석** (`src/lib/parse-title.ts`)
- 클립을 `auto`(공개) / `review`(확인 필요) / `not_song` 셋으로 나눈다.
- 같은 다시보기 + 같은 곡 클립을 한 무대로 묶는다(600초 안, 다시보기 정보가 없으면 등록 3시간 안).
- 합방 흔적이 없는 따린님 방송의 "가수 - 곡명" 제목은 공개한다(`looksLikeSongTitle`). 행사 단어(회차·참가·심사위원·스테이지·운동회·선수)가 있으면 제외한다.

**관리자** (`src/server/admin.ts`, `src/app/admin/actions.ts`)
- 곡·가수·부른 사람을 고친다. 고친 클립은 잠겨서 자동 갱신이 바꾸지 않는다.
- 여러 개를 한 번에 공개하거나 노래 아님으로 돌린다. 같은 곡에 가수를 일괄 적용한다.
- 곡 합치기, 무대 합치기·나누기, 지금 갱신, 처음 전체 모으기(2023-01-01부터 3개월씩 이어받기)를 할 수 있다.

**캐시**
- 공개 화면 데이터는 `"use cache"` + `cacheTag(CATALOG_TAG)`로 캐시한다. 갱신이나 관리자가 고치면 무효화된다.

## 실행·검증

```bash
cd C:\Users\user\ttarin-songs
npm test                  # vitest 164개
npx tsc --noEmit
npx eslint src            # src는 깨끗함. tests/의 lint 오류 2건(player.test.tsx, schema.test.ts)은 원래 있던 것
DATABASE_URL=pglite:.data/dev2 ADMIN_PASSWORD=preview1234 SESSION_SECRET=local-preview-secret-0123456789abcdef npx next dev -p 3456
```

**알아 둘 문제**
- 개발 서버(Turbopack)가 CSS 수정을 반영하지 않을 때가 있다. 3456 포트 node를 종료하고 `.next/dev`를 지운 뒤 다시 켠다.
  - PowerShell: `Get-NetTCPConnection -LocalPort 3456 -State Listen` → `Stop-Process`
- PGlite는 한 프로세스만 DB를 열 수 있다. 서버가 켜져 있을 때 스크립트로 DB를 만지려면 서버를 끄거나 `.data/dev2` 사본을 쓴다(사본은 `postmaster.pid`를 지울 것).
- 개발 서버와 전체 테스트를 동시에 돌리면 PGlite 테스트 작업자가 메모리 부족으로 죽을 수 있다. 그 파일만 다시 돌리면 통과한다.
- 로컬 데이터(`.data/dev2`)는 최근 90일 + 일부 기간만 있다. 실제 사이트는 배포할 때 처음부터 다시 모은다.

## 일정표 PWA에 붙이는 방법

**1. 같은 주소 아래 붙이기** (`ddarin-sechule.vercel.app/songs`)
- 이 사이트를 별도 Vercel 프로젝트로 배포한다.
- 일정표의 `vercel.json`에 다음 rewrite를 추가한다:
  `{ "source": "/songs/:path*", "destination": "https://<노래사이트>.vercel.app/songs/:path*" }`
- 이 사이트에서 바꿀 것:
  - `next.config.ts`에 `basePath: "/songs"`를 추가한다. `next/link`·`redirect`는 basePath를 자동으로 붙이지만, 바꾼 뒤 링크와 리다이렉트를 확인할 것.
  - `vercel.json` 크론 경로는 basePath를 붙여 `/songs/api/cron`으로 바꾼다.
  - 관리자 세션 쿠키 경로가 `path: "/admin"`으로 고정돼 있다(`src/app/admin/login/actions.ts`). `/songs/admin`으로 바꿔야 로그인이 유지된다.
  - 같은 도메인을 쓰게 되므로 `localStorage["view"]` 키가 일정표와 겹칠 수 있다. `ttarin-songs:view` 같은 이름으로 바꾸는 것이 안전하다(`src/components/ViewToggle.tsx`).
- 일정표에서 확인할 것:
  - 서비스 워커(`sw.js`)가 `/songs/*` 요청을 가로채거나 캐시하지 않는지 확인한다. 가로챈다면 fetch 핸들러에서 `/songs`를 제외한다.
  - 메뉴에 "노래 클립" 링크를 단다.

**2. 링크만 달기**
- 이 사이트는 따로 `<이름>.vercel.app` 주소로 배포하고, 일정표에는 링크만 추가한다.
- 위의 코드 변경이 필요 없다.

**두 방법 모두 필요한 배포 단계** (사용자와 함께)
1. Vercel 프로젝트를 만들고 Neon DB를 연결한다.
2. 환경변수 `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`를 설정한다.
3. `npm run db:migrate`를 실행한다.
4. 로컬에서 실제 DB를 대상으로 `scripts/backfill.ts`를 돌려 처음 전체 데이터를 모은다.
5. 사이트가 잘 뜨는지 확인한다.

## 정해야 할 것 (사용자에게 물어볼 것)

1. 붙이는 방식: 1번(같은 주소 `/songs`) 또는 2번(링크만).
2. 일정표와 디자인(색 등)을 맞출지.
3. 이 사이트의 코드는 그대로 `C:\Users\user\ttarin-songs`에서 관리할지, 일정표 쪽으로 옮길지. 추천은 그대로 두는 것: 테스트·git 이력이 여기 있다.

## 보류 중 (사용자가 "진행해"라고 하기 전까지 구현하지 말 것)

- **작은 플레이어:** 스크롤하면 플레이어가 오른쪽 아래 작은 창으로 줄어든다.
- **자동 다음 곡:** 클립이 끝나면 지금 보던 목록 순서대로 다음 곡을 재생한다(검색·필터·정렬 유지, 페이지를 넘어감). "⏭ 다음 곡" 버튼과 자동 재생 토글(기본 켜짐)을 둔다.
  - 구현 근거(실제 Chrome에서 확인함):
    - 임베드 주소에 `?fromApi=1`을 붙이고 iframe에 `allow="autoplay"`를 준다.
    - 플레이어가 `postMessage`로 `{cmd:"PonReady"}`, `{cmd:"PupdateMediaEvent", event:{type:"end"}}` 등을 보낸다.
    - 부모가 `{cmd:"Pload", id, autoPlay:true}`를 보내 재생한다.
    - 다음 클립으로 바꿀 때는 iframe을 새로 만들고 PonReady 뒤에 Pload를 보낸다.
    - iOS Safari는 확인하지 않았다.
- **상단 바 정리:** 상단 바를 없애고 "SOOP 방송국" 버튼을 다른 곳(첫 화면 소개 영역, 바닥글 등)으로 옮긴다. 플레이어가 상단 바 안에 있어서 작은 플레이어와 같이 하는 것이 좋다.
- **하지 않기로 한 것:** 방송 날짜 기준 기간 필터는 사용자가 넣지 않기로 했다.
