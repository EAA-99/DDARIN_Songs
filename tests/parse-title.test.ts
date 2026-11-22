import { expect, test } from "vitest";
import { isNumberTitle, parseTitle, type Parsed as FullParsed } from "@/lib/parse-title";

// 기존 기대값은 artistSure 없이 비교한다(toMatchObject)
type Parsed = Omit<FullParsed, "artistSure">;

const cases: [string, Parsed][] = [
  ["따린 - Feel Good", { status: "auto", songTitle: "Feel Good", originalArtist: null, performers: ["따린"] }],
  ["따린 - Snowman (짧) [로이세끼2]", { status: "auto", songTitle: "Snowman", originalArtist: null, performers: ["따린"] }],
  ["[클립][따린]따린-Highlight", { status: "auto", songTitle: "Highlight", originalArtist: null, performers: ["따린"] }],
  ["따린 - HighLight [더블링]", { status: "auto", songTitle: "HighLight", originalArtist: null, performers: ["따린"] }],
  ["[클립]허니 - 따린 Cover", { status: "auto", songTitle: "허니", originalArtist: null, performers: ["따린"] }],
  ["[클립]붉은노을 - 구슬요x따린x냐냐 Cover", { status: "auto", songTitle: "붉은노을", originalArtist: null, performers: ["구슬요", "따린", "냐냐"] }],
  ["[클립]8282 - 구슬요x따린 Cover", { status: "auto", songTitle: "8282", originalArtist: null, performers: ["구슬요", "따린"] }],
  ["[클립][로이세끼 특별공연] 따린 -Memories(윤미래)", { status: "auto", songTitle: "Memories", originalArtist: "윤미래", performers: ["따린"] }],
  ["[클립]memories - 따린님", { status: "auto", songTitle: "memories", originalArtist: null, performers: ["따린"] }],
  ["[로이세끼2] 윤미래 - Memories", { status: "review", songTitle: "Memories", originalArtist: "윤미래", performers: [] }],
  ["[클립]안동역에서 - 구슬요 Cover", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[따린 반응] 키마 - 운다(리누)", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["Coldplay - Viva La Vida [구슬요&따린 풀트 저스트댄스 2026]", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[클립]따린 더빙", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[클립]사탕 따는 팁", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[클립]따린", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[클립]로이세끼 시즌2 농사가 하고싶다ㅣ듀엣곡 발매 D-9", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[모캡 노래/냐냐x구슬요x따린] 빅뱅 - 붉은노을 [댄스 연출]", { status: "auto", songTitle: "붉은노을", originalArtist: "빅뱅", performers: ["냐냐", "구슬요", "따린"] }],
  ["[모캡 노래/냐냐x구슬요x따린] 배치기(Feat.에일리) - 눈물샤워 [댄스 연출]", { status: "auto", songTitle: "눈물샤워", originalArtist: "배치기", performers: ["냐냐", "구슬요", "따린"] }],
  ["빅뱅 - 붉은노을 [개모임 모캡 노래뱅]", { status: "review", songTitle: "붉은노을", originalArtist: "빅뱅", performers: [] }],
];

test.each(cases)("%s", (raw, expected) => {
  expect(parseTitle(raw)).toMatchObject(expected);
});

test("bracket naming only someone else is not a song of 따린", () => {
  expect(parseTitle("[모캡 노래/냐냐] 서주경 - 당동한 여자").status).toBe("not_song");
});

test("known partners alone on the people side are not 따린's song", () => {
  const partners = new Set(["구슬요", "냐냐"]);
  expect(parseTitle("[클립]구슬요 - 안동역에서", partners).status).toBe("not_song");
  expect(parseTitle("[클립]구슬요, 냐냐 - 이태원 프리덤 [개모임 모캡합방]", partners).status).toBe("not_song");
  expect(parseTitle("성시경 - 태양계", partners).status).toBe("review");
});

