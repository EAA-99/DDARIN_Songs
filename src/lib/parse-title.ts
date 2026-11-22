import { norm } from "./normalize";

export type Parsed = {
  status: "auto" | "review" | "not_song";
  songTitle: string | null;
  originalArtist: string | null;
  performers: string[];
  /** 원곡 가수가 제목에 확실하게 적혔는가("곡명 (가수)", "가수 - 곡명" 등). "따린 ○○ - 곡명"의 ○○ 짐작은 false */
  artistSure: boolean;
};

const ME = "따린";
const NOT_SONG_WORDS = ["반응", "저스트댄스", "풀트", "더빙", "원본"]; // 원본: 원곡을 튼 클립
const MEMO_WORDS = ["짧", "짧음", "더블링", "풀", "풀버전", "full", "live", "라이브", "cut", "컷"];
const NOT_SONG: Parsed = { status: "not_song", songTitle: null, originalArtist: null, performers: [], artistSure: false };

// 곡명 끝 잡음: "ㄷㄷ", "ㅋㅋㅋ", "많관부", 날짜 "260319", "LIVE"
const TAIL_NOISE = /\s*(?:ㄷ+|ㅋ+|ㅎ+|많관부|\d{6}|live|라이브)\s*$/i;

function cleanSong(s: string): string {
  let t = s.trim();
  for (let prev = ""; prev !== t;) { prev = t; t = t.replace(TAIL_NOISE, "").trim(); }
  return t;
}

/** 정리한 곡명이 숫자 1~2자리뿐인가("따린 놀리기 -1"). 이런 곡명은 자동 공개하지 않는다 */
export function isNumberTitle(song: string): boolean {
  return /^\d{1,2}$/.test(song.trim());
}

const COVER = /\b(cover)\b|커버/gi;
// 이름 구분자: 한글 사이 x/X/×, 또는 & , × 등
const NAME_SPLIT = /(?<=[가-힣])\s*[xX×]\s*(?=[가-힣])|\s*[&,×+]\s*|\s+[xX]\s+/;

// "(Acapella ver)", "(Live ver.)", "(여자 버전)" 같은 버전 표기
const VERSION_NOTE = /\b(ver|version)\b\.?|버전|버젼|acapella|아카펠라|\bmr\b|\binst\b/i;

function isMemo(inner: string): boolean {
  const t = inner.trim().toLowerCase();
  return MEMO_WORDS.includes(t) || VERSION_NOTE.test(t);
}

function stripDecorations(raw: string): string {
  let s = raw.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\(([^)]*)\)/g, (m, inner: string) => (isMemo(inner) ? " " : m));
  s = s.replace(/_?\d{2}\.\d{2}\.\d{2}\s*$/, "");          // 끝의 날짜 꼬리 "_26.11.06"
  s = s.replace(/\s*\d절(\s*매너)?\s*$/, "");               // "1절 매너"
  s = s.trim().replace(/^[^\p{L}\p{N}]+/u, "");             // 앞의 이모지·기호
  return s.replace(/\s+/g, " ").trim();
}

/** 대괄호 태그 안 부른 사람 목록: "[모캡 노래/냐냐x구슬요x따린]" → [냐냐, 구슬요, 따린].
 *  따린이 있거나 "노래/이름"처럼 사람을 밝힌 태그만 인정한다. */
function bracketPeople(raw: string): string[] {
  for (const m of raw.matchAll(/\[([^\]]*)\]/g)) {
    const parts = m[1].split(/[\/:]/);
    const names = parsePeople(parts.pop() ?? "");
    if (!names.length || names.some((n) => /\s/.test(n))) continue;
    if (names.includes(ME) || parts.length > 0) return names;
  }
  return [];
}

/** 곡명-사람 구분 하이픈 위치. "D-9"처럼 영숫자 사이 하이픈은 건너뛴다. */
function separatorIndex(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth = Math.max(0, depth - 1);
    if (depth > 0 || !"-–—".includes(s[i])) continue;
    const a = s[i - 1] ?? "", b = s[i + 1] ?? "";
    if (/[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b)) continue;
    return i;
  }
  return -1;
}

