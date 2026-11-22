# 자동 공개 전 곡 확인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잡담 클립이 노래로 자동 공개되지 않게 Deezer로 곡 존재를 확인하고, 사이트 footer에 관리자 링크를 단다.

**Architecture:** `parse-title`이 `artistSure`와 숫자 곡명 정보를 더 준다. `verify.ts`가 "가수 확실 / 아는 곡 / Deezer 정확 일치" 중 하나로 자동 공개를 허락하고 결과를 `title_checks`에 캐시한다. `ingestClips`는 선택 인자 `lookup`이 있을 때만 검사한다(테스트·기존 호출 호환). 운영 sync deps는 항상 넣는다.

**Tech Stack:** Next.js 16, drizzle-orm + Neon/PGlite, vitest

**Spec:** `docs/superpowers/specs/2026-11-22-clip-verification-design.md`

## Global Constraints

- Deezer: `https://api.deezer.com/search/track?q=<곡명>&limit=25`, 제한 시간 10초, 동시 2·간격 300ms(`Throttle`)
- 가수 고르기: 같은 곡명 결과의 가수별 rank 합, 1위 ≥ 2위×2 또는 가수 하나일 때만
- 못 찾은 결과는 30일 뒤 다시 조회. 오류 결과는 저장하지 않음
- 숫자 곡명 = 정리 후 `^\d{1,2}$`
- 잠긴(`locked`) 클립은 절대 바꾸지 않음
- 기존 곡 이름은 바꾸지 않음

## Review Focus

- Deezer가 200이지만 `{error:{...}}`를 주는 경우 → 오류로 취급(`unverified`), 캐시 안 함 (Task 2 시험)
- 다시 검사 중 클립이 `review`로 내려가 무대 클립 수가 0이 되면 순위·목록에서 빠져야 함 (Task 4 시험)
- 같은 실행 안에서 같은 곡명 클립 여러 개 → Deezer 한 번만 (Task 3 시험)
- "Live 원본"은 Live 떼기보다 원본 판정이 먼저 (Task 1 시험)
- 곡명 정리 후 빈 문자열이면 노래 아님 (Task 1 시험: "따린 - ㄷㄷ")

---

### Task 1: 제목 읽기 보강

**Files:** Modify `src/lib/parse-title.ts` · Test `tests/parse-title.test.ts`

**Interfaces:** Produces `Parsed.artistSure: boolean`, `export function isNumberTitle(song: string): boolean`

- [ ] 실패하는 시험 추가:
  - `"따린 놀리기 -1"` → `songTitle "1"`, `artistSure false`, `isNumberTitle("1") === true`
  - `"따린 - 취한 줄을 모르고 LIVE"`, `"따린 - 취한 줄을 모르고 (Live)"` → `songTitle "취한 줄을 모르고"`
  - `"따린&마냥 - Nobody Knows 원본"`, `"따린 - Golden Live 원본"` → `not_song`
  - `"따린 - Fallin - Alicia keys"` → song `Fallin`, artist `Alicia keys`, `artistSure true`, `auto`
  - `"[클립]따린 - 빅마마 체념 중간부분 지림 ㄷㄷ"` → song이 `ㄷㄷ`로 끝나지 않음
  - `"[클립]따린 - 취한줄을 모르고 많관부"` → `"취한줄을 모르고"`; `"[클립] 따린 - 녹턴 (이은미) 260319"` → song `녹턴`, artist `이은미`
  - `"따린 - ㄷㄷ"` → `not_song`
  - `"따린 - 귀로 (나얼)"` → `artistSure true`; `"따린 - Feel Good"` → `artistSure false`; `"[모캡 노래/따린] 빅마마 - 체념"` → `artistSure true`
- [ ] `npx vitest run tests/parse-title.test.ts` → 새 시험 FAIL
- [ ] 구현: `원본` 포함 → NOT_SONG(맨 앞). `cleanSong(song)`: 끝의 `ㄷ+|ㅋ+|ㅎ+|많관부|\d{6}|live|라이브` 반복 제거(대소문자 무시). `splitSongArtist` 전 곡명 쪽에 `" - "`가 있으면 앞=곡, 뒤=가수(sure). 모든 반환에 `artistSure` 설정. 정리 후 빈 곡명은 NOT_SONG.
- [ ] 전체 시험 `npx vitest run` → PASS (기존 시험이 바뀌어야 하면 스펙 근거로만)
- [ ] 커밋 `feat: 제목 읽기 보강(Live·원본·곡명-가수·잡음·artistSure)`

### Task 2: Deezer 조회

**Files:** Create `src/lib/deezer.ts` · Test `tests/deezer.test.ts`

**Interfaces:** Produces
```ts
export type SongLookup = (title: string) => Promise<{ found: boolean; artist: string | null }>;
export class DeezerError extends Error {}
export function searchDeezer(f?: typeof fetch): SongLookup;
export function pickArtist(hits: { artist: string; rank: number }[]): string | null;
```