test.each([
  ["따린 - Endless Love (w. 듀엣삼촌)", { status: "auto", songTitle: "Endless Love", originalArtist: null, performers: ["따린", "듀엣삼촌"] }],
  ["[클립]머독님은 저렇게 웃지않아요 ㅋㅋㅋ (REBELS - 결희, 따린, 단즈)", { status: "not_song", songTitle: null, originalArtist: null, performers: [] }],
  ["[모캡 노래/냐냐x구슬요x따린] 비스트 - Fiction (픽션) [댄스 연출]", { status: "auto", songTitle: "Fiction", originalArtist: "비스트", performers: ["냐냐", "구슬요", "따린"] }],
  ["[개모임 모캡 노래방] 따린 & 구슬요 & 냐냐 - 눈물샤워 (배치기/feat. 에일리)", { status: "auto", songTitle: "눈물샤워", originalArtist: "배치기", performers: ["따린", "구슬요", "냐냐"] }],
  ["🐶 [개모임 모캡합방] 따린,구슬요,냐냐 - 미스터 (카라) 1절 매너_26.11.06", { status: "auto", songTitle: "미스터", originalArtist: "카라", performers: ["따린", "구슬요", "냐냐"] }],
  ["[모캡 노래/따린] 다다다(OP) - 마음의 날개", { status: "auto", songTitle: "마음의 날개", originalArtist: "다다다(OP)", performers: ["따린"] }],
] as [string, Parsed][])("edge: %s", (raw, expected) => {
  expect(parseTitle(raw)).toMatchObject(expected);
});

test("names separated only by spaces", () => {
  const partners = new Set(["구슬요", "냐냐"]);
  expect(parseTitle("[클립][따린]따린 구슬요 냐냐-붉은 노을", partners))
    .toMatchObject({ status: "auto", songTitle: "붉은 노을", originalArtist: null, performers: ["따린", "구슬요", "냐냐"] });
  expect(parseTitle("[클립]구슬요 따린 - 지것대", partners).status).toBe("auto");
  // 모르는 이름이 섞이면 확인 필요
  expect(parseTitle("[클립][따린]따린 구슬요 냐냐-붉은 노을").status).toBe("review");
});

test("filler words after 따린 are ignored", () => {
  expect(parseTitle("따린 노래방 - Lucky (Jason Mraz)"))
    .toMatchObject({ status: "auto", songTitle: "Lucky", originalArtist: "Jason Mraz", performers: ["따린"] });
  // 따린 뒤 이름 하나는 원곡 가수로 본다(실제 제목 측정, 2026-11-19)
  expect(parseTitle("[클립]따린의 김건모 - 서울의 달").status).toBe("auto");
});

test("date tail is removed before reading the artist", () => {
  expect(parseTitle("🐶 [개모임 모캡합방] 따린 - 안동역에서 (진성)_26.11.06"))
    .toMatchObject({ status: "auto", songTitle: "안동역에서", originalArtist: "진성", performers: ["따린"] });
});

test.each([
  ["따린 - Nobody Knows (Acapella ver)", "Nobody Knows"],
  ["따린 - 숲 (Live ver.)", "숲"],
  ["따린 - Lucky (여자 버전)", "Lucky"],
])("version notes in parentheses are not the artist: %s", (raw, song) => {
  expect(parseTitle(raw)).toMatchObject({ status: "auto", songTitle: song, originalArtist: null });
});

// ── 합방 신호: 제목이 따린님 아닌 사람이 노래했다고 말하는가 ─────────────
import { collabSignal } from "@/lib/parse-title";

test.each([
  ["[클립]구슬요 - 안동역에서", true],
  ["[클립]냐냐 - 산책", true],
  ["[클립]안동역에서 - 구슬요 Cover", true],
  // 따린님이 함께 부른 듀엣은 "다른 사람이 따린님 없이 불렀다"는 신호가 아니다
  ["[클립]8282 - 구슬요x따린 Cover", false],
  ["따린&듀엣삼촌 - Say Something [재활 노래뱅]", false],
  ["[클립]신난 따린 She's gone - GD", false],
  ["[모캡 노래/냐냐] 서주경 - 당동한 여자", true],
  ["Bruno Mars - Grenade", false],
  ["따린 - Feel Good", false],
  ["[로이세끼2] 성시경 - 태양계", false],
  ["[클립]사탕 따는 팁", false],
])("collab signal: %s → %s", (raw, expected) => {
  expect(collabSignal(raw, new Set(["구슬요", "냐냐"]))).toBe(expected);
});