function cleanArtist(a: string): string {
  return a.replace(/\s*\((feat|ft)\.[^)]*\)/gi, "").replace(/\s*\/?\s*(feat|ft)\..*$/i, "").trim();
}

function parsePeople(side: string): string[] {
  return side.replace(COVER, " ").split(NAME_SPLIT)
    .map((n) => n.trim().replace(/님$/, "").trim())
    .filter(Boolean);
}

const FILLERS = ["노래방", "노래", "커버", "cover"];

/** 사람 쪽 읽기. "따린 구슬요 냐냐"처럼 띄어쓰기로만 나눈 이름은 아는 이름(따린·partners)일 때만 확실하다. */
function readPeople(side: string, partners?: ReadonlySet<string>): { names: string[]; sure: boolean } {
  const names: string[] = [];
  let sure = true;
  for (const piece of parsePeople(side)) {
    if (!/\s/.test(piece)) { names.push(piece); continue; }
    for (const raw of piece.split(/\s+/)) {
      const t = raw.replace(/님$/, "").replace(new RegExp(`^${ME}의$`), ME);
      if (!t || FILLERS.includes(t.toLowerCase())) continue;
      if (t !== ME && !partners?.has(t)) sure = false;
      names.push(t);
    }
  }
  return { names: [...new Set(names)], sure };
}

function isPeopleSide(side: string): boolean {
  COVER.lastIndex = 0;
  return side.includes(ME) || COVER.test(side);
}

/** "곡명(가수)" → 곡명·가수. "(w. 이름)"은 가수가 아니라 함께 부른 사람. */
function splitSongArtist(raw: string): { song: string; artist: string | null; with: string[] } {
  const side = cleanSong(raw);
  const m = side.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { song: side, artist: null, with: [] };
  const inner = m[2].trim();
  const w = inner.match(/^(?:w\.|with)\s*(.+)$/i);
  if (w) return { song: m[1].trim(), artist: null, with: parsePeople(w[1]) };
  return { song: cleanSong(m[1]), artist: cleanArtist(inner) || null, with: [] };
}

/** 곡명 쪽 "곡명 - 가수"("Fallin - Alicia keys")를 나눈다. 없으면 null */
function songDashArtist(side: string): { song: string; artist: string } | null {
  const at = separatorIndex(side);
  if (at < 0) return null;
  const song = cleanSong(side.slice(0, at)), artist = cleanArtist(side.slice(at + 1));
  return song && artist ? { song, artist } : null;
}

/** "곡명 / 설명"의 설명을 뗀다. "K/DA"처럼 붙은 슬래시는 곡명의 일부로 둔다. */
function cutNote(songSide: string): string {
  return songSide.split(/\s+\/|\/\s+/)[0].trim();
}

/** 가수 뒤 꼬리를 뗀다: "Bruno Mars | 빵터진 따린이", "Tones And I to 빙밍" */
function cutArtistTail(a: string): string {
  return cleanArtist(a.split(/\s+\|/)[0].replace(/\s+-?\s*to\s+.*$/i, ""));
}

// "설명 따린"의 설명으로 볼 단서: 숫자·닫는 괄호, 행사 이름, 동사·관형형 끝("듣는다", "볼려고 딴")
const DESC_CUE = /\d|\)|노래자랑|콘서트|결승전|본선|무대|앵콜|(는|은|다|딴|든|던|한|난)$/;

/**
 * 사람 쪽이 사실상 따린님 혼자인 형식. 곡명 쪽과 따로 원곡 가수를 밝히기도 한다.
 *  - "따린 거미", "따린의 김건모" → 원곡 가수
 *  - "나만 듣는다 따린", "소나랜드 노래자랑 따린" → 앞은 설명
 */
