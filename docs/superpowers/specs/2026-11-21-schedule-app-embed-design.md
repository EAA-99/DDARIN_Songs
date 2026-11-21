# 설계: 일정표 PWA의 Playlist 자리에 노래 클립 사이트 넣기

날짜: 2026-11-21 · 상태: 승인됨

## 목표

일정표 앱(ddarin-sechule.vercel.app, `C:\Users\user\일정표\pwa`) 안에서 노래 클립을 재생하고, 다른 화면으로 옮겨도 화면 아래 바에서 계속 듣게 한다.

## 정한 것

- 붙이는 방식: iframe으로 앱 안에 넣는다 (HANDOFF의 1번 `/songs` 방식, 2번 링크 방식은 하지 않음).
- 위치: 일정표의 **Playlist** 버튼을 대체한다. 홈 버튼(`homePlaylistBtn`)과 햄버거 메뉴의 `*NavPlaylistBtn` 전부.
  - 기존 Playlist 화면(`openSongbook`, `songbookView`)의 코드는 지우지 않는다. 버튼 연결만 바꾼다(되돌릴 수 있게).
- 색: 노래 사이트의 파란 테마를 그대로 둔다.
- 노래 사이트는 별도 GitHub 저장소 + 별도 Vercel 프로젝트(Neon DB)로 배포한다. 코드는 `C:\Users\user\ttarin-songs`에 그대로 둔다.

## 구성

### 일정표 쪽

- 새 화면 `ttarinSongsView` (`showMainView("ttarinsongs")`)
  - 다른 화면과 같은 머리말(햄버거 메뉴) + 그 아래를 iframe이 채운다.
- iframe 하나를 화면들 바깥에 두고 계속 살려 둔다. 모양만 바꾼다.
  - `src`는 Playlist를 처음 열 때 넣는다 (앱 시작을 느리게 하지 않음).
  - `allow="autoplay; fullscreen; encrypted-media"` (안쪽 SOOP 플레이어 자동 재생에 필요).

| 상황 | iframe |
|---|---|
| `ttarinsongs` 화면 | 머리말 아래를 꽉 채움 |
| 다른 화면 + 재생 중 | 화면 아래 고정 바(약 64px). 아래 메뉴바(`.side-nav`, 휴대폰)가 보이면 그 위 |
| 다른 화면 + 재생 안 함 | 숨김 (불러온 상태는 유지 → 돌아오면 보던 위치) |

- 바가 떠 있을 때는 내용이 가려지지 않게 그 높이만큼 아래 여백을 준다.

### 신호 (postMessage)

- 노래 사이트 → 일정표: `{ type: "ttarin-player", active: boolean }` (이미 구현됨, `Player.tsx`)
- 일정표 → 노래 사이트: `{ type: "ttarin-dock", on: boolean }` (받는 쪽 이미 구현됨)
  - 노래 화면을 떠날 때 `on: true`, 돌아올 때 `on: false`.
- 일정표는 `event.origin`이 노래 사이트 주소일 때만 받는다. 보낼 때도 그 주소를 대상으로 한다.

### 서비스 워커

- `service-worker.js`는 다른 출처 요청을 이미 그대로 통과시킨다(`url.origin !== location.origin`). 바꿀 것 없음.
- pwa 파일을 바꾸므로 `CACHE_NAME`과 `?v=` 버전을 637 → 638로 올린다.

## 바꾸는 파일

- 일정표 pwa: `index.html`, `app.js`, `style.css`, `service-worker.js` (CRLF+BOM 파일은 Edit 툴로만 수정)
- 노래 사이트: 코드 변경 없음. 배포만.

## 순서

1. 노래 사이트 작업 커밋 (완료: `7bfc4a6`)
2. GitHub 저장소 만들고 푸시
3. Vercel 프로젝트 + Neon DB, 환경변수 `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`
4. `npm run db:migrate`, `scripts/backfill.ts`로 처음 전체 수집
5. 배포 주소로 일정표 연결 코드 작업
6. 확인 후 일정표 업로드(GitHub `EAA-99/DDARIN_Sechule` 루트)

## 확인

- 노래 사이트: `npm test` 통과
- 일정표(PC·휴대폰):
  - Playlist → 재생 → 달력으로 가면 아래 바가 뜨고 계속 재생되는지
  - 바의 이전/재생/다음이 동작하는지
  - Playlist로 돌아오면 보던 위치 그대로인지
  - 재생 안 할 때 다른 화면에 바가 안 보이는지
  - 아이폰 사파리에서 재생되는지 (iframe 안 자동 재생이 막힐 수 있음)

## 하지 않는 것

- 아래 바를 눌러 노래 화면으로 돌아가기 (Playlist 버튼으로 돌아감)
- 노래책에 원래 있는 플레이어와 동시 재생 막기