// ── 방송 정보로 자동 공개할 만큼 노래 제목처럼 보이는가 ──────────────────
import { looksLikeSongTitle } from "@/lib/parse-title";

test.each([
  ["Imagine Dragons - Believer (짧)", true],
  ["Matt Giraud - Part time lover / 바이브 지리는 노래 추천", true],
  ["[듀엣삼촌] Charlie Puth - We Don't Talk Anymore (feat.Selena Gomez)", true],
  ["[로이세끼2] 성시경 - 태양계", true],
  ["[클립][레드윙즈 Big walk] 비밀 얘기 - 사실 머독을 좋아했던 민결희 / 머독 : 호구 조사 좀 하겠습니다", false],
  ["[클립][단츄 마크 운동회] 7스테이지 믿음 - 선수 머독, 오더 민결희 / 민결희 : 쭉쭉빵빵", false],
  ["[클립]이거 무슨 노래예요? - 따린", false],
  ["가수 - 이건 곡명이라기엔 너무너무너무너무너무너무 긴 문장으로 된 잡담 클립 제목입니다", false],
  // 방송 행사·콘텐츠 클립: "가수 - 곡명" 모양이어도 노래가 아니다
  ["[클립][단츄 마크 운동회] 7스테이지 믿음 - 선수 머독, 오더 민결희 2회차", false],
  ["[클립][단츄 마크 운동회] 7스테이지 믿음 - 선수 징버거, 오더 머독", false],
  ["[클립][유플릭스] 집밥니선생 -수미편- 심사위원 참가!", false],
  // 느낌표나 쉼표가 있어도 노래일 수 있다
  ["[클립]쌈성시대 - 힘내!", true],
  ["Lady Gaga, Ariana Grande - Rain On Me", true],
])("looks like a song title: %s → %s", (raw, expected) => {
  expect(looksLikeSongTitle(raw)).toBe(expected);
});

// ── 실제 제목에서 자주 '확인 필요'로 빠지던 형식 ─────────────────────────
const solo = (songTitle: string, originalArtist: string | null = null): Parsed =>
  ({ status: "auto", songTitle, originalArtist, performers: ["따린"] });

test.each<[string, Parsed]>([
  // A. "따린 / 곡명 - 가수"
  ["[클립]따린 / Snowman - Sia", solo("Snowman", "Sia")],
  ["[클립]따린 / 사건의 지평선 - 윤하", solo("사건의 지평선", "윤하")],
  ["[클립]따린 / When I Was Your Man - Bruno Mars | 빵터진 따린이", solo("When I Was Your Man", "Bruno Mars")],
  ["[클립]따린 / Dance Monkey - Tones And I to 빙밍", solo("Dance Monkey", "Tones And I")],
  ["[클립]따린 / 시계태엽 - 임정희 1절", solo("시계태엽", "임정희")],
  // B. 설명 + 따린
  ["나만 듣는다 따린 - 데스노트", solo("데스노트")],
  ["내가 볼려고 딴 따린 - 렛잇고", solo("렛잇고")],
  ["[클립]소나랜드 노래자랑 결승전 따린-금지된사랑", solo("금지된사랑")],
  ["[클립]버튜버 노래자랑) 11번 따린-연", solo("연")],
  // C. 곡명 뒤 "/ 설명"
  ["[클립]따린-이름에게 / 💙 따린 1st 콘서트 [Dear. Friends] 💙", solo("이름에게")],
  ["[클립][백팀 싱크룸]구슬요x양도끼x따린 - 블랙맘바(에스파) / 따린 시점",
    { status: "auto", songTitle: "블랙맘바", originalArtist: "에스파", performers: ["구슬요", "양도끼", "따린"] }],
  // D. "따린 가수 - 곡명"
  ["따린 거미 - 어른아이", solo("어른아이", "거미")],
  ["[클립]따린의 김건모 - 서울의 달", solo("서울의 달", "김건모")],
  ["따린 심규선 - 소로 (小路)", solo("소로", "심규선")],
  // E. "부르는 따린" 꼬리
  ["오대천왕 - 멋진헛간 짧게 불러주는 따린", { status: "review", songTitle: "멋진헛간", originalArtist: null, performers: ["따린"] }],
])("common title form: %s", (raw, expected) => {
  expect(parseTitle(raw)).toMatchObject(expected);
});

