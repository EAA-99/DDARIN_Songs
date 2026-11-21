# 일정표 앱에 노래 클립 사이트 넣기 — 작업 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노래 클립 사이트를 배포하고, 일정표 PWA의 Playlist 자리에 iframe으로 넣어 다른 화면에서도 아래 바로 계속 재생되게 한다.

**Architecture:** 노래 사이트는 별도 GitHub 저장소(`DDARIN_Songs`, 공개) + 별도 Vercel 프로젝트(Neon DB)로 배포한다. 일정표에는 iframe 하나를 두고 화면에 따라 "꽉 채움 / 아래 바 / 숨김"으로 모양만 바꾼다. 둘은 postMessage(`ttarin-player`, `ttarin-dock`)로 신호를 주고받는다.

**Tech Stack:** Next.js 16 + Neon Postgres + Vercel(노래 사이트), 순수 HTML/JS/CSS PWA(일정표)

**Spec:** `docs/superpowers/specs/2026-11-21-schedule-app-embed-design.md`

## Global Constraints

- 노래 사이트 코드는 바꾸지 않는다(배포만). 위치는 `C:\Users\user\ttarin-songs` 그대로.
- 기존 Playlist 화면 코드(`openSongbook`, `songbookView`)는 지우지 않는다. 버튼 연결만 바꾼다.
- 일정표 `app.js`·`style.css`는 CRLF+BOM이다. Edit 툴로만 고친다(sed·PowerShell Set-Content 금지).
- 일정표 버전: `CACHE_NAME` `ddarin-calendar-v637` → `v638`, `?v=637` → `?v=638`(index.html·service-worker.js 모두).
- 일정표 업로드는 GitHub `EAA-99/DDARIN_Sechule` 저장소 **루트**에 파일만 올린다(`pwa/` 폴더째 X).
- `.env*` 파일과 비밀 값은 커밋하지 않는다. 바깥으로 나가는 작업(푸시, 배포)은 사용자와 함께 한다.

## Review Focus

- 재생 중에 다른 화면으로 갔다가 돌아왔을 때 노래가 끊기지 않고 목록 위치가 그대로여야 한다 → Task 5 확인 항목.
- 휴대폰 달력 화면의 아래 메뉴바(`.side-nav`, fixed bottom)와 바가 겹치면 안 된다 → Task 5 확인 항목.
- 노래 사이트가 아닌 출처의 postMessage(예: SOOP 플레이어, 유튜브 iframe)가 바를 띄우면 안 된다 → Task 5에서 origin 검사.
- 재생을 멈추거나(✕) 끝나면 다른 화면에서 바가 사라져야 한다(`active:false`) → Task 5 확인 항목.
- 아이폰 사파리에서 iframe 안 SOOP 재생이 되는지 → Task 6 확인 항목(안 되면 사용자에게 보고, 따로 해결하지 않음).

---

### Task 1: GitHub 저장소에 올리기

**Files:** 없음(설정 작업)

- [ ] **Step 1: 배포 빌드가 되는지 확인** — `cd C:\Users\user\ttarin-songs && npm run build` → 오류 없이 끝나야 함. DB 없이 빌드가 실패하면 원인을 보고하고 멈춘다.
- [ ] **Step 2: 사용자가 github.com에서 `DDARIN_Songs` 공개 저장소를 만든다** — README·.gitignore 추가 없이 빈 저장소로.
- [ ] **Step 3: 올라갈 파일 확인** — `git ls-files | grep -i env` → `.env`가 없어야 함(`.env.example`도 무시 대상이라 안 나옴).
- [ ] **Step 4: 원격 추가 + 푸시** — `git remote add origin https://github.com/EAA-99/DDARIN_Songs.git`, `git push -u origin feat/site:main`. 기본 브랜치를 `main`으로 둔다.

### Task 2: Vercel + Neon 배포

**Files:** 없음(설정 작업)