- [ ] 시험: 정확 일치만 인정("Golden" vs "New Golden Age" → found false), 괄호 무시("Golden (Live)" 일치), `pickArtist` 2배 규칙(Hozier 1.53M vs 609k → Hozier, 100000×3 서로 다름 → null, 하나뿐 → 그 가수), HTTP 500·`{error}`·JSON 아님 → `DeezerError`
- [ ] FAIL 확인 → 구현 → PASS
- [ ] 커밋 `feat: Deezer 곡 조회`

### Task 3: 검사 저장 + 새 클립 판정

**Files:** Modify `src/db/schema.ts`, Create migration (`npm run db:generate`), Create `src/server/verify.ts`, Modify `src/server/ingest.ts` · Test `tests/verify.test.ts`, `tests/ingest.test.ts`

**Interfaces:**
- schema: `titleChecks` 표(`titleNorm` PK, `found`, `artist`, `checkedAt`), `clips.unverified boolean default false not null`
- `export async function lookupCached(db: Db, title: string, lookup: SongLookup, now: Date): Promise<{ found: boolean; artist: string | null } | "error">`
- `export async function decide(db: Db, p: Parsed, known: ReadonlySet<string>, lookup: SongLookup, now: Date): Promise<{ status: Parsed["status"]; artist: string | null; unverified: boolean }>`
- `ingestClips(db, list, now, partners?, fetchDetail?, lookup?: SongLookup)` — `lookup` 없으면 지금과 같음

- [ ] 시험(verify): 캐시 재사용(lookup 1번), found=false 30일 지나면 다시, 오류는 저장 안 함 + `"error"`; decide: artistSure → auto(lookup 안 부름), 아는 곡 → auto, 숫자 곡명 → review, Deezer found → auto + artist, 못 찾음 → review, 오류 → review + unverified
- [ ] 시험(ingest, lookup 넣음): `"[클립]머독 하이드로펌프-따린"`(lookup found false) → review, 무대 클립 수 0; `"사미인곡 - 따린"`(found, "Seo Moon Tak") → auto, 곡 가수 "Seo Moon Tak"; 같은 곡명 두 클립 → lookup 1번
- [ ] FAIL → 구현(`decide`는 `p.status==="auto"`일 때만 검사) → PASS
- [ ] 커밋 `feat: 자동 공개 전 곡 확인`

### Task 4: 재검사(매일 unverified + 관리자 다시 검사 버튼)

**Files:** Modify `src/server/verify.ts`, `src/server/sync.ts`, `src/app/admin/actions.ts`, `src/components/AdminTools.tsx`, `src/app/admin/page.tsx` · Test `tests/verify.test.ts`, `tests/sync.test.ts`

**Interfaces:**
- `export async function recheckClips(db: Db, which: "unverified" | "auto", lookup: SongLookup, now: Date): Promise<{ checked: number; demoted: number; promoted: number; notSong: number }>`
- `SyncDeps.lookupSong?: SongLookup`; `runDaily` 끝에서 `recheckClips(db,"unverified",…)`
- `recheckAutoAction()` (requireAdmin, `done()`으로 캐시 비움)

- [ ] 시험: auto 잡담 → review & 무대 clipCount 0; locked auto 잡담 → 그대로; "원본" auto → not_song; unverified + 이번엔 found → auto, unverified false
- [ ] FAIL → 구현 → PASS. 관리자 버튼 "자동 공개 다시 검사", 결과 "N개 확인 필요로 이동 · M개 노래 아님"
- [ ] 커밋 `feat: 자동 공개 다시 검사`

### Task 5: footer 관리자 링크

**Files:** Modify `src/app/layout.tsx`, `src/app/globals.css`

- [ ] footer에 `<a className="footer__admin" href="/admin" target="_blank" rel="noopener">관리자</a>`
- [ ] `npm run lint && npx tsc --noEmit && npm run build` PASS
- [ ] 커밋 `feat: footer 관리자 링크`

### Task 6: 실제 데이터 측정 → 배포 → 운영 다시 검사

- [ ] scratchpad 측정: 클립 10,000개를 새 parseTitle + Deezer로 분류, 전후 숫자와 내려가는 auto 목록 확인. "-따린" 잡담과 "따린 놀리기 -1, -2"가 review여야 함
- [ ] 운영 DB 마이그레이션(`npm run db:migrate`, DATABASE_URL은 환경변수로만, 파일에 쓰지 않음)
- [ ] `git push origin feat/site:main` → Vercel 배포 확인
- [ ] 운영 DB에 `recheckClips(db,"auto",searchDeezer(),now)` 1회 실행(스크립트, 환경변수로) → 결과 숫자 보고, 캐시 비우기 위해 사이트 확인(필요하면 관리자 "지금 가져오기")
- [ ] 사이트 전체 순위에서 "1", "2"가 빠졌는지 확인
