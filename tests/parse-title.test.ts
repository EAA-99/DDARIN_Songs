import { expect, test } from "vitest";
import { parseTitle, type Parsed } from "@/lib/parse-title";

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
  expect(parseTitle(raw)).toEqual(expected);
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
  expect(parseTitle(raw)).toEqual(expected);
});

test("names separated only by spaces", () => {
  const partners = new Set(["구슬요", "냐냐"]);
  expect(parseTitle("[클립][따린]따린 구슬요 냐냐-붉은 노을", partners))
    .toEqual({ status: "auto", songTitle: "붉은 노을", originalArtist: null, performers: ["따린", "구슬요", "냐냐"] });
  expect(parseTitle("[클립]구슬요 따린 - 지것대", partners).status).toBe("auto");
  // 모르는 이름이 섞이면 확인 필요
  expect(parseTitle("[클립][따린]따린 구슬요 냐냐-붉은 노을").status).toBe("review");
});

test("filler words after 따린 are ignored", () => {
  expect(parseTitle("따린 노래방 - Lucky (Jason Mraz)"))
    .toEqual({ status: "auto", songTitle: "Lucky", originalArtist: "Jason Mraz", performers: ["따린"] });
  expect(parseTitle("[클립]따린의 김건모 - 서울의 달").status).toBe("review");
});

test("date tail is removed before reading the artist", () => {
  expect(parseTitle("🐶 [개모임 모캡합방] 따린 - 안동역에서 (진성)_26.11.06"))
    .toEqual({ status: "auto", songTitle: "안동역에서", originalArtist: "진성", performers: ["따린"] });
});