- [ ] **Step 1: 비밀 값 만들기** — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`를 두 번 실행해 `SESSION_SECRET`, `CRON_SECRET`로 쓴다. 사용자에게만 보여 주고 파일에 저장하지 않는다.
- [ ] **Step 2: 사용자가 Vercel에서 New Project → `DDARIN_Songs` 가져오기**
- [ ] **Step 3: Storage → Neon 연결** → `DATABASE_URL`이 자동으로 들어갔는지 Settings → Environment Variables에서 확인.
- [ ] **Step 4: 환경변수 추가** — `ADMIN_PASSWORD`(사용자가 정함), `SESSION_SECRET`, `CRON_SECRET`.
- [ ] **Step 5: 배포** → 배포 주소(`https://<이름>.vercel.app`)를 받아 둔다. 이후 이 값을 `TTARIN_SONGS_URL`이라 부른다. 이 단계에서는 DB가 비어 있어 목록이 비어 보여도 정상.

### Task 3: DB 테이블 + 첫 전체 수집

**Files:** `C:\Users\user\ttarin-songs\.env.production.local`(임시, git 무시 대상, 끝나면 삭제)

- [ ] **Step 1:** 사용자가 Vercel의 `DATABASE_URL` 값을 위 파일에 `DATABASE_URL=...`로 넣는다.
- [ ] **Step 2: 테이블 만들기** — 그 값을 환경변수로 주고 `npm run db:migrate` → 마이그레이션 0000~0002 적용 메시지.
- [ ] **Step 3: 첫 수집** — `npx tsx scripts/backfill.ts`(백그라운드) → 마지막 줄 `첫 수집 완료`. `상태 error`로 끝나면 오류를 보고하고 멈춘다.
- [ ] **Step 4: 확인** — `TTARIN_SONGS_URL`을 열어 곡 목록이 보이고 클립이 재생되는지. `/admin`에 로그인되는지.
- [ ] **Step 5:** `.env.production.local` 삭제.

### Task 4: 일정표에 노래 화면 추가 + Playlist 버튼 연결

**Files:**
- Modify: `C:\Users\user\일정표\pwa\index.html` (soopChatView 다음에 새 화면)
- Modify: `C:\Users\user\일정표\pwa\app.js` (`showMainView` 1767~, 버튼 연결 2051, `wireNavMenu` 2071·2081~)
- Modify: `C:\Users\user\일정표\pwa\style.css`

**Interfaces:**
- Produces: `const TTARIN_SONGS_URL = "<Task 2 주소>"`, `const ttarinSongsFrame`(iframe 요소), `function openTtarinSongs()`, 화면 이름 `"ttarinsongs"`

- [ ] **Step 1: 화면 마크업** — `<div id="ttarinSongsView" class="back-menu-view ttarin-songs-view hidden">`. 머리말은 soopChatView의 `.back-menu-top` + `#ttarinSongsNavMenu` 구조를 그대로 쓰고 id 앞부분만 `ttarinSongs`로. 그 아래 `<div id="ttarinSongsSlot" class="ttarin-songs-slot"></div>`(iframe이 꽉 채울 자리).
- [ ] **Step 2: iframe은 화면들 바깥(body 끝)에 하나** — `<iframe id="ttarinSongsFrame" class="ttarin-songs-frame hidden" title="따린 노래 클립" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`. `src`는 비워 둔다.
- [ ] **Step 3: `openTtarinSongs()`** — 처음 부를 때만 `ttarinSongsFrame.src = TTARIN_SONGS_URL`, 그다음 `showMainView("ttarinsongs")`.
- [ ] **Step 4: `showMainView`에 `"ttarinsongs"` 추가** — `ttarinSongsView` 토글, `sideNavEl`·`backToCalendarBtn` 숨김 목록에 추가(다른 back-menu 화면과 같게).
- [ ] **Step 5: 버튼 연결 바꾸기** — `homePlaylistBtn`과 `wireNavMenu` 안의 `${prefix}PlaylistBtn`이 `openSongbook` 대신 `openTtarinSongs`를 부른다. `wireNavMenu("ttarinSongsNav", "ttarinSongsHamburgerBtn", "ttarinSongsNavMenu")` 추가.
- [ ] **Step 6: 노래 화면에서 iframe 위치** — 노래 화면일 때 iframe을 `#ttarinSongsSlot` 위에 `position: fixed`로 겹쳐 꽉 채운다(slot의 `getBoundingClientRect()` 기준, `resize` 때 다시 맞춤). iframe을 DOM에서 옮기면 새로 불러오므로 **절대 옮기지 않는다**.
- [ ] **Step 7: 확인** — `cd C:\Users\user\일정표\pwa && python -m http.server 8765` 후 `http://localhost:8765` → 홈 Playlist, 햄버거 메뉴 Playlist 모두 노래 사이트가 열리고, 노래 사이트 로고 줄이 숨겨져 있어야 함(in-app). 다른 메뉴는 원래대로.

