export type Parsed = {
  status: "auto" | "review" | "not_song";
  songTitle: string | null;
  originalArtist: string | null;
  performers: string[];
};

const ME = "따린";
const NOT_SONG_WORDS = ["반응", "저스트댄스", "풀트", "더빙"];
const MEMO_WORDS = ["짧", "짧음", "더블링", "풀", "풀버전", "full", "live", "라이브", "cut", "컷"];
const NOT_SONG: Parsed = { status: "not_song", songTitle: null, originalArtist: null, performers: [] };

const COVER = /\b(cover)\b|커버/gi;
// 이름 구분자: 한글 사이 x/X/×, 또는 & , × 등
const NAME_SPLIT = /(?<=[가-힣])\s*[xX×]\s*(?=[가-힣])|\s*[&,×+]\s*|\s+[xX]\s+/;

function stripDecorations(raw: string): string {
  let s = raw.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\(([^)]*)\)/g, (m, inner: string) =>
    MEMO_WORDS.includes(inner.trim().toLowerCase()) ? " " : m);
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
function splitSongArtist(side: string): { song: string; artist: string | null; with: string[] } {
  const m = side.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { song: side.trim(), artist: null, with: [] };
  const inner = m[2].trim();
  const w = inner.match(/^(?:w\.|with)\s*(.+)$/i);
  if (w) return { song: m[1].trim(), artist: null, with: parsePeople(w[1]) };
  return { song: m[1].trim(), artist: cleanArtist(inner) || null, with: [] };
}

/** 클립 제목에서 곡명·원곡 가수·부른 사람을 뽑고 노래 여부를 판단한다(스펙 6장).
 *  partners: 따린님과 함께 부른 적 있는 사람들. 이들만 적힌 "이름 - 곡명"은 다른 사람의 무대로 본다. */
export function parseTitle(raw: string, partners?: ReadonlySet<string>): Parsed {
  if (NOT_SONG_WORDS.some((w) => raw.includes(w))) return NOT_SONG;
  const tagged = bracketPeople(raw);
  if (tagged.length && !tagged.includes(ME)) return NOT_SONG;
  const s = stripDecorations(raw);
  const at = separatorIndex(s);
  if (at < 0) return NOT_SONG;
  const left = s.slice(0, at).trim();
  const right = s.slice(at + 1).trim();
  if (!left || !right) return NOT_SONG;

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
    return tagged.length
      ? { status: "auto", songTitle: song, originalArtist: cleanArtist(left), performers: tagged }
      : { status: "review", songTitle: song, originalArtist: cleanArtist(left), performers: [] };
  }

  const { song, artist, with: partnersInTitle } = splitSongArtist(songSide);
  const people = readPeople(peopleSide, partners);
  const performers = [...new Set([...people.names, ...partnersInTitle])];
  if (!performers.includes(ME)) return NOT_SONG;
  if (!song) return NOT_SONG;
  if (song.includes(ME) || !people.sure) return { status: "review", songTitle: song, originalArtist: artist, performers };
  return { status: "auto", songTitle: song, originalArtist: artist, performers };
}