test("a singing tail is published when the song is already known", () => {
  expect(parseTitle("오대천왕 - 멋진헛간 짧게 불러주는 따린", undefined, new Set(["멋진헛간"])))
    .toMatchObject(solo("멋진헛간"));
});

test("forms that must stay as they were", () => {
  const partners = new Set(["구슬요"]);
  // 모르는 이름 + 따린은 함께 부른 사람일 수 있다
  expect(parseTitle("가습기 따린 - 숨").status).toBe("review");
  // 아는 사람과의 듀엣
  expect(parseTitle("따린 구슬요 - 8282", partners)).toMatchObject(
    { status: "auto", songTitle: "8282", originalArtist: null, performers: ["따린", "구슬요"] });
  // 듣기만 하는 클립
  expect(parseTitle("[마카오톡]나비 - Daisy 듣는 따린").status).toBe("review");
  // 곡명 안의 붙은 슬래시는 그대로
  expect(parseTitle("따린 - AC/DC").songTitle).toBe("AC/DC");
});

test("'따린/이름' without spaces names a partner, not a song", () => {
  expect(parseTitle("[클립]따린/미르 -Never Enough").status).not.toBe("auto");
});

// 2026-11-22 자동 공개 전 확인(스펙 2026-11-22-clip-verification-design)
test("number-only song from '따린 ○○ -1' is flagged and the guessed artist is not sure", () => {
  const p = parseTitle("따린 놀리기 -1");
  expect(p).toMatchObject({ songTitle: "1", artistSure: false });
  expect(isNumberTitle(p.songTitle!)).toBe(true);
  expect(isNumberTitle("8282")).toBe(false);
  expect(isNumberTitle("Golden")).toBe(false);
});

test.each([
  ["따린 - 취한 줄을 모르고 LIVE", "취한 줄을 모르고"],
  ["따린 - 취한 줄을 모르고 (Live)", "취한 줄을 모르고"],
  ["[클립]따린 - 취한줄을 모르고 많관부", "취한줄을 모르고"],
  ["[클립]따린 - 빅마마 체념 중간부분 지림 ㄷㄷ", "빅마마 체념 중간부분 지림"],
])("tail noise and Live are removed: %s", (raw, song) => {
  expect(parseTitle(raw)).toMatchObject({ status: "auto", songTitle: song });
});

test("date after the artist parentheses is removed", () => {
  expect(parseTitle("[클립] 따린 - 녹턴 (이은미) 260319"))
    .toMatchObject({ status: "auto", songTitle: "녹턴", originalArtist: "이은미", artistSure: true });
});

test.each(["따린&마냥 - Nobody Knows 원본", "따린 - Golden Live 원본", "따린 - ㄷㄷ"])("not a song: %s", (raw) => {
  expect(parseTitle(raw).status).toBe("not_song");
});

test("'곡명 - 가수' on the song side", () => {
  expect(parseTitle("[클립]따린  -  Fallin - Alicia keys"))
    .toMatchObject({ status: "auto", songTitle: "Fallin", originalArtist: "Alicia keys", artistSure: true });
});

test.each([
  ["따린 - 귀로 (나얼)", true],
  ["따린 - Feel Good", false],
  ["[모캡 노래/냐냐x구슬요x따린] 빅뱅 - 붉은노을 [댄스 연출]", true],
  ["[클립]따린의 김건모 - 서울의 달", false],
  ["[로이세끼2] 윤미래 - Memories", true],
] as [string, boolean][])("artistSure: %s", (raw, sure) => {
  expect(parseTitle(raw).artistSure).toBe(sure);
});