function soloPhrase(side: string, partners?: ReadonlySet<string>): { artist: string | null } | null {
  if (NAME_SPLIT.test(side)) return null;
  const tokens = side.replace(COVER, " ").split(/\s+/).filter((t) => t && !FILLERS.includes(t.toLowerCase()));
  if (tokens.length < 2) return null;
  const isMe = (t: string) => new RegExp(`^${ME}(님)?$`).test(t);
  if (/^따린(님|의)?$/.test(tokens[0])) {
    // 뒤에 이름이 둘 이상이면 함께 부른 사람일 수 있다
    const rest = tokens.slice(1);
    if (rest.length !== 1 || isMe(rest[0]) || partners?.has(rest[0].replace(/님$/, ""))) return null;
    return { artist: rest[0] };
  }
  if (isMe(tokens[tokens.length - 1])) {
    const desc = tokens.slice(0, -1);
    if (desc.some((t) => partners?.has(t.replace(/님$/, "")))) return null;
    if (desc.some((t) => DESC_CUE.test(t))) return { artist: null };
  }
  return null;
}

// "멋진헛간 짧게 불러주는 따린": 부르는 모습을 설명하는 꼬리
const SINGING_TAIL = /^(.+?)\s+(?:(?:짧게|살짝|잠깐|같이|다시)\s+)?(?:불러주는|불러준|부르는|부른|열창하는)\s+따린(?:님)?$/;

const SONG_PART_MAX = 40;

// 방송 행사·콘텐츠 클립에 쓰이는 말: "7스테이지 믿음 - 선수 머독, 오더 민결희 2회차", "집밥니선생 -수미편- 심사위원 참가!"
const EVENT_WORDS = /회차|참가|심사위원|스테이지|운동회|선수/;

/**
 * 방송 정보로 자동 공개하기 전 확인: 대사 인용(:)·물음표가 없고, "/ 설명" 앞의 곡명 부분이 너무 길지 않은가.
 * "비밀 얘기 - … / 머독 : …" 같은 잡담 클립이 "가수 - 곡명"처럼 보이는 것을 거른다.
 */
export function looksLikeSongTitle(raw: string): boolean {
  if (/[:：?？]/.test(raw)) return false;
  if (EVENT_WORDS.test(raw)) return false;
  const s = stripDecorations(raw);
  const at = separatorIndex(s);
  if (at < 0) return false;
  const song = s.slice(at + 1).split("/")[0].replace(/\([^)]*\)/g, "").trim(); // 괄호 메모(feat. 등)는 빼고 잰다
  return song.length > 0 && song.length <= SONG_PART_MAX;
}

/**
 * 합방 신호: 제목이 다른 사람이 따린님 없이 노래했다고 말하는가(다른 이름만 적힌 대괄호·Cover, 함께 부른 사람만 적힌 제목).
 * 따린님이 함께 부른 듀엣은 신호가 아니다. 같은 다시보기에 이런 클립이 있으면 그 방송은 합방으로 본다(스펙 6장 7).
 */
export function collabSignal(raw: string, partners?: ReadonlySet<string>): boolean {
  if (NOT_SONG_WORDS.some((w) => raw.includes(w))) return false;
  const p = parseTitle(raw, partners);
  const tagged = bracketPeople(raw);
  if (tagged.length && !tagged.includes(ME)) return true;
  if (p.status !== "not_song") return false;
  const s = stripDecorations(raw);
  const at = separatorIndex(s);
  if (at < 0) return false;
  const left = s.slice(0, at).trim();
  const right = s.slice(at + 1).trim();
  if (isPeopleSide(right) && !right.includes(ME)) return parsePeople(right).length > 0;
  const leftNames = parsePeople(left);
  return !!partners && leftNames.length > 0 && leftNames.every((n) => partners.has(n));
}

/** 클립 제목에서 곡명·원곡 가수·부른 사람을 뽑고 노래 여부를 판단한다(스펙 6장).
 *  partners: 따린님과 함께 부른 적 있는 사람들. 이들만 적힌 "이름 - 곡명"은 다른 사람의 무대로 본다. */
