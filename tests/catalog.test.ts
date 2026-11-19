import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs } from "@/db/schema";
import { assignPerformance, findOrCreateSong, guessArtist, refreshPerformance } from "@/server/catalog";
import { createTestDb } from "./helpers/db";
import { insertClip } from "./helpers/factory";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const perfOf = async (no: number) =>
  (await db.select({ p: clips.performanceId }).from(clips).where(eq(clips.titleNo, no)))[0].p;
const perf = async (id: number) => (await db.select().from(performances).where(eq(performances.id, id)))[0];

test("songs are matched by normalized title and compatible artist", async () => {
  const a = await findOrCreateSong(db, "Feel Good", null);
  expect(await findOrCreateSong(db, "feelgood", null)).toBe(a);

  const m = await findOrCreateSong(db, "Memories", null);
  expect(await findOrCreateSong(db, "Memories", "윤미래")).toBe(m);
  const row = (await db.select().from(songs).where(eq(songs.id, m)))[0];
  expect(row.originalArtist).toBe("윤미래");

  const other = await findOrCreateSong(db, "Memories", "다른가수");
  expect(other).not.toBe(m);
  expect((await db.select().from(songs).where(eq(songs.id, other)))[0].slug).toBe("memories-2");
});

test("guessArtist takes the artist of a song with the same title", async () => {
  await findOrCreateSong(db, "Memories", "윤미래");
  expect(await guessArtist(db, "memories")).toBe("윤미래");
  expect(await guessArtist(db, "없는곡")).toBeNull();
});

test("clips within 3 hours of each other form one stage", async () => {
  const s = await findOrCreateSong(db, "Memories", null);
  const a = await insertClip(db, { songId: s, at: "2026-11-17 00:00:00" });
  const b = await insertClip(db, { songId: s, at: "2026-11-17 02:30:00" });
  const c = await insertClip(db, { songId: s, at: "2026-11-17 05:00:00" });
  for (const n of [a, b, c]) await assignPerformance(db, n);
  expect(new Set([await perfOf(a), await perfOf(b), await perfOf(c)]).size).toBe(1);
});

test("clips 4 hours apart, or of different songs, are different stages", async () => {
  const s = await findOrCreateSong(db, "Memories", null);
  const t = await findOrCreateSong(db, "Snowman", null);
  const a = await insertClip(db, { songId: s, at: "2026-11-17 00:00:00" });
  const b = await insertClip(db, { songId: s, at: "2026-11-17 04:00:00" });
  const c = await insertClip(db, { songId: t, at: "2026-11-17 00:00:00" });
  for (const n of [a, b, c]) await assignPerformance(db, n);
  expect(await perfOf(a)).not.toBe(await perfOf(b));
  expect(await perfOf(a)).not.toBe(await perfOf(c));
});

test("refreshPerformance recomputes best clip, count and performers", async () => {
  const s = await findOrCreateSong(db, "붉은노을", null);
  const a = await insertClip(db, { songId: s, at: "2026-11-15 14:00:00", readCnt: 5 });
  const b = await insertClip(db, { songId: s, at: "2026-11-15 14:05:00", readCnt: 37, performers: ["구슬요", "따린"] });
  const c = await insertClip(db, { songId: s, at: "2026-11-15 14:10:00", readCnt: 16 });
  for (const n of [a, b, c]) await assignPerformance(db, n);
  const id = (await perfOf(a))!;
  let p = await perf(id);
  expect(p.bestReadCnt).toBe(37);
  expect(p.bestClipNo).toBe(b);
  expect(p.clipCount).toBe(3);
  expect(new Set(p.performers)).toEqual(new Set(["따린", "구슬요"]));
  expect(p.isDuet).toBe(true);
  expect(p.startedAt.toISOString()).toBe(new Date("2026-11-15T05:00:00Z").toISOString());

  await db.update(clips).set({ status: "gone" }).where(eq(clips.titleNo, b));
  await refreshPerformance(db, id);
  p = await perf(id);
  expect(p.bestReadCnt).toBe(16);
  expect(p.clipCount).toBe(2);
  expect(p.isDuet).toBe(false);
});

// ── 원본 다시보기 기준 무대 묶기 ───────────────────────────────────────
test("clips from the same replay within 10 minutes are one stage even when uploaded hours apart", async () => {
  const s = await findOrCreateSong(db, "Snowman", null);
  const a = await insertClip(db, { songId: s, at: "2026-11-16 04:30:00", sourceVod: 77, seekSec: 1000 });
  const b = await insertClip(db, { songId: s, at: "2026-11-16 14:58:00", sourceVod: 77, seekSec: 1300 });
  for (const n of [a, b]) await assignPerformance(db, n);
  expect(await perfOf(a)).toBe(await perfOf(b));
});

test("same replay but far apart in the replay are different stages even when uploaded close together", async () => {
  const s = await findOrCreateSong(db, "Snowman", null);
  const a = await insertClip(db, { songId: s, at: "2026-11-16 04:30:00", sourceVod: 77, seekSec: 1000 });
  const b = await insertClip(db, { songId: s, at: "2026-11-16 04:40:00", sourceVod: 77, seekSec: 9000 });
  for (const n of [a, b]) await assignPerformance(db, n);
  expect(await perfOf(a)).not.toBe(await perfOf(b));
});