### Task 5: 다른 화면에서 아래 바로 계속 재생

**Files:** `app.js`, `style.css`

**Interfaces:**
- Consumes: `TTARIN_SONGS_URL`, `ttarinSongsFrame`, `showMainView`
- 신호: 받기 `{type:"ttarin-player", active:boolean}`, 보내기 `{type:"ttarin-dock", on:boolean}`

- [ ] **Step 1: 신호 받기** — `message` 리스너. `e.origin !== new URL(TTARIN_SONGS_URL).origin`이면 무시. `ttarin-player`면 `ttarinPlaying = e.data.active` 저장 후 `layoutTtarinFrame()`.
- [ ] **Step 2: `layoutTtarinFrame()`** — 세 상태 중 하나로 iframe 클래스를 바꾼다:
  - `currentMainView === "ttarinsongs"` → 꽉 채움(Task 4 Step 6), `ttarin-dock` `on:false` 보냄
  - 아니고 `ttarinPlaying` → `.ttarin-songs-frame--bar`, `ttarin-dock` `on:true` 보냄
  - 아니면 → `hidden`(src는 유지)
  - 보낼 때 `ttarinSongsFrame.contentWindow.postMessage(msg, new URL(TTARIN_SONGS_URL).origin)`. 같은 값을 연달아 보내지 않는다.
- [ ] **Step 3:** `showMainView` 끝에서 `layoutTtarinFrame()` 호출.
- [ ] **Step 4: 바 CSS** — `.ttarin-songs-frame--bar { position: fixed; left: 0; right: 0; bottom: 0; height: 64px; width: 100%; border: 0; z-index: 60; }`. 휴대폰에서 `.side-nav`가 보이는 화면이면 `bottom`을 메뉴바 높이만큼 올린다(`sideNavEl.offsetHeight`를 JS에서 `--ttarin-bar-bottom`로 넣음). 바가 떠 있을 때 `body.ttarin-bar-open { padding-bottom: calc(64px + var(--ttarin-bar-bottom, 0px)); }`.
- [ ] **Step 5: 확인(PC·휴대폰 크기 둘 다)**
  - 클립 재생 → 달력으로: 아래 바가 뜨고 소리가 계속 남. 휴대폰 크기에서 메뉴바 위에 붙음
  - 바의 이전/재생/다음 동작
  - Playlist로 돌아오면 꽉 찬 화면 + 보던 목록 위치
  - ✕로 플레이어 닫고 다른 화면 → 바 없음
  - 유튜브 화면 등 다른 iframe이 있는 화면에서도 바가 엉뚱하게 바뀌지 않음

### Task 6: 버전 올리기 + 최종 확인 + 업로드 안내

**Files:** `service-worker.js`, `index.html`

- [ ] **Step 1:** `CACHE_NAME` → `ddarin-calendar-v638`, `ASSETS`와 `index.html`의 `?v=637` → `?v=638`.
- [ ] **Step 2: 최종 확인** — Task 5 확인 항목을 한 번 더 + 아이폰 사파리(사용자 기기)에서 재생되는지.
- [ ] **Step 3:** 사용자에게 업로드할 파일 목록 안내: `index.html`, `app.js`, `style.css`, `service-worker.js` → `EAA-99/DDARIN_Sechule` 루트.