export function parseTitle(raw: string, partners?: ReadonlySet<string>, knownSongs?: ReadonlySet<string>): Parsed {
  if (NOT_SONG_WORDS.some((w) => raw.includes(w))) return NOT_SONG;
  const tagged = bracketPeople(raw);
  if (tagged.length && !tagged.includes(ME)) return NOT_SONG;
  const s = stripDecorations(raw);
  const at = separatorIndex(s);
  if (at < 0) return NOT_SONG;
  const left = s.slice(0, at).trim();
  const right = s.slice(at + 1).trim();
  if (!left || !right) return NOT_SONG;

  // "따린 / 곡명 - 가수". 띄어쓰지 않은 "따린/미르"는 함께 부른 사람이다
  const slashed = left.match(new RegExp(`^${ME}(?:님)?\\s+/\\s+(.+)$`));
  if (slashed) {
    const { song, artist } = splitSongArtist(slashed[1]);
    const a = cutArtistTail(right) || artist;
    if (song) return { status: "auto", songTitle: song, originalArtist: a, performers: [ME], artistSure: a !== null };
  }
  // "(무엇) - 곡명 짧게 불러주는 따린": 왼쪽은 프로그램 이름 등이라 버린다. 이미 아는 곡이면 공개
  const tail = left.includes(ME) ? null : right.match(SINGING_TAIL);
  if (tail) {
    const song = splitSongArtist(tail[1]).song;
    const known = knownSongs?.has(norm(song));
    if (!song) return NOT_SONG;
    return { status: known ? "auto" : "review", songTitle: song, originalArtist: null, performers: [ME], artistSure: false };
  }

  let songSide: string;
  let peopleSide: string;
  if (isPeopleSide(right) && !left.includes(ME)) {
    songSide = left; peopleSide = right;
  } else if (left.includes(ME)) {
    songSide = right; peopleSide = left;
  } else {
    // "가수 - 곡명": 대괄호에 부른 사람이 적혀 있으면 그대로, 아니면 누가 불렀는지 모름 → 확인 필요
    const { song } = splitSongArtist(right);
    if (!song) return NOT_SONG;
    const leftNames = parsePeople(left);
    if (partners && leftNames.length && leftNames.every((n) => partners.has(n))) return NOT_SONG;
    // 왼쪽이 원곡 가수. 오른쪽 괄호는 곡명의 다른 표기("Fiction (픽션)")로 본다.
    const a = cleanArtist(left) || null;
    return tagged.length
      ? { status: "auto", songTitle: song, originalArtist: a, performers: tagged, artistSure: a !== null }
      : { status: "review", songTitle: song, originalArtist: a, performers: [], artistSure: a !== null };
  }

  songSide = cutNote(songSide);
  const dashed = songDashArtist(songSide);
  const { song, artist, with: partnersInTitle } = dashed ? { ...dashed, with: [] } : splitSongArtist(songSide);
  if (!song) return NOT_SONG;
  // "곡 - Daisy 듣는 따린"처럼 뒤쪽 설명은 노래가 아닐 수 있어 앞쪽 사람만 본다
  const alone = peopleSide === left ? soloPhrase(peopleSide, partners) : null;
  if (alone && song && !song.includes(ME)) {
    // 사람 쪽에서 밝힌 가수가 있으면 곡명 괄호는 다른 표기("소로 (小路)")로 본다
    // "따린 ○○"의 ○○는 짐작이라 확실하지 않다. 곡명 쪽에 적힌 가수만 확실
    return alone.artist
      ? { status: "auto", songTitle: song, originalArtist: alone.artist, performers: [ME], artistSure: false }
      : { status: "auto", songTitle: song, originalArtist: artist, performers: [ME], artistSure: artist !== null };
  }
  const people = readPeople(peopleSide, partners);
  const performers = [...new Set([...people.names, ...partnersInTitle])];
  if (!performers.includes(ME)) return NOT_SONG;
  const artistSure = artist !== null;
  if (song.includes(ME) || !people.sure) return { status: "review", songTitle: song, originalArtist: artist, performers, artistSure };
  return { status: "auto", songTitle: song, originalArtist: artist, performers, artistSure };
}
