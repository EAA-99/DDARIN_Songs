import { beforeAll, expect, test } from "vitest";
import type { Db } from "@/db";
import { parseKst } from "@/lib/kst";
import type { SoopClip } from "@/lib/soop";
import { ingestClips, markGone } from "@/server/ingest";
import { artistPage, clipsForPerformances, performanceClips, searchPerformances, songPage, topSongs, topViews } from "@/server/queries";
import { findOrCreateSong } from "@/server/catalog";
import { createTestDb } from "./helpers/db";

let db: Db;
const NOW = parseKst("2026-11-19 10:00:00");
const c = (titleNo: number, title: string, at: string, readCnt: number): SoopClip => ({
  titleNo, title, uploaderNick: `v${titleNo}`, uploaderId: "v", regDate: parseKst(at), readCnt,
  thumbUrl: `https://x/${titleNo}.jpg`, durationMs: 60000,
});

beforeAll(async () => {
  db = await createTestDb();
  await findOrCreateSong(db, "Memories", "윤미래");
  await ingestClips(db, [
    // Memories 솔로 무대(11/17) 클립 3개
    c(1, "따린 - Memories", "2026-11-17 00:30:00", 37),
    c(2, "[클립]따린 - Memories", "2026-11-17 00:31:00", 16),
    c(3, "[클립]memories - 따린님", "2026-11-17 00:32:00", 5),
    // Memories 듀엣 무대(8/2) 클립 2개
    c(4, "[클립]Memories - 구슬요x따린 Cover", "2026-08-02 21:00:00", 20),
    c(5, "[클립]Memories - 구슬요x따린 Cover", "2026-08-02 21:05:00", 3),
    // Feel Good 솔로(11/16)
    c(6, "따린 - Feel Good", "2026-11-16 16:00:00", 130),
    c(7, "[클립][따린]따린-Feel good", "2026-11-16 16:10:00", 10),
    // 붉은노을 3인(11/15)
    c(8, "[개모임 모캡 노래방] 따린 & 구슬요 & 냐냐 - 붉은노을 (빅뱅)", "2026-11-15 14:00:00", 9),
    // Snowman(10/1) — 나중에 SOOP에서 사라짐
    c(9, "따린 - Snowman", "2026-10-01 20:00:00", 50),
    // 확인 필요 / 노래 아님
    c(10, "성시경 - 태양계", "2026-11-18 20:00:00", 999),
    c(11, "[클립]사탕 따는 팁", "2026-11-18 21:00:00", 999),
  ], NOW);
  await markGone(db, new Set(), { from: parseKst("2026-10-01 00:00:00"), to: parseKst("2026-10-01 23:59:59") });
});

const titles = (rows: { songTitle: string; startedAt: Date }[]) =>
  rows.map((r) => `${r.songTitle}@${r.startedAt.toISOString().slice(0, 10)}`);

test("search ignores case and spaces", async () => {
  const a = await searchPerformances(db, { q: "feel good" });
  const b = await searchPerformances(db, { q: "FEELGOOD" });
  expect(titles(a.rows)).toEqual(["Feel Good@2026-11-16"]);
  expect(titles(b.rows)).toEqual(titles(a.rows));
});

test("search by original artist and by partner", async () => {
  expect((await searchPerformances(db, { q: "윤미래" })).rows).toHaveLength(2);
  const p = await searchPerformances(db, { q: "구슬요" });
  expect(p.rows.every((r) => r.isDuet)).toBe(true);
  expect(p.rows.map((r) => r.songTitle).sort()).toEqual(["Memories", "붉은노을"]);
});

test("filters and sorts", async () => {
  const solo = await searchPerformances(db, { type: "solo" });
  expect(solo.rows.every((r) => !r.isDuet)).toBe(true);
  expect(solo.total).toBe(2);
  const views = await searchPerformances(db, { sort: "views" });
  expect(views.rows.map((r) => r.best.readCnt)).toEqual([130, 37, 20, 9]);
  const latest = await searchPerformances(db, { sort: "latest" });
  expect(titles(latest.rows)).toEqual(["Memories@2026-11-16", "Feel Good@2026-11-16", "붉은노을@2026-11-15", "Memories@2026-08-02"]);
});

test("review, not_song and gone never show", async () => {
  const all = await searchPerformances(db, {});
  expect(all.total).toBe(4);
  expect(all.rows.map((r) => r.songTitle)).not.toContain("태양계");
  expect(all.rows.map((r) => r.songTitle)).not.toContain("Snowman");
});

test("stage rows carry best clip, count and links", async () => {
  const [m] = (await searchPerformances(db, { q: "memories", type: "solo" })).rows;
  expect(m.clipCount).toBe(3);
  expect(m.best).toMatchObject({ titleNo: 1, readCnt: 37, thumbUrl: "https://x/1.jpg" });
  expect(m.artist).toBe("윤미래");
  expect(m.songSlug).toBe("memories");
  const list = await performanceClips(db, m.id);
  expect(list.map((x) => x.readCnt)).toEqual([37, 16, 5]);
});

test("rankings", async () => {
  const week = await topViews(db, "week", NOW);
  expect(week.map((r) => r.songTitle)).toEqual(["Feel Good", "Memories"]);
  expect((await topViews(db, "month", NOW))).toHaveLength(3);
  expect((await topViews(db, "all", NOW))).toHaveLength(4);
  const songsTop = await topSongs(db);
  expect(songsTop[0]).toMatchObject({ title: "Memories", performances: 2 });
});

test("song page", async () => {
  const s = await songPage(db, "memories", "latest");
  expect(s?.song).toMatchObject({ title: "Memories", artist: "윤미래" });
  expect(s?.performances).toHaveLength(2);
  expect(s?.clipCount).toBe(5);
  expect(await songPage(db, "nope", "latest")).toBeNull();
});

test("artist page by original artist and by partner", async () => {
  const yun = await artistPage(db, "윤미래");
  expect(yun?.asOriginal.map((s) => [s.title, s.performances])).toEqual([["Memories", 2]]);
  expect(yun?.asPartner).toEqual([]);
  const gu = await artistPage(db, "구슬요");
  expect(gu?.asOriginal).toEqual([]);
  expect(gu?.asPartner.map((r) => r.songTitle).sort()).toEqual(["Memories", "붉은노을"]);
  expect(await artistPage(db, "없는사람")).toBeNull();
});

test("clips for many stages in one query", async () => {
  const { rows } = await searchPerformances(db, {});
  const map = await clipsForPerformances(db, rows.map((r) => r.id));
  const memA = rows.find((r) => r.songTitle === "Memories" && !r.isDuet)!;
  expect(map.get(memA.id)!.map((x) => x.readCnt)).toEqual([37, 16, 5]);
  expect([...map.values()].flat()).toHaveLength(8);
  expect((await clipsForPerformances(db, [])).size).toBe(0);
});
